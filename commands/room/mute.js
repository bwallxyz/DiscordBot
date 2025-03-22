// Enhanced Room mute command with state tracking and submod support
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
    .setName('mute')
    .setDescription('Mute a user in your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to mute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for muting the user')
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
      
      // Get the voice channel and room
      const roomService = new RoomService(client);
      const voiceChannel = interaction.member.voice.channel;
      const room = await Room.findOne({ channelId: voiceChannel.id });
      
      if (!room) {
        return interaction.reply({ 
          content: 'This command can only be used in user-created rooms.',
          ephemeral: true 
        });
      }
      
      // Check permissions - either owner or submod
      const isOwner = room.ownerId === interaction.user.id;
      const isSubMod = room.submoderators && room.submoderators.includes(interaction.user.id);
      
      if (!isOwner && !isSubMod) {
        return interaction.reply({ 
          content: 'You must be the room owner or a sub-moderator to use this command.',
          ephemeral: true 
        });
      }
      
      // Check if user is trying to mute themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You cannot mute yourself.',
          ephemeral: true
        });
      }
      
      // Check if trying to mute the room owner (only possible by the owner themselves)
      if (targetUser.id === room.ownerId && !isOwner) {
        return interaction.reply({
          content: 'You cannot mute the room owner.',
          ephemeral: true
        });
      }
      
      // Check if a submod is trying to mute another submod
      if (isSubMod && !isOwner && room.submoderators.includes(targetUser.id)) {
        return interaction.reply({
          content: 'Sub-moderators cannot mute other sub-moderators.',
          ephemeral: true
        });
      }
      
      // Initialize services
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      const stateTracker = new UserStateTrackerService();
      
      // Check if user is already muted
      const isMuted = await stateTracker.hasUserState({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        state: 'MUTED'
      });
      
      if (isMuted) {
        return interaction.reply({
          content: `${targetUser} is already muted in this room.`,
          ephemeral: true
        });
      }
      
      // IMPORTANT: First, track the muted state in the database
      // This ensures the state is saved before any permission changes
      await stateTracker.trackMutedUser({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        appliedBy: interaction.user.id,
        reason
      });
      
      // Apply the mute - both permission overwrites and server mute
      await permissionService.muteUser(voiceChannel, targetUser.id);
      
      // If the user is in the channel, also apply server mute directly
      if (targetMember && targetMember.voice.channelId === voiceChannel.id && !targetMember.voice.serverMute) {
        try {
          await targetMember.voice.setMute(true, reason);
          logger.info(`Server muted ${targetUser.tag} in ${voiceChannel.name}`);
        } catch (muteError) {
          logger.error(`Error applying server mute: ${muteError.message}`);
        }
      }
      
      // Log the mute action
      await auditLogService.logUserMute(
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
      const muteEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('User Muted')
        .setDescription(`${targetUser} has been muted in this room.`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Persistence', value: 'Mute will remain active even if they leave and rejoin' }
        )
        .setFooter({ text: `Muted by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ 
        embeds: [muteEmbed]
      });
      
      // Try to notify the user via DM
      try {
        await targetUser.send(`You have been muted in room "${voiceChannel.name}" by ${interaction.user.tag}. Reason: ${reason}\n\nThis mute will persist even if you leave and rejoin the channel.`);
      } catch (error) {
        logger.warn(`Could not send DM to ${targetUser.tag}`);
      }
      
      logger.info(`User ${targetUser.tag} muted in room ${voiceChannel.name} by ${interaction.user.tag} with persistence`);
    } catch (error) {
      logger.error(`Error executing mute command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to mute the user.',
        ephemeral: true 
      });
    }
  }
};