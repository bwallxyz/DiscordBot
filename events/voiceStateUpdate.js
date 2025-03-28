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
            // IMPORTANT: When leaving, we need to:
            // 1. Reset server mute (but not permission overwrites)
            // 2. Keep the state in the database for when they rejoin
            
            // Only remove the server mute when leaving the channel
            // but keep the permission overwrite and state tracking
            if (oldState.member.voice.serverMute) {
              try {
                // This doesn't remove the state from tracking or database
                await oldState.member.voice.setMute(false, 'Temporary unmute (user left room)');
                logger.info(`Reset server mute for ${oldState.member.user.tag} after leaving room ${oldState.channel.name}, but kept mute state`);
              } catch (err) {
                logger.error(`Failed to temporarily unmute user ${oldState.member.user.tag} when leaving room: ${err.message}`);
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
        
        // This is the important section to fix:
        // When a user joins a room, check if they should be muted based on room-specific settings
        if (newState.channel) {
          // Check if this is a user-created room
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
            
            // Check for mute state SPECIFICALLY in this room
            const isMuted = await stateTracker.hasUserState({
              guildId: newState.guild.id,
              userId: newState.member.id,
              roomId: newState.channelId,
              state: 'MUTED'
            });
            
            // New approach: Check if user is in the mutedUsers array for this specific room
            const isInMutedArray = room.mutedUsers && 
                                 room.mutedUsers.some(mutedUser => mutedUser.userId === newState.member.id);
            
            // If tracked state and room mutedUsers array agree that the user should be muted
            if (isMuted || isInMutedArray) {
              try {
                // Apply both permission overwrites and server mute
                await permissionService.muteUser(newState.channel, newState.member.id);
                
                // Also explicitly set server mute
                if (!newState.member.voice.serverMute) {
                  await newState.member.voice.setMute(true, 'Reapplying mute state from database');
                }
                
                logger.info(`Reapplied mute to ${newState.member.user.tag} when joining room ${newState.channel.name}`);
              } catch (error) {
                logger.error(`Error reapplying mute to user when joining:`, error);
              }
            } else {
              // If not muted in this room, ensure they are not server muted (fix for persistent mutes)
              if (newState.member.voice.serverMute) {
                try {
                  await newState.member.voice.setMute(false, 'Removing incorrect mute state');
                  logger.info(`Removed incorrect mute from ${newState.member.user.tag} when joining room ${newState.channel.name}`);
                } catch (error) {
                  logger.error(`Error removing incorrect mute state: ${error.message}`);
                }
              }
              
              // Also clear any Speak permission overwrites if they exist but shouldn't
              try {
                const currentOverwrites = newState.channel.permissionOverwrites.cache.get(newState.member.id);
                if (currentOverwrites && currentOverwrites.deny.has('Speak')) {
                  await newState.channel.permissionOverwrites.edit(newState.member.id, {
                    Speak: null
                  });
                  logger.info(`Removed incorrect Speak permission overwrite from ${newState.member.user.tag}`);
                }
              } catch (overwriteError) {
                logger.error(`Error removing incorrect permission overwrite: ${overwriteError.message}`);
              }
            }
          } else {
            // Not a user-created room, ensure no incorrect mutes are applied
            if (newState.member.voice.serverMute) {
              try {
                // This is not a tracked room, so remove any server mutes
                await newState.member.voice.setMute(false, 'Removing mute in non-tracked room');
                logger.info(`Removed mute from ${newState.member.user.tag} when joining non-tracked room ${newState.channel.name}`);
              } catch (error) {
                logger.error(`Error removing mute in non-tracked room: ${error.message}`);
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

// Handle server mute/unmute actions from Discord's UI
if (oldState.channelId && newState.channelId && 
    oldState.channelId === newState.channelId && 
    oldState.serverMute !== newState.serverMute) {
  
  try {
    // Get the room to check if it's user-created and who the owner is
    const room = await Room.findOne({ channelId: newState.channelId });
    
    if (room) {
      // Get the guild audit logs to determine who performed the action
      const auditLogs = await newState.guild.fetchAuditLogs({
        limit: 1,
        type: newState.serverMute ? 24 : 25 // 24: MEMBER_UPDATE, 25: MEMBER_ROLE_UPDATE
      });
      
      const auditEntry = auditLogs.entries.first();
      
      // Only process if we can determine who did it and it happened recently (last 5 seconds)
      if (auditEntry && 
          (Date.now() - auditEntry.createdAt) < 5000 && 
          auditEntry.target.id === newState.member.id) {
        
        // Get the moderator who performed the action
        const moderator = await newState.guild.members.fetch(auditEntry.executor.id);
        
        // Check if the moderator is the room owner or a sub-moderator
        const isRoomOwner = moderator.id === room.ownerId;
        const isSubMod = room.submoderators && room.submoderators.includes(moderator.id);
        
        // Only sync state if the room owner or a sub-mod did the muting
        if (isRoomOwner || isSubMod) {
          const stateTracker = new UserStateTrackerService();
          const auditLogService = new AuditLogService(client);
          
          if (newState.serverMute) {
            // User was muted via Discord UI
            logger.info(`User ${newState.member.user.tag} was server-muted in room ${room.name} by ${isRoomOwner ? 'room owner' : 'sub-mod'} ${moderator.user.tag}`);
            
            // Make sure target is not the owner if a sub-mod is doing the muting
            if (isSubMod && !isRoomOwner && newState.member.id === room.ownerId) {
              // Sub-mod tried to mute the owner, undo the mute
              await newState.member.voice.setMute(false, 'Prevented sub-mod from muting room owner');
              logger.warn(`Prevented sub-mod ${moderator.user.tag} from muting room owner in ${room.name}`);
              
              // Try to notify the sub-mod
              try {
                await moderator.send(`You cannot mute the room owner in room "${room.name}". The mute has been automatically removed.`);
              } catch (dmError) {
                logger.warn(`Could not send DM to sub-mod ${moderator.user.tag}`);
              }
              return;
            }
            
            // Sub-mod tried to mute another sub-mod
            if (isSubMod && !isRoomOwner && room.submoderators.includes(newState.member.id)) {
              // Undo the mute
              await newState.member.voice.setMute(false, 'Prevented sub-mod from muting another sub-mod');
              logger.warn(`Prevented sub-mod ${moderator.user.tag} from muting another sub-mod in ${room.name}`);
              
              // Try to notify the sub-mod
              try {
                await moderator.send(`You cannot mute other sub-moderators in room "${room.name}". The mute has been automatically removed.`);
              } catch (dmError) {
                logger.warn(`Could not send DM to sub-mod ${moderator.user.tag}`);
              }
              return;
            }
            
            // Track the muted state
            await stateTracker.trackMutedUser({
              guildId: newState.guild.id,
              userId: newState.member.id,
              roomId: newState.channelId,
              appliedBy: moderator.id,
              reason: 'Muted via Discord context menu'
            });
            
            // Add to audit logs
            await auditLogService.logUserMute(
              newState.guild,
              moderator,
              newState.member,
              {
                id: newState.channelId,
                name: room.name,
                channelId: newState.channelId
              },
              'Muted via Discord context menu'
            );
          } else {
            // User was unmuted via Discord UI
            logger.info(`User ${newState.member.user.tag} was server-unmuted in room ${room.name} by ${isRoomOwner ? 'room owner' : 'sub-mod'} ${moderator.user.tag}`);
            
            // Check if user was previously tracked as muted
            const isMuted = await stateTracker.hasUserState({
              guildId: newState.guild.id,
              userId: newState.member.id,
              roomId: newState.channelId,
              state: 'MUTED'
            });
            
            if (isMuted) {
              // Remove the muted state
              await stateTracker.removeUserState({
                guildId: newState.guild.id,
                userId: newState.member.id,
                roomId: newState.channelId,
                state: 'MUTED'
              });
              
              // Add to audit logs
              await auditLogService.logUserUnmute(
                newState.guild,
                moderator,
                newState.member,
                {
                  id: newState.channelId,
                  name: room.name,
                  channelId: newState.channelId
                },
                'Unmuted via Discord context menu'
              );
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error handling Discord server mute/unmute:`, error);
  }
}
  }
};