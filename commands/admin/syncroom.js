// Room permission synchronization command
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const { UserStateTrackerService, UserState } = require('../../services/UserStateTrackerService');
const PermissionService = require('../../services/PermissionService');
const { isInVoiceChannel } = require('../../utils/validators');
const AuditLogService = require('../../services/AuditLogService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('syncroom')
    .setDescription('Synchronize room permissions with database records')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('Specific user to sync (optional - syncs all users if not specified)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('force')
        .setDescription('Force synchronization of all permissions even if they seem correct')
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if the command user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      // Get the voice channel and check if it's a user-created room
      const voiceChannel = interaction.member.voice.channel;
      const room = await Room.findOne({ channelId: voiceChannel.id });
      
      if (!room) {
        return interaction.reply({ 
          content: 'This command can only be used in user-created rooms.',
          ephemeral: true 
        });
      }
      
      // Check if the user is the room owner or has admin permissions
      const isOwner = room.ownerId === interaction.user.id;
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      
      if (!isOwner && !isAdmin) {
        return interaction.reply({ 
          content: 'You must be the room owner or an administrator to use this command.',
          ephemeral: true 
        });
      }
      
      // Check for specific user parameter
      const targetUser = interaction.options.getUser('user');
      const forceSync = interaction.options.getBoolean('force') || false;
      
      // Initialize services
      const stateTracker = new UserStateTrackerService();
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      
      await interaction.deferReply();
      
      // If a specific user is provided, only sync that user
      if (targetUser) {
        const result = await syncUserPermissions(
          stateTracker, 
          permissionService, 
          interaction.guild.id, 
          voiceChannel, 
          targetUser.id,
          forceSync
        );
        
        const embed = new EmbedBuilder()
          .setColor(Colors.Blue)
          .setTitle('🔄 User Permissions Synchronized')
          .setDescription(`Permissions for ${targetUser} have been synchronized with database records.`)
          .addFields(
            { name: 'Banned Status', value: result.isBanned ? '🚫 Banned' : '✅ Not Banned', inline: true },
            { name: 'Muted Status', value: result.isMuted ? '🔇 Muted' : '🔊 Not Muted', inline: true },
            { name: 'Discord Permissions', value: result.permissionsUpdated ? '✅ Updated' : '⏩ No Changes Needed', inline: true }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.followUp({ embeds: [embed] });
        
        // Log the action
        await auditLogService.logAction({
          guildId: interaction.guild.id,
          actionType: 'ROOM_SYNC_PERMISSIONS',
          performedBy: {
            id: interaction.user.id,
            tag: interaction.user.tag
          },
          targetUser: {
            userId: targetUser.id,
            username: targetUser.tag
          },
          room: {
            channelId: voiceChannel.id,
            name: voiceChannel.name
          },
          details: {
            isBanned: result.isBanned,
            isMuted: result.isMuted,
            permissionsUpdated: result.permissionsUpdated
          }
        });
        
        logger.info(`User ${interaction.user.tag} synchronized permissions for ${targetUser.tag} in room ${voiceChannel.name}`);
        return;
      }
      
      // Otherwise, sync all users in the database for this room
      
      // 1. First, get all states for this room from the database
      const bannedStates = await UserState.find({
        guildId: interaction.guild.id,
        roomId: voiceChannel.id,
        state: 'BANNED'
      });
      
      const mutedStates = await UserState.find({
        guildId: interaction.guild.id,
        roomId: voiceChannel.id,
        state: 'MUTED'
      });
      
      // 2. Also get users from Room document
      let roomBannedUsers = room.bannedUsers || [];
      let roomMutedUsers = room.mutedUsers || [];
      
      // 3. Merge lists and remove duplicates
      const bannedUserIds = new Set([
        ...bannedStates.map(state => state.userId),
        ...roomBannedUsers.map(user => user.userId)
      ]);
      
      const mutedUserIds = new Set([
        ...mutedStates.map(state => state.userId),
        ...roomMutedUsers.map(user => user.userId)
      ]);
      
      // 4. Synchronize Room document
      room.bannedUsers = Array.from(bannedUserIds).map(userId => {
        // Find existing ban entry
        const existingBan = roomBannedUsers.find(u => u.userId === userId) || 
                           bannedStates.find(s => s.userId === userId);
        
        return {
          userId,
          username: existingBan?.username || 'Unknown User',
          reason: existingBan?.reason || 'Synchronized from database',
          bannedAt: existingBan?.bannedAt || existingBan?.appliedAt || new Date(),
          bannedBy: existingBan?.bannedBy || existingBan?.appliedBy || interaction.user.id
        };
      });
      
      room.mutedUsers = Array.from(mutedUserIds).map(userId => {
        // Find existing mute entry
        const existingMute = roomMutedUsers.find(u => u.userId === userId) ||
                            mutedStates.find(s => s.userId === userId);
        
        return {
          userId,
          username: existingMute?.username || 'Unknown User',
          reason: existingMute?.reason || 'Synchronized from database',
          mutedAt: existingMute?.mutedAt || existingMute?.appliedAt || new Date(),
          mutedBy: existingMute?.mutedBy || existingMute?.appliedBy || interaction.user.id
        };
      });
      
      await room.save();
      
      // 5. Now enforce all these permissions on the Discord side
      let bannedUpdated = 0;
      let mutedUpdated = 0;
      
      // Process banned users
      for (const userId of bannedUserIds) {
        // Check if user's Discord permissions match banned state
        const isUserBanned = await checkUserBanned(voiceChannel, userId);
        
        if (!isUserBanned || forceSync) {
          await permissionService.banUser(voiceChannel, userId);
          bannedUpdated++;
        }
        
        // Ensure the user state record exists
        await stateTracker.trackBannedUser({
          guildId: interaction.guild.id,
          userId,
          roomId: voiceChannel.id,
          appliedBy: interaction.user.id,
          reason: 'Synchronized via syncroom command'
        });
      }
      
      // Process muted users
      for (const userId of mutedUserIds) {
        // Check if user's Discord permissions match muted state
        const isUserMuted = await checkUserMuted(voiceChannel, userId);
        
        if (!isUserMuted || forceSync) {
          await permissionService.muteUser(voiceChannel, userId);
          mutedUpdated++;
          
          // If user is in the channel, also server mute them
          const targetMember = voiceChannel.members.get(userId);
          if (targetMember && !targetMember.voice.serverMute) {
            await targetMember.voice.setMute(true, 'Synchronized via syncroom command');
          }
        }
        
        // Ensure the user state record exists
        await stateTracker.trackMutedUser({
          guildId: interaction.guild.id,
          userId,
          roomId: voiceChannel.id,
          appliedBy: interaction.user.id,
          reason: 'Synchronized via syncroom command'
        });
      }
      
      // 6. Create response embed
      const syncEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🔄 Room Permissions Synchronized')
        .setDescription(`All permissions for ${voiceChannel.name} have been synchronized with database records.`)
        .addFields(
          { name: 'Banned Users', value: `${bannedUserIds.size} total (${bannedUpdated} updated)`, inline: true },
          { name: 'Muted Users', value: `${mutedUserIds.size} total (${mutedUpdated} updated)`, inline: true }
        )
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.followUp({ embeds: [syncEmbed] });
      
      // Log the action
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'ROOM_SYNC_ALL_PERMISSIONS',
        performedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag
        },
        room: {
          channelId: voiceChannel.id,
          name: voiceChannel.name
        },
        details: {
          bannedUsers: bannedUserIds.size,
          mutedUsers: mutedUserIds.size,
          bannedUpdated,
          mutedUpdated
        }
      });
      
      logger.info(`User ${interaction.user.tag} synchronized all permissions in room ${voiceChannel.name}`);
    } catch (error) {
      logger.error(`Error executing syncroom command:`, error);
      
      if (interaction.deferred) {
        await interaction.followUp({ 
          content: 'An error occurred while synchronizing room permissions.',
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'An error occurred while synchronizing room permissions.',
          ephemeral: true 
        });
      }
    }
  }
};

/**
 * Check if a user is currently banned from a channel based on Discord permissions
 * @param {Object} channel - Discord voice channel
 * @param {String} userId - User ID to check
 * @returns {Promise<Boolean>} Whether the user is banned
 */
async function checkUserBanned(channel, userId) {
  try {
    const permissions = channel.permissionOverwrites.cache.get(userId);
    
    if (!permissions) return false;
    
    // If the user is denied Connect permission, they're effectively banned
    return permissions.deny.has('Connect');
  } catch (error) {
    logger.error(`Error checking if user is banned:`, error);
    return false;
  }
}

/**
 * Check if a user is currently muted in a channel based on Discord permissions
 * @param {Object} channel - Discord voice channel
 * @param {String} userId - User ID to check
 * @returns {Promise<Boolean>} Whether the user is muted
 */
async function checkUserMuted(channel, userId) {
  try {
    const permissions = channel.permissionOverwrites.cache.get(userId);
    
    if (!permissions) return false;
    
    // If the user is denied Speak permission, they're effectively muted
    return permissions.deny.has('Speak');
  } catch (error) {
    logger.error(`Error checking if user is muted:`, error);
    return false;
  }
}

/**
 * Synchronize a specific user's permissions in a room
 * @param {Object} stateTracker - UserStateTrackerService instance
 * @param {Object} permissionService - PermissionService instance
 * @param {String} guildId - Guild ID
 * @param {Object} channel - Discord voice channel
 * @param {String} userId - User ID to sync
 * @param {Boolean} force - Whether to force updates even if they seem correct
 * @returns {Promise<Object>} Result of the sync operation
 */
async function syncUserPermissions(stateTracker, permissionService, guildId, channel, userId, force = false) {
  try {
    // Check current states in the database
    const isBanned = await stateTracker.hasUserState({
      guildId,
      userId,
      roomId: channel.id,
      state: 'BANNED'
    });
    
    const isMuted = await stateTracker.hasUserState({
      guildId,
      userId,
      roomId: channel.id,
      state: 'MUTED'
    });
    
    // Check current Discord permissions
    const isCurrentlyBanned = await checkUserBanned(channel, userId);
    const isCurrentlyMuted = await checkUserMuted(channel, userId);
    
    let permissionsUpdated = false;
    
    // Update permissions if needed or forced
    if ((isBanned && !isCurrentlyBanned) || (isBanned && force)) {
      await permissionService.banUser(channel, userId);
      permissionsUpdated = true;
    } else if (!isBanned && isCurrentlyBanned) {
      await permissionService.unbanUser(channel, userId);
      permissionsUpdated = true;
    }
    
    if ((isMuted && !isCurrentlyMuted) || (isMuted && force)) {
      await permissionService.muteUser(channel, userId);
      
      // If user is in the channel, also server mute them
      const targetMember = channel.members.get(userId);
      if (targetMember && !targetMember.voice.serverMute) {
        await targetMember.voice.setMute(true, 'Synchronized via syncroom command');
      }
      
      permissionsUpdated = true;
    } else if (!isMuted && isCurrentlyMuted) {
      await permissionService.unmuteUser(channel, userId);
      
      // If user is in the channel, also server unmute them
      const targetMember = channel.members.get(userId);
      if (targetMember && targetMember.voice.serverMute) {
        await targetMember.voice.setMute(false, 'Synchronized via syncroom command');
      }
      
      permissionsUpdated = true;
    }
    
    return {
      userId,
      isBanned,
      isMuted,
      permissionsUpdated
    };
  } catch (error) {
    logger.error(`Error synchronizing user permissions:`, error);
    throw error;
  }
}