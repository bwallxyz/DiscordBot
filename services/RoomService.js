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
      
      // Create a new room for the user
      await this.createRoomForUser(member, guildConfig);
    } catch (error) {
      logger.error(`Error creating room for user ${member?.user?.tag}:`, error);
    }
  }
  
  /**
   * Handle potential room deletion when a voice channel becomes empty
   */
  async handlePotentialRoomDeletion(oldState, newState) {
    const { channel, channelId } = oldState;
    
    try {
      // Check if channel is empty and is a user-created room
      const room = await Room.findOne({ channelId });
      
      if (room && channel.members.size === 0) {
        // Delete the room
        await this.deleteRoom(room, channel);
      }
    } catch (error) {
      logger.error(`Error handling potential room deletion for channel ${channelId}:`, error);
    }
  }
  
  /**
   * Create a new room for a user
   */
  async createRoomForUser(member, guildConfig) {
    const { guild } = member;
    
    try {
      // Create a new voice channel
      const roomName = `${member.displayName}'s Room`;
      
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
      
      // Move the user to their new room
      await member.voice.setChannel(channel);
      
      // Send welcome message to the user
      this.sendWelcomeMessage(member, roomName);
      
      logger.info(`Created room "${roomName}" for ${member.user.tag}`);
      return room;
    } catch (error) {
      logger.error(`Error creating room for ${member.user.tag}:`, error);
      throw error;
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