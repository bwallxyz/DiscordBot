// Room creation & management service
const { ChannelType } = require('discord.js');
const logger = require('../utils/logger');
const Room = require('../models/Room');
const PermissionService = require('./PermissionService');
const { getGuildConfig } = require('../database/schemas/guildConfig');

class RoomService {
  constructor(client) {
    this.client = client;
    this.permissionService = new PermissionService();
  }
  
  /**
   * Handle potential room creation when a user joins a voice channel
   */
  async handlePotentialRoomCreation(oldState, newState) {
    const { guild, member, channelId } = newState;
    
    try {
      // Get guild configuration
      const guildConfig = await getGuildConfig(guild.id);
      
      // If no configuration or channelId isn't creation channel, ignore
      if (!guildConfig || !guildConfig.creationChannelId || channelId !== guildConfig.creationChannelId) {
        return;
      }
      
      // Check if user already has a room
      const existingRoom = await Room.findOne({ guildId: guild.id, ownerId: member.id });
      
      if (existingRoom) {
        // User already has a room, check if the channel still exists
        const existingChannel = guild.channels.cache.get(existingRoom.channelId);
        if (existingChannel) {
          // Move them to their existing room instead of creating a new one
          logger.info(`User ${member.user.tag} already has a room. Moving them to existing room ${existingRoom.name}`);
          await member.voice.setChannel(existingChannel);
          return;
        } else {
          // Channel doesn't exist anymore, so delete the room entry
          logger.info(`User ${member.user.tag} had a room in DB but channel doesn't exist. Removing old entry.`);
          await Room.deleteOne({ _id: existingRoom._id });
        }
      }
      
      // This flow is now primarily used as a backup
      const room = await this.createRoomForUser(member, guildConfig);
      
      // Move the user to their new room - this may be delayed due to Discord API
      // and might require another event to trigger it
      if (room && room.channelId) {
        const channel = guild.channels.cache.get(room.channelId);
        if (channel && member.voice.channelId === guildConfig.creationChannelId) {
          await member.voice.setChannel(channel).catch(err => {
            logger.error(`Error moving user to new room: ${err.message}`);
          });
        }
      }
    } catch (error) {
      logger.error(`Error creating room for user ${member?.user?.tag}:`, error);
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
    const { channel, channelId } = oldState;
    
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
}

module.exports = RoomService;