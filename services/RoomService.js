// Enhanced Room service with room creation and management
const { ChannelType, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../utils/logger');
const Room = require('../models/Room');
const PermissionService = require('./PermissionService');
const AuditLogService = require('./AuditLogService');

class RoomService {
  constructor(client) {
    this.client = client;
    this.permissionService = new PermissionService();
    this.auditLogService = new AuditLogService(client);
  }
  
  /**
   * Check if a user is the owner of a room
   * @param {String} channelId - Channel ID to check
   * @param {String} userId - User ID to check
   * @returns {Promise<Boolean>} Whether the user is the room owner
   */
  async isRoomOwner(channelId, userId) {
    const room = await Room.findOne({ channelId });
    return room && room.ownerId === userId;
  }
  
  /**
   * Get rooms owned by a user
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @returns {Promise<Array>} Room documents
   */
  async getRoomsByOwner(guildId, userId) {
    return await Room.find({ guildId, ownerId: userId });
  }

  /**
   * Get temporary rooms owned by a user
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @returns {Promise<Array>} Temporary room documents
   */
  async getTemporaryRoomsByOwner(guildId, userId) {
    return await Room.find({ guildId, ownerId: userId, isPermanent: false });
  }
  
  /**
   * Create a room for a user immediately and move them to it
   * @param {Object} member - Discord guild member
   * @param {Object} guildConfig - Guild configuration
   * @returns {Promise<Object>} Result of room creation
   */
  async createRoomForUserImmediate(member, guildConfig) {
    try {
      // Check if member has any temporary rooms
      const temporaryRooms = await this.getTemporaryRoomsByOwner(member.guild.id, member.id);
      
      if (temporaryRooms.length > 0) {
        // Try to move them to their existing temporary room instead
        const existingRoom = temporaryRooms[0];
        const channel = member.guild.channels.cache.get(existingRoom.channelId);
        
        if (channel) {
          await member.voice.setChannel(channel);
          
          // Send a notification in the channel about being moved to existing room
          const moveEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🔄 Moved to Existing Room')
            .setDescription(`${member} has been moved to their existing room.`)
            .addFields(
              { name: 'Temporary Room Limit', value: `You can only have 1 temporary room at a time. Get an admin to make your room permanent to create more.` }
            )
            .setTimestamp();
            
          await channel.send({ embeds: [moveEmbed] });
          
          return {
            success: true,
            moved: true,
            room: existingRoom,
            message: 'Moved to existing temporary room'
          };
        }
      }
      
      // Get the room category
      const category = member.guild.channels.cache.get(guildConfig.roomCategoryId);
      
      if (!category) {
        return {
          success: false,
          error: 'Room category not found'
        };
      }
      
      // Create a room name
      const prefix = guildConfig.roomPrefix || '';
      const roomName = `${prefix}${member.displayName}'s Room`;
      
      // Create the channel
      const channel = await member.guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: category,
        permissionOverwrites: this.permissionService.getRoomCreationPermissions(member.guild, member)
      });
      
      // Create room in database
      const room = new Room({
        guildId: member.guild.id,
        channelId: channel.id,
        ownerId: member.id,
        name: roomName,
        isPermanent: false // Set as temporary by default
      });
      
      await room.save();
      
      // Move the user to the new room
      await member.voice.setChannel(channel);
      
      // Send a welcome message in the channel
      const welcomeEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🎉 Room Created')
        .setDescription(`Welcome to your new voice room, ${member}!`)
        .addFields(
          { name: 'Room Name', value: roomName, inline: true },
          { name: 'Type', value: 'Temporary Room', inline: true },
          { name: 'Room Limits', value: 'You can only have 1 temporary room at a time.', inline: false },
          { name: 'Available Commands', value: 
            '• `/rename` - Change the room name\n' +
            '• `/limit` - Set a user limit\n' +
            '• `/transfer` - Transfer ownership\n' +
            '• `/mute`, `/unmute` - Manage user voice permissions\n' +
            '• `/kick`, `/ban`, `/unban` - Manage access\n' +
            '• `/lock`, `/unlock` - Control room access'
          }
        )
        .setFooter({ text: `This room will be deleted when empty` })
        .setTimestamp();
      
      await channel.send({ embeds: [welcomeEmbed] });
      
      // Log the room creation
      await this.auditLogService.logRoomCreation(member.guild, member, {
        id: channel.id,
        name: roomName,
        channelId: channel.id
      });
      
      logger.info(`Created room ${roomName} for ${member.user.tag}`);
      
      return {
        success: true,
        room,
        channel
      };
    } catch (error) {
      logger.error(`Error creating room for user:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Handle potential room creation (when a user joins the creation channel)
   * @param {Object} oldState - Previous voice state
   * @param {Object} newState - Current voice state
   */
  async handlePotentialRoomCreation(oldState, newState) {
    try {
      const member = newState.member;
      
      // Skip if not a guild member or a bot
      if (!member || member.user.bot) return;
      
      // Get guild config
      const guildConfig = await require('../database/schemas/guildConfig').getGuildConfig(newState.guild.id);
      
      // Check if user joined the creation channel
      if (guildConfig && 
          guildConfig.creationChannelId &&
          newState.channelId === guildConfig.creationChannelId &&
          oldState.channelId !== guildConfig.creationChannelId) {
        
        // Create a room for the user
        await this.createRoomForUserImmediate(member, guildConfig);
      }
    } catch (error) {
      logger.error(`Error handling potential room creation:`, error);
    }
  }
  
  /**
   * Handle potential room deletion (when a room becomes empty)
   * @param {Object} oldState - Previous voice state
   * @param {Object} newState - Current voice state
   */
  async handlePotentialRoomDeletion(oldState, newState) {
    try {
      const channel = oldState.channel;
      
      // Skip if no channel
      if (!channel) return;
      
      // Check if this is a user-created room
      const room = await Room.findOne({ channelId: channel.id });
      
      if (!room) return;
      
      // Get guild config
      const guildConfig = await require('../database/schemas/guildConfig').getGuildConfig(oldState.guild.id);
      
      // Check if auto-delete is enabled
      if (guildConfig && guildConfig.autoDeleteEmptyRooms) {
        // Check if the room is empty
        if (channel.members.size === 0) {
          // Don't delete permanent rooms
          if (room.isPermanent) {
            logger.info(`Room ${room.name} is empty but permanent, not deleting`);
            return;
          }
          
          try {
            // Log the deletion
            await this.auditLogService.logRoomDeletion(oldState.guild, room);
            
            // Delete the room from the database
            await room.deleteOne();
            
            // Delete the channel
            await channel.delete(`Auto-deleted empty room`);
            
            logger.info(`Deleted empty room ${room.name}`);
          } catch (deleteError) {
            logger.error(`Error deleting empty room:`, deleteError);
          }
        }
      }
    } catch (error) {
      logger.error(`Error handling potential room deletion:`, error);
    }
  }
  
  /**
   * Delete a room
   * @param {Object} room - Room document from database
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRoom(room) {
    try {
      // Delete the room from the database
      await room.deleteOne();
      
      // If we have a Discord client connection, try to delete the channel
      if (this.client && this.client.isReady()) {
        try {
          const guild = await this.client.guilds.fetch(room.guildId);
          const channel = await guild.channels.fetch(room.channelId).catch(() => null);
          
          if (channel) {
            await channel.delete('Room deleted via admin dashboard');
          }
        } catch (discordErr) {
          logger.error('Error deleting Discord channel:', discordErr);
          // We still consider it a success if the DB entry was deleted
        }
      }
      
      return true;
    } catch (err) {
      logger.error('Error in RoomService.deleteRoom:', err);
      throw err;
    }
  }
}

module.exports = RoomService;