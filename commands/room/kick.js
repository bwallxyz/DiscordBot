// Room kick command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for kicking the user')
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
      
      // Check if the target user is in the same voice channel
      if (!targetMember || !voiceChannel.members.has(targetUser.id)) {
        return interaction.reply({ 
          content: 'That user is not in your room.',
          ephemeral: true 
        });
      }
      
      // Check if user is trying to kick themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You cannot kick yourself from your own room.',
          ephemeral: true
        });
      }
      
      // Initialize services
      const auditLogService = new AuditLogService(client);
      
      // Get the AFK channel or disconnect the user if there's no AFK channel
      const afkChannel = interaction.guild.afkChannel;
      
      /* Try to notify the user before kicking
      try {
        await targetUser.send(`You have been kicked from room "${voiceChannel.name}" by ${interaction.user.tag}. Reason: ${reason}`);
      } catch (error) {
        logger.warn(`Could not send DM to ${targetUser.tag}`);
      }*/
      
      // Kick the user (move to AFK or disconnect)
      if (afkChannel) {
        await targetMember.voice.setChannel(afkChannel);
      } else {
        await targetMember.voice.disconnect();
      }
      
      // Log the kick action
      await auditLogService.logUserKick(
        interaction.guild,
        interaction.member,
        targetMember,
        {
          id: voiceChannel.id,
          name: voiceChannel.name,
          channelId: voiceChannel.id
        },
        reason
      );
      
      // Create an embed for better visual feedback
      const kickEmbed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('User Kicked')
        .setDescription(`${targetUser} has been kicked from this room.`)
        .addFields(
          { name: 'Reason', value: reason }
        )
        .setFooter({ text: `Kicked by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ 
        embeds: [kickEmbed]
      });
      
      logger.info(`User ${targetUser.tag} kicked from room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing kick command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to kick the user.',
        ephemeral: true 
      });
    }
  }
};