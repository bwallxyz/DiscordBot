// Voice state update event handler with enhanced state tracking
const logger = require('../utils/logger');
const RoomService = require('../services/RoomService');
const ActivityTrackerService = require('../services/ActivityTrackerService');
const { UserStateTrackerService } = require('../services/UserStateTrackerService');
const PermissionService = require('../services/PermissionService');
const AuditLogService = require('../services/AuditLogService');
const { getGuildConfig } = require('../database/schemas/guildConfig');
const Room = require('../models/Room');

// Create a singleton instance for state tracking
const stateTracker = new UserStateTrackerService();

module.exports = {
  async execute(client, oldState, newState) {
    try {
      // Initialize services
      const roomService = new RoomService(client);
      const activityTracker = new ActivityTrackerService(client);
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      
      // Track user activity for this voice state change
      await activityTracker.handleVoiceStateUpdate(oldState, newState);
      
      // Handle user leaving a room
      if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
        // User left a voice channel or switched channels
        const oldChannel = oldState.channel;
        
        if (oldChannel) {
          // Check if this channel is a user-created room
          const room = await Room.findOne({ channelId: oldState.channelId });
          
          if (room) {
            // IMPORTANT: We no longer automatically clear mute states when leaving
            // This allows the mute to persist when they rejoin
            
            // Only unmute them from the voice channel itself (server mute)
            // but keep the permission overwrite and state tracking
            if (oldState.member.voice.serverMute) {
              try {
                await oldState.member.voice.setMute(false, 'Temporary unmute (user left room)');
                logger.info(`Reset server mute for ${oldState.member.user.tag} after leaving room ${oldState.channel.name}, but kept mute state`);
              } catch (err) {
                logger.error(`Failed to temporarily unmute user ${oldState.member.user.tag} when leaving room: ${err.message}`);
              }
            }
            
            // Only handle BAN states when leaving (we want to keep MUTE states)
            const userStates = await stateTracker.getUserStatesInRoom(
              oldState.guild.id,
              oldState.member.id,
              oldState.channelId
            );
            
            // Process ban states to clean up
            for (const state of userStates) {
              if (state.state === 'BANNED') {
                // We'll keep the ban state for now too
                logger.info(`Keeping ban state for user ${oldState.member.user.tag} in room ${oldChannel.name}`);
              }
            }
          }
        }
      }
      
      // Handle user joining a room or channel
      if (newState.channelId) {
        const guildConfig = await getGuildConfig(newState.guild.id);
        
        // Handle creation channel separately
        if (guildConfig && guildConfig.creationChannelId && newState.channelId === guildConfig.creationChannelId) {
          logger.info(`User ${newState.member.user.tag} joined creation channel, creating a room`);
          
          // Create room and immediately move the user
          const roomResult = await roomService.createRoomForUserImmediate(newState.member, guildConfig);
          
          if (roomResult && roomResult.success) {
            logger.info(`Successfully created room and moved user ${newState.member.user.tag}`);
            // Skip the normal room creation handler since we already handled it
            return;
          }
        } else {
          // Handle room creation through the normal flow for other cases
          await roomService.handlePotentialRoomCreation(oldState, newState);
        }
        
        // Check if the user is joining a room they're banned from
        // Or if they need to be muted based on previous state
        if (newState.channel) {
          const room = await Room.findOne({ channelId: newState.channelId });
          
          if (room) {
            // Check for ban state
            const isBanned = await stateTracker.hasUserState({
              guildId: newState.guild.id,
              userId: newState.member.id,
              roomId: newState.channelId,
              state: 'BANNED'
            });
            
            if (isBanned) {
              // User is banned from this room, remove them
              logger.info(`User ${newState.member.user.tag} tried to join a room they are banned from, removing them`);
              
              try {
                // Move them to the AFK channel or disconnect them
                const afkChannel = newState.guild.afkChannel;
                if (afkChannel) {
                  await newState.member.voice.setChannel(afkChannel);
                } else {
                  await newState.member.voice.disconnect();
                }
                
                // Notify the user
                await newState.member.send(`You are banned from ${newState.channel.name}.`).catch(() => {});
              } catch (error) {
                logger.error(`Error removing banned user from room:`, error);
              }
              return; // Stop processing after handling ban
            }
            
            // Check for mute state to reapply it
            const isMuted = await stateTracker.hasUserState({
              guildId: newState.guild.id,
              userId: newState.member.id,
              roomId: newState.channelId,
              state: 'MUTED'
            });
            
            if (isMuted) {
              try {
                // Apply both permission overwrites and server mute
                await permissionService.muteUser(newState.channel, newState.member.id);
                
                // Also explicitly set server mute
                if (!newState.member.voice.serverMute) {
                  await newState.member.voice.setMute(true, 'Reapplying mute state from database');
                }
                
                logger.info(`Reapplied mute to ${newState.member.user.tag} when rejoining room ${newState.channel.name}`);
              } catch (error) {
                logger.error(`Error reapplying mute to user when joining:`, error);
              }
            }
          }
        }
      }
      
      // Handle room deletion when a room becomes empty
      if (oldState.channelId && oldState.channel) {
        await roomService.handlePotentialRoomDeletion(oldState, newState);
      }
    } catch (error) {
      logger.error('Error handling voice state update:', error);
    }
  }
};