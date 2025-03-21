// Room unmute command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const AuditLogService = require('../../services/AuditLogService');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService'); // Fixed import path
const { isInVoiceChannel } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user in your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to unmute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unmuting the user')
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
      
      // Initialize services
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      const stateTracker = new UserStateTrackerService();
      
      // Check if user is actually muted
      const isMuted = await stateTracker.hasUserState({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        state: 'MUTED'
      });
      
      if (!isMuted) {
        return interaction.reply({
          content: `${targetUser} is not muted in this room.`,
          ephemeral: true
        });
      }
      
      // Unmute the user - removes permission overrides
      await permissionService.unmuteUser(voiceChannel, targetUser.id);
      
      // Ensure the user is actually unmuted in the channel if they're there
      if (targetMember && targetMember.voice.channelId === voiceChannel.id && targetMember.voice.serverMute) {
        try {
          await targetMember.voice.setMute(false, reason);
          logger.info(`Server unmuted ${targetUser.tag} in ${voiceChannel.name}`);
        } catch (unmuteError) {
          logger.error(`Error removing server mute: ${unmuteError.message}`);
        }
      }
      
      // Remove the muted state
      await stateTracker.removeUserState({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        state: 'MUTED'
      });
      
      // Log the unmute action
      await auditLogService.logUserUnmute(
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
      const unmuteEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('User Unmuted')
        .setDescription(`${targetUser} has been unmuted in this room.`)
        .addFields(
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: `Unmuted by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ 
        embeds: [unmuteEmbed]
      });
      
      // Try to notify the user via DM
      try {
        await targetUser.send(`You have been unmuted in room "${voiceChannel.name}" by ${interaction.user.tag}. Reason: ${reason}`);
      } catch (error) {
        logger.warn(`Could not send DM to ${targetUser.tag}`);
      }
      
      logger.info(`User ${targetUser.tag} unmuted in room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing unmute command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to unmute the user.',
        ephemeral: true 
      });
    }
  }
};