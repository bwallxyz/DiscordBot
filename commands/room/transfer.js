// Room ownership transfer command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer ownership of your room to another user (temporary rooms only)')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to transfer ownership to')
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
          content: 'You cannot transfer ownership to a bot.',
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
          content: 'You can only transfer rooms you own.',
          ephemeral: true 
        });
      }
      
      // Get the room from the database
      const room = await Room.findOne({ channelId: voiceChannel.id });
      if (!room) {
        return interaction.reply({ 
          content: 'An error occurred: Room not found in database.',
          ephemeral: true 
        });
      }
      
      // Check if the room is permanent (transfer only applies to temporary rooms)
      if (room.isPermanent) {
        return interaction.reply({ 
          content: 'Permanent rooms cannot be transferred. Only temporary rooms can be transferred to other users.',
          ephemeral: true 
        });
      }
      
      // Check if trying to transfer to self
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You already own this room.',
          ephemeral: true
        });
      }
      
      // Initialize services
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      
      // Update ownership in database
      const oldOwnerId = room.ownerId;
      room.ownerId = targetUser.id;
      await room.save();
      
      // Update permissions in the channel
      // First, remove owner permissions from previous owner
      await voiceChannel.permissionOverwrites.edit(oldOwnerId, {
        // Reset to normal user permissions
        MuteMembers: false,
        DeafenMembers: false,
        MoveMembers: false,
        PrioritySpeaker: false
      });
      
      // Then, give owner permissions to new owner
      await voiceChannel.permissionOverwrites.edit(targetUser.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        Stream: true,
        PrioritySpeaker: true,
        UseEmbeddedActivities: true,
        MuteMembers: true,
        DeafenMembers: true,
        MoveMembers: true
      });
      
      // Log the transfer - FIXED TARGET USER INFO
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'ROOM_TRANSFER',
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
        },
        details: {
          previousOwner: oldOwnerId,
          newOwner: targetUser.id
        }
      });
      
      // Create an embed for better visual feedback
      const transferEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('🔄 Room Ownership Transferred')
        .setDescription(`Ownership of this room has been transferred to ${targetUser}.`)
        .addFields(
          { name: 'Previous Owner', value: `<@${oldOwnerId}>`, inline: true },
          { name: 'New Owner', value: `${targetUser}`, inline: true },
          { name: 'Room', value: `${voiceChannel.name}`, inline: true }
        )
        .setFooter({ text: `Transferred by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add available commands to the embed
      transferEmbed.addFields({
        name: 'Available Commands for New Owner',
        value: 
          '• `/mute` - Mute a user in your room\n' +
          '• `/unmute` - Unmute a user in your room\n' +
          '• `/kick` - Kick a user from your room\n' +
          '• `/ban` - Ban a user from your room\n' +
          '• `/unban` - Unban a user from your room\n' +
          '• `/lock` - Lock your room to prevent new users from joining\n' +
          '• `/unlock` - Unlock your room to allow users to join\n' +
          '• `/rename` - Rename your room (temporary rooms only)\n' +
          '• `/limit` - Set a user limit for your room (temporary rooms only)'
      });
      
      // Reply to the interaction
      await interaction.reply({ 
        embeds: [transferEmbed]
      });
      
      logger.info(`Room ${voiceChannel.name} ownership transferred from ${interaction.user.tag} to ${targetUser.tag}`);
    } catch (error) {
      logger.error(`Error executing transfer command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to transfer room ownership.',
        ephemeral: true 
      });
    }
  }
};