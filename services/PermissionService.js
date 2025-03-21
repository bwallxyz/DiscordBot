// Permission management service
const { PermissionFlagsBits } = require('discord.js');

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
          PermissionFlagsBits.UseEmbeddedActivities
        ]
      }
    ];
  }
  
  /**
   * Mute a user in a voice channel
   */
  async muteUser(channel, userId) {
    await channel.permissionOverwrites.edit(userId, {
      Speak: false
    });
  }
  
  /**
   * Unmute a user in a voice channel
   */
  async unmuteUser(channel, userId) {
    await channel.permissionOverwrites.edit(userId, {
      Speak: null
    });
  }
  
  /**
   * Ban a user from a voice channel
   */
  async banUser(channel, userId) {
    await channel.permissionOverwrites.edit(userId, {
      Connect: false
    });
  }
  
  /**
   * Unban a user from a voice channel
   */
  async unbanUser(channel, userId) {
    await channel.permissionOverwrites.edit(userId, {
      Connect: null
    });
  }
  
  /**
   * Lock a room to prevent new users from joining
   */
  async lockRoom(channel) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
      Connect: false
    });
  }
  
  /**
   * Unlock a room to allow users to join
   */
  async unlockRoom(channel) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone.id, {
      Connect: null
    });
  }
}

module.exports = PermissionService;