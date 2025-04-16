// Room submod command - Add a sub-moderator to your room
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel } = require('../../utils/validators');
const Room = require('../../models/Room');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('submod')
    .setDescription('Add a sub-moderator to your room who can use mute/unmute commands')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to add as a sub-moderator')
        .setRequired(true)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      
      // Check if target user is valid
      if (!targetMember) {
        return interaction.reply({ 
          content: 'That user is not a member of this server.',
          ephemeral: true 
        });
      }
      
      // Check if target is a bot
      if (targetUser.bot) {
        return interaction.reply({ 
          content: 'You cannot add a bot as a sub-moderator.',
          ephemeral: true 
        });
      }
      
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
          content: 'You can only add sub-moderators to rooms you own.',
          ephemeral: true 
        });
      }
      
      // Check if the user is trying to add themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You are already the owner of this room with full permissions.',
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
      
      // Initialize submods array if it doesn't exist
      if (!room.submoderators) {
        room.submoderators = [];
      }
      
      // Check if user is already a submod
      if (room.submoderators.includes(targetUser.id)) {
        return interaction.reply({
          content: `${targetUser} is already a sub-moderator in this room.`,
          ephemeral: true
        });
      }
      
      // Add user to submods list
      room.submoderators.push(targetUser.id);
      await room.save();
      
      // Update channel permissions to allow muting
      await voiceChannel.permissionOverwrites.edit(targetUser.id, {
        MuteMembers: true
      });
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Log the action
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'ROOM_ADD_SUBMOD',
        performedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag,
          displayName: interaction.member.displayName
        },
        targetUser: {
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: targetMember.displayName
        },
        room: {
          channelId: voiceChannel.id,
          name: voiceChannel.name
        }
      });
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('👮 Sub-Moderator Added')
        .setDescription(`${targetUser} has been added as a sub-moderator in this room.`)
        .addFields(
          { name: 'Permissions', value: 'Sub-moderators can mute and unmute users in this room.' },
          { name: 'Commands Available', value: '• `/mute` - Mute a user\n• `/unmute` - Unmute a user\n• Also works with Discord\'s right-click mute' }
        )
        .setFooter({ text: `Added by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      /* Try to notify the user
      try {
        await targetUser.send(`You have been added as a sub-moderator in room "${voiceChannel.name}" by ${interaction.user.tag}. You can now use mute and unmute commands.`);
      } catch (error) {
        logger.warn(`Could not send DM to ${targetUser.tag}`);
      }*/
      
      logger.info(`User ${targetUser.tag} added as sub-moderator in room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing submod command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to add the sub-moderator.',
        ephemeral: true 
      });
    }
  }
};