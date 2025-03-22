// Audit log service for logging and displaying moderation actions
const { EmbedBuilder, Colors } = require('discord.js');
const { logAuditEntry } = require('../database/schemas/auditLog');
const { getGuildConfig } = require('../database/schemas/guildConfig');
const logger = require('../utils/logger');

class AuditLogService {
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Log a moderation action both to the database and to the audit channel
   * @param {Object} options - Audit log options
   * @returns {Promise<void>}
   */
  async logAction(options) {
    try {
      const {
        guildId,
        actionType,
        performedBy,
        targetUser = null,
        room = null,
        details = {}
      } = options;
      
      // Create database entry
      const dbEntry = {
        guildId,
        actionType,
        performedBy: {
          userId: performedBy.id,
          username: performedBy.tag || performedBy.user?.tag,
          displayName: performedBy.displayName
        },
        createdAt: new Date()
      };
      
      // Add target user if provided
      if (targetUser) {
        dbEntry.targetUser = {
          userId: targetUser.id,
          username: targetUser.tag || targetUser.user?.tag,
          displayName: targetUser.displayName
        };
      }
      
      // Add room information if provided
      if (room) {
        dbEntry.room = {
          channelId: room.id || room.channelId,
          name: room.name
        };
      }
      
      // Add any additional details
      if (details && Object.keys(details).length > 0) {
        dbEntry.details = details;
      }
      
      // Log to database
      await logAuditEntry(dbEntry);
      
      // Send to audit channel if configured
      await this.sendAuditLogEmbed(guildId, dbEntry);
      
    } catch (error) {
      logger.error(`Error logging audit action:`, error);
    }
  }
  
  /**
   * Send an audit log entry to the configured audit channel
   * @param {String} guildId - Guild ID
   * @param {Object} entry - Audit log entry
   * @returns {Promise<void>}
   */
  async sendAuditLogEmbed(guildId, entry) {
    try {
      // Get guild config to check for audit channel
      const guildConfig = await getGuildConfig(guildId);
      
      // If no audit channel is configured, skip
      if (!guildConfig || !guildConfig.auditChannelId) {
        return;
      }
      
      // Get the guild and audit channel
      const guild = this.client.guilds.cache.get(guildId);
      const auditChannel = guild?.channels.cache.get(guildConfig.auditChannelId);
      
      // If guild or channel not found, skip
      if (!guild || !auditChannel) {
        return;
      }
      
      // Create and send embed
      const embed = this.createAuditEmbed(entry, guild);
      await auditChannel.send({ embeds: [embed] });
      
    } catch (error) {
      logger.error(`Error sending audit log embed:`, error);
    }
  }
  
  /**
   * Create an embed for the audit log entry
   * @param {Object} entry - Audit log entry
   * @param {Object} guild - Discord guild
   * @returns {EmbedBuilder} Formatted embed
   */
  createAuditEmbed(entry, guild) {
    const embed = new EmbedBuilder()
      .setTimestamp(entry.createdAt)
      .setFooter({ text: `ID: ${entry._id || 'Unknown'}` });
    
    // Set color and title based on action type
    switch (entry.actionType) {
      // Room events
      case 'ROOM_CREATE':
        embed.setColor(Colors.Green)
          .setTitle('🔊 Room Created');
        break;
      case 'ROOM_DELETE':
        embed.setColor(Colors.Red)
          .setTitle('🔇 Room Deleted');
        break;
      case 'ROOM_RENAME':
        embed.setColor(Colors.Blue)
          .setTitle('✏️ Room Renamed');
        break;
      
      // Moderation actions
      case 'USER_MUTE':
        embed.setColor(Colors.Orange)
          .setTitle('🔇 User Muted');
        break;
      case 'USER_UNMUTE':
        embed.setColor(Colors.Green)
          .setTitle('🔊 User Unmuted');
        break;
      case 'USER_KICK':
        embed.setColor(Colors.Orange)
          .setTitle('👢 User Kicked');
        break;
      case 'USER_BAN':
        embed.setColor(Colors.Red)
          .setTitle('🚫 User Banned');
        break;
      case 'USER_UNBAN':
        embed.setColor(Colors.Green)
          .setTitle('✅ User Unbanned');
        break;
      case 'ROOM_LOCK':
        embed.setColor(Colors.Orange)
          .setTitle('🔒 Room Locked');
        break;
      case 'ROOM_UNLOCK':
        embed.setColor(Colors.Green)
          .setTitle('🔓 Room Unlocked');
        break;
      case 'ROOM_LIMIT_CHANGE':
        embed.setColor(Colors.Blue)
          .setTitle('👥 Room User Limit Changed');
        break;
      case 'ROOM_TRANSFER':
        embed.setColor(Colors.Blue)
          .setTitle('👥 Room Ownership Transferred');
        break;
      default:
        embed.setColor(Colors.Grey)
          .setTitle('📝 Room Action');
    }
    
    // Add fields based on available information
    
    // Performed by
    if (entry.performedBy) {
      embed.addFields({
        name: 'Performed By',
        value: `<@${entry.performedBy.userId}> (${entry.performedBy.username})`,
        inline: true
      });
    }
    
    // Target user (if applicable)
    if (entry.targetUser) {
      embed.addFields({
        name: 'Target User',
        value: `<@${entry.targetUser.userId}> (${entry.targetUser.username})`,
        inline: true
      });
    }
    
    // Room information (if applicable)
    if (entry.room && entry.room.channelId) {
      let roomValue = entry.room.name || 'Unknown Room';
      
      // Check if room still exists in guild
      const channel = guild.channels.cache.get(entry.room.channelId);
      if (channel) {
        roomValue = `<#${entry.room.channelId}> (${entry.room.name})`;
      } else {
        roomValue = `${entry.room.name} (Deleted)`;
      }
      
      embed.addFields({
        name: 'Room',
        value: roomValue,
        inline: true
      });
    }
    
    // Add details if available
    if (entry.details) {
      if (entry.details.reason) {
        embed.addFields({
          name: 'Reason',
          value: entry.details.reason || 'No reason provided',
          inline: false
        });
      }
      
      if (entry.details.oldName && entry.details.newName) {
        embed.addFields({
          name: 'Name Change',
          value: `"${entry.details.oldName}" → "${entry.details.newName}"`,
          inline: false
        });
      }
      
      // Add duration for temporary actions
      if (entry.details.duration) {
        embed.addFields({
          name: 'Duration',
          value: entry.details.duration,
          inline: true
        });
      }
    }
    
    return embed;
  }
  
  /**
   * Log room creation
   */
  async logRoomCreation(guild, member, room) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'ROOM_CREATE',
      performedBy: member,
      room: room,
      details: {
        createdAt: new Date()
      }
    });
  }
  
  /**
   * Log room deletion
   */
  async logRoomDeletion(guild, room) {
    const member = await guild.members.fetch(room.ownerId).catch(() => null);
    
    await this.logAction({
      guildId: guild.id,
      actionType: 'ROOM_DELETE',
      performedBy: member || { id: room.ownerId, username: 'Unknown User' },
      room: room
    });
  }
  
  /**
   * Log user mute action
   */
  async logUserMute(guild, moderator, targetUser, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'USER_MUTE',
      performedBy: moderator,
      targetUser: targetUser,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log user unmute action
   */
  async logUserUnmute(guild, moderator, targetUser, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'USER_UNMUTE',
      performedBy: moderator,
      targetUser: targetUser,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log user kick action
   */
  async logUserKick(guild, moderator, targetUser, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'USER_KICK',
      performedBy: moderator,
      targetUser: targetUser,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log user ban action
   */
  async logUserBan(guild, moderator, targetUser, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'USER_BAN',
      performedBy: moderator,
      targetUser: targetUser,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log user unban action
   */
  async logUserUnban(guild, moderator, targetUser, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'USER_UNBAN',
      performedBy: moderator,
      targetUser: targetUser,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log room lock action
   */
  async logRoomLock(guild, moderator, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'ROOM_LOCK',
      performedBy: moderator,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log room unlock action
   */
  async logRoomUnlock(guild, moderator, room, reason = null) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'ROOM_UNLOCK',
      performedBy: moderator,
      room: room,
      details: { reason }
    });
  }
  
  /**
   * Log room rename action
   */
  async logRoomRename(guild, moderator, room, oldName, newName) {
    await this.logAction({
      guildId: guild.id,
      actionType: 'ROOM_RENAME',
      performedBy: moderator,
      room: room,
      details: {
        oldName,
        newName
      }
    });
  }
}

module.exports = AuditLogService;