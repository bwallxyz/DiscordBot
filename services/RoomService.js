// Enhanced Room creation & management service with state tracking
const { ChannelType } = require('discord.js');
const logger = require('../utils/logger');
const Room = require('../models/Room');
const PermissionService = require('./PermissionService');
const AuditLogService = require('./AuditLogService');
const { UserStateTrackerService } = require('../services/UserStateTrackerService'); // Fixed import path
const { getGuildConfig } = require('../database/schemas/guildConfig');

class RoomService {
  constructor(client) {
    this.client = client;
    this.permissionService = new PermissionService();
    this.auditLogService = new AuditLogService(client);
    this.stateTracker = new UserStateTrackerService();
  }
  
/**
   * Handle potential room deletion when a voice channel becomes empty
   */
async handlePotentialRoomDeletion(oldState, newState) {
  const { channel, channelId, guild } = oldState;
  
  try {
    // Check if channel is empty and is a user-created room
    if (!channelId || !channel) {
      return;
    }
    
    // Using try-catch specifically around the findOne operation
    let room;
    try {
      room = await Room.findOne({ channelId });
    } catch (findError) {
      logger.error(`Error finding room for channel ${channelId}:`, findError);
      return;
    }
    
    if (room && channel.members.size === 0) {
      // Check if the room is marked as permanent
      if (room.isPermanent) {
        logger.info(`Room ${room.name} (${channelId}) is empty but marked as permanent, not deleting`);
        return;
      }
      
      // Get guild config to check auto-delete setting
      const guildConfig = await getGuildConfig(guild.id).catch(() => null);
      
      // If auto-delete is disabled in guild config, don't delete
      if (guildConfig && guildConfig.autoDeleteEmptyRooms === false) {
        logger.info(`Auto-delete empty rooms is disabled for guild ${guild.id}, not deleting room ${room.name}`);
        return;
      }
      
      // Delete the room
      logger.info(`Deleting empty room ${room.name} (${channelId})`);
      
      // Log the room deletion to audit log before deleting the room
      await this.auditLogService.logRoomDeletion(guild, room);
      
      await this.deleteRoom(room, channel);
    }
  } catch (error) {
    logger.error(`Error handling potential room deletion for channel ${channelId}:`, error);
  }
}
  
  /**
   * Create a room and immediately move the user - direct function that's executed immediately
   * when a user joins the creation channel, avoiding any race conditions
   */
  async createRoomForUserImmediate(member, guildConfig) {
    try {
      const guild = member.guild;
      
      logger.info(`Attempting immediate room creation for ${member.user.tag}`);
      
      // Check if user already has a room first
      const existingRoom = await Room.findOne({ guildId: guild.id, ownerId: member.id });
      
      if (existingRoom) {
        // User already has a room, check if the channel still exists
        const existingChannel = guild.channels.cache.get(existingRoom.channelId);
        if (existingChannel) {
          // Move them to their existing room instead of creating a new one
          logger.info(`[IMMEDIATE] User ${member.user.tag} already has a room. Moving them to existing room ${existingRoom.name}`);
          await member.voice.setChannel(existingChannel);
          return { success: true, newRoom: false };
        } else {
          // Channel doesn't exist anymore, so delete the room entry
          logger.info(`[IMMEDIATE] User ${member.user.tag} had a room in DB but channel doesn't exist. Removing old entry.`);
          await Room.deleteOne({ _id: existingRoom._id });
        }
      }
      
      // Format room name
      const roomName = guildConfig.roomPrefix 
        ? `${guildConfig.roomPrefix} ${member.displayName}'s Room` 
        : `${member.displayName}'s Room`;
      
      logger.info(`[IMMEDIATE] Creating new room "${roomName}" for ${member.user.tag}`);
      
      // Create the channel
      const channel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: guildConfig.roomCategoryId || null,
        permissionOverwrites: this.permissionService.getRoomCreationPermissions(guild, member)
      });
      
      // Save room to database
      const room = new Room({
        guildId: guild.id,
        channelId: channel.id,
        ownerId: member.id,
        name: roomName,
        createdAt: new Date()
      });
      
      await room.save();
      
      // Log the room creation to audit log
      await this.auditLogService.logRoomCreation(guild, member, {
        id: channel.id,
        name: roomName,
        channelId: channel.id
      });
      
      // IMPORTANT: Immediately move the user to their new room
      logger.info(`[IMMEDIATE] Moving ${member.user.tag} to their new room ${channel.id}`);
      await member.voice.setChannel(channel);
      
      // Send welcome message to the user
      this.sendWelcomeMessage(member, roomName);
      
      logger.info(`[IMMEDIATE] Room creation complete for "${roomName}"`);
      return { success: true, newRoom: true };
    } catch (error) {
      logger.error(`Error in immediate room creation for ${member?.user?.tag}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Create a new room for a user
   */
  async createRoomForUser(member, guildConfig) {
    const { guild } = member;
    
    try {
      // Format room name
      const roomName = guildConfig.roomPrefix 
        ? `${guildConfig.roomPrefix} ${member.displayName}'s Room` 
        : `${member.displayName}'s Room`;
      
      logger.info(`Creating new room "${roomName}" for ${member.user.tag}`);
      
      const channel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: guildConfig.roomCategoryId || null,
        permissionOverwrites: this.permissionService.getRoomCreationPermissions(guild, member)
      });
      
      // Save room to database
      const room = new Room({
        guildId: guild.id,
        channelId: channel.id,
        ownerId: member.id,
        name: roomName,
        createdAt: new Date()
      });
      
      await room.save();
      
      // Log the room creation to audit log
      await this.auditLogService.logRoomCreation(guild, member, {
        id: channel.id,
        name: roomName,
        channelId: channel.id
      });
      
      // Send welcome message to the user
      this.sendWelcomeMessage(member, roomName);
      
      logger.info(`Room creation complete for "${roomName}"`);
      return room;
    } catch (error) {
      logger.error(`Error creating room for ${member.user.tag}:`, error);
      throw error;
    }
  }
  
  /**
   * Handle potential room deletion when a voice channel becomes empty
   */
  async handlePotentialRoomDeletion(oldState, newState) {
    const { channel, channelId, guild } = oldState;
    
    try {
      // Check if channel is empty and is a user-created room
      if (!channelId || !channel) {
        return;
      }
      
      // Using try-catch specifically around the findOne operation
      let room;
      try {
        room = await Room.findOne({ channelId });
      } catch (findError) {
        logger.error(`Error finding room for channel ${channelId}:`, findError);
        return;
      }
      
      if (room && channel.members.size === 0) {
        // Delete the room
        logger.info(`Deleting empty room ${room.name} (${channelId})`);
        
        // Log the room deletion to audit log before deleting the room
        await this.auditLogService.logRoomDeletion(guild, room);
        
        await this.deleteRoom(room, channel);
      }
    } catch (error) {
      logger.error(`Error handling potential room deletion for channel ${channelId}:`, error);
    }
  }
  
  /**
   * Delete a room
   */
  async deleteRoom(room, channel) {
    try {
      // Clear all room states first
      await this.stateTracker.clearAllStatesForRoom(room.guildId, room.channelId);
      logger.info(`Cleared all user states for room ${room.name} (${room.channelId})`);
      
      // Delete channel first
      if (channel) {
        await channel.delete();
      }
      
      // Then remove from database
      await Room.deleteOne({ _id: room._id });
      
      logger.info(`Deleted room "${room.name}" (${room.channelId})`);
    } catch (error) {
      logger.error(`Error deleting room ${room.channelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Send welcome message to new room owner
   */
  sendWelcomeMessage(member, roomName) {
    member.send(
      `Your room "${roomName}" has been created! You can use the following commands:\n` +
      `• /mute @user - Mute a user in your room\n` +
      `• /unmute @user - Unmute a user in your room\n` +
      `• /kick @user - Kick a user from your room\n` +
      `• /ban @user - Ban a user from your room\n` +
      `• /unban @user - Unban a user from your room\n` +
      `• /lock - Lock your room to prevent new users from joining\n` +
      `• /unlock - Unlock your room to allow users to join\n` +
      `• /rename name - Rename your room`
    ).catch(() => {
      logger.warn(`Could not DM user ${member.user.tag}`);
    });
  }
  
  /**
   * Check if a user is the owner of a room
   */
  async isRoomOwner(channelId, userId) {
    const room = await Room.findOne({ channelId });
    return room && room.ownerId === userId;
  }
  
  /**
   * Get moderation statistics for a room
   */
  async getRoomModerationStats(channelId) {
    try {
      const room = await Room.findOne({ channelId });
      
      if (!room) {
        return null;
      }
      
      return await this.stateTracker.getRoomModerationStats(room.guildId, channelId);
    } catch (error) {
      logger.error(`Error getting room moderation stats:`, error);
      throw error;
    }
  }
}

module.exports = RoomService;