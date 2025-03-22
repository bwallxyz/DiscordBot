// Room unsubmod command - Remove a sub-moderator from your room
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel } = require('../../utils/validators');
const Room = require('../../models/Room');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('unsubmod')
    .setDescription('Remove a sub-moderator from your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The sub-moderator to remove')
        .setRequired(true)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
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
          content: 'You can only remove sub-moderators from rooms you own.',
          ephemeral: true 
        });
      }
      
      // Get the room from database
      const room = await Room.findOne({ channelId: voiceChannel.id });
      if (!room) {
        return interaction.reply({ 
          content: 'Error: This does not appear to be a user-created room.',
          ephemeral: true 
        });
      }
      
      // Check if submods array exists
      if (!room.submoderators || !Array.isArray(room.submoderators)) {
        room.submoderators = [];
        await room.save();
        return interaction.reply({
          content: `${targetUser} is not a sub-moderator in this room.`,
          ephemeral: true
        });
      }
      
      // Check if user is actually a submod
      if (!room.submoderators.includes(targetUser.id)) {
        return interaction.reply({
          content: `${targetUser} is not a sub-moderator in this room.`,
          ephemeral: true
        });
      }
      
      // Remove user from submods list
      room.submoderators = room.submoderators.filter(id => id !== targetUser.id);
      await room.save();
      
      // Update channel permissions to remove muting ability
      // Reset permissions to default for a normal user
      await voiceChannel.permissionOverwrites.edit(targetUser.id, {
        MuteMembers: null,
        DeafenMembers: null
      });
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Log the action
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'ROOM_REMOVE_SUBMOD',
        performedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag,
          displayName: interaction.member.displayName
        },
        targetUser: {
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: targetMember ? targetMember.displayName : 'Unknown'
        },
        room: {
          channelId: voiceChannel.id,
          name: voiceChannel.name
        }
      });
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('🚫 Sub-Moderator Removed')
        .setDescription(`${targetUser} is no longer a sub-moderator in this room.`)
        .setFooter({ text: `Removed by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      // Try to notify the user
      try {
        await targetUser.send(`You have been removed as a sub-moderator from room "${voiceChannel.name}" by ${interaction.user.tag}.`);
      } catch (error) {
        logger.warn(`Could not send DM to ${targetUser.tag}`);
      }
      
      logger.info(`User ${targetUser.tag} removed as sub-moderator from room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing unsubmod command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to remove the sub-moderator.',
        ephemeral: true 
      });
    }
  }
};