// Updated Room ban command with enhanced error handling
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const AuditLogService = require('../../services/AuditLogService');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService');
const { isInVoiceChannel } = require('../../utils/validators');
const Room = require('../../models/Room');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for banning the user')
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      // Check if the command user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      // Check if the user is the room owner
      const roomService = new RoomService(client);
      const voiceChannel = interaction.member.voice.channel;
      const isOwner = await roomService.isRoomOwner(voiceChannel.id, interaction.user.id);
      
      if (!isOwner) {
        return interaction.reply({ 
          content: 'You can only use this command in rooms you own.',
          ephemeral: true 
        });
      }
      
      // Check if user is trying to ban themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You cannot ban yourself from your own room.',
          ephemeral: true
        });
      }
      
      // Initialize services
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      const stateTracker = new UserStateTrackerService();
      
      // Check if user is already banned
      const isBanned = await stateTracker.hasUserState({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        state: 'BANNED'
      });
      
      if (isBanned) {
        return interaction.reply({
          content: `${targetUser} is already banned from this room.`,
          ephemeral: true
        });
      }
      
      // First, kick the user if they're in the channel
      if (targetMember && voiceChannel.members.has(targetUser.id)) {
        const afkChannel = interaction.guild.afkChannel;
        if (afkChannel) {
          await targetMember.voice.setChannel(afkChannel);
        } else {
          await targetMember.voice.disconnect();
        }
      }
      
      // Ban the user from the channel by updating Discord permissions
      await permissionService.banUser(voiceChannel, targetUser.id);
      
      // Manually update the Room document as a fallback method
      try {
        const room = await Room.findOne({ channelId: voiceChannel.id });
        if (room) {
          if (!room.bannedUsers) {
            room.bannedUsers = [];
          }
          
          // Remove the user if they're already in the banned list
          room.bannedUsers = room.bannedUsers.filter(user => user.userId !== targetUser.id);
          
          // Add to bannedUsers array
          room.bannedUsers.push({
            userId: targetUser.id,
            username: targetUser.tag,
            reason: reason,
            bannedAt: new Date(),
            bannedBy: interaction.user.id
          });
          
          await room.save();
          logger.info(`Updated room document with ban for user ${targetUser.id} in room ${voiceChannel.id}`);
        }
      } catch (roomError) {
        logger.error(`Error updating room document: ${roomError.message}`);
        // Continue anyway, we'll still try to log the ban
      }
      
      // Track the banned state (might fail, but we'll handle that)
      try {
        await stateTracker.trackBannedUser({
          guildId: interaction.guild.id,
          userId: targetUser.id,
          roomId: voiceChannel.id,
          appliedBy: interaction.user.id,
          reason,
          username: targetUser.tag
        });
      } catch (trackError) {
        // Log the error but continue with the ban operation
        logger.error(`Error tracking banned state: ${trackError.message}`);
      }
      
      // Log the ban action
      await auditLogService.logUserBan(
        interaction.guild,
        interaction.member,
        targetMember || { id: targetUser.id, user: targetUser },
        {
          id: voiceChannel.id,
          name: voiceChannel.name,
          channelId: voiceChannel.id
        },
        reason
      );
      
      // Create an embed for better visual feedback
      const banEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('User Banned')
        .setDescription(`${targetUser} has been banned from this room.`)
        .addFields(
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: `Banned by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ 
        embeds: [banEmbed]
      });
      
      logger.info(`User ${targetUser.tag} banned from room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing ban command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to ban the user.',
        ephemeral: true 
      });
    }
  }
};