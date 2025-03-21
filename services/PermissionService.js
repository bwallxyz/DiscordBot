// Enhanced Permission management service with improved muting
const { PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

class PermissionService {
  /**
   * Get permission overwrites for room creation
   */
  getRoomCreationPermissions(guild, owner) {
    return [
      {
        // Default permissions for everyone
        id: guild.roles.everyone.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect
        ]
      },
      {
        // Owner permissions
        id: owner.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.Stream,
          PermissionFlagsBits.PrioritySpeaker,
          PermissionFlagsBits.UseEmbeddedActivities,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.MoveMembers
        ]
      }
    ];
  }
  
  /**
   * Mute a user in a voice channel - enforces both permission and server mute
   * @param {VoiceChannel} channel - The voice channel
   * @param {String} userId - User ID to mute
   */
  async muteUser(channel, userId) {
    try {
      // Apply permission overwrites to prevent the user from speaking
      // This is persistent and will remain even if they leave and rejoin
      await channel.permissionOverwrites.edit(userId, {
        Speak: false
      });
      
      logger.info(`Applied permission-based mute to ${userId} in ${channel.name}`);
      
      // Also attempt to server mute the user if they're currently in the channel
      // This applies immediately but doesn't persist if they leave and return
      const member = channel.members.get(userId);
      if (member && !member.voice.serverMute) {
        try {
          await member.voice.setMute(true, 'Muted by room owner');
          logger.info(`Applied server mute to ${userId} in ${channel.name}`);
        } catch (serverMuteError) {
          logger.error(`Failed to apply server mute to ${userId}: ${serverMuteError.message}`);
          // Continue anyway as the permission overwrite should still work
        }
      } else if (!member) {
        logger.info(`User ${userId} not currently in channel, only applied permission mute`);
      }
    } catch (error) {
      logger.error(`Error in muteUser: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Unmute a user in a voice channel - removes both permission and server mute
   * @param {VoiceChannel} channel - The voice channel
   * @param {String} userId - User ID to unmute
   */
  async unmuteUser(channel, userId) {
    try {
      // Remove the speak permission overwrite
      // This unblocks them from speaking permanently
      await channel.permissionOverwrites.edit(userId, {
        Speak: null
      });
      
      logger.info(`Removed permission-based mute from ${userId} in ${channel.name}`);
      
      // Also attempt to server unmute the user if they're currently in the channel
      const member = channel.members.get(userId);
      if (member && member.voice.serverMute) {
        try {
          await member.voice.setMute(false, 'Unmuted by room owner');
          logger.info(`Removed server mute from ${userId} in ${channel.name}`);
        } catch (serverUnmuteError) {
          logger.error(`Failed to remove server mute from ${userId}: ${serverUnmuteError.message}`);
          // Continue anyway as the permission overwrite was removed
        }
      } else if (!member) {
        logger.info(`User ${userId} not currently in channel, only removed permission mute`);
      }
    } catch (error) {
      logger.error(`Error in unmuteUser: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Ban a user from a voice channel
   */
  async banUser(channel, userId) {
    try {
      await channel.permissionOverwrites.edit(userId, {
        Connect: false
      });
      
      logger.info(`Banned ${userId} from ${channel.name}`);
      
      // If the user is in the channel, disconnect them
      const member = channel.members.get(userId);
      if (member) {
        // Try to move them to AFK channel or disconnect them
        const guild = channel.guild;
        const afkChannel = guild.afkChannel;
        
        if (afkChannel) {
          await member.voice.setChannel(afkChannel);
          logger.info(`Moved banned user ${userId} to AFK channel`);
        } else {
          await member.voice.disconnect();
          logger.info(`Disconnected banned user ${userId}`);
        }
      }
    } catch (error) {
      logger.error(`Error in banUser: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Unban a user from a voice channel
   */
  async unbanUser(channel, userId) {
    try {
      await channel.permissionOverwrites.edit(userId, {
        Connect: null
      });
      
      logger.info(`Unbanned ${userId} from ${channel.name}`);
    } catch (error) {
      logger.error(`Error in unbanUser: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Lock a room to prevent new users from joining
   */
  async lockRoom(channel) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
        Connect: false
      });
      
      logger.info(`Locked room ${channel.name}`);
    } catch (error) {
      logger.error(`Error in lockRoom: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Unlock a room to allow users to join
   */
  async unlockRoom(channel) {
    try {
      await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
        Connect: null
      });
      
      logger.info(`Unlocked room ${channel.name}`);
    } catch (error) {
      logger.error(`Error in unlockRoom: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PermissionService;