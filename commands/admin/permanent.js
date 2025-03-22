// Permanent room command - Make a room persist even when empty
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const AuditLogService = require('../../services/AuditLogService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('permanent')
    .setDescription('Make a room permanent so it is not deleted when empty (Admin only)')
    .addStringOption(option => 
      option.setName('room_id')
        .setDescription('ID of the room to make permanent (current room if not specified)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('value')
        .setDescription('Set to false to make the room temporary again (default: true)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ 
          content: 'You need Administrator permissions to use this command.',
          ephemeral: true 
        });
      }
      
      // Get options
      let roomId = interaction.options.getString('room_id');
      const isPermanent = interaction.options.getBoolean('value') !== false; // Default to true if not specified
      
      // If no room ID provided, use current voice channel
      if (!roomId) {
        // Check if the user is in a voice channel
        if (!interaction.member.voice.channel) {
          return interaction.reply({ 
            content: 'You need to specify a room ID or be in a voice channel to use this command.',
            ephemeral: true 
          });
        }
        
        roomId = interaction.member.voice.channelId;
      }
      
      // Find the room in the database
      const room = await Room.findOne({ channelId: roomId });
      
      if (!room) {
        return interaction.reply({ 
          content: 'No room found with that ID. Make sure the ID belongs to a user-created room.',
          ephemeral: true 
        });
      }
      
      // Get the channel to check if it exists
      const channel = await interaction.guild.channels.fetch(roomId).catch(() => null);
      
      if (!channel) {
        return interaction.reply({ 
          content: 'The specified channel does not exist or I cannot access it.',
          ephemeral: true 
        });
      }
      
      // Update the room in the database
      const previousState = room.isPermanent || false;
      room.isPermanent = isPermanent;
      await room.save();
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Log the action
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: isPermanent ? 'ROOM_SET_PERMANENT' : 'ROOM_SET_TEMPORARY',
        performedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag,
          displayName: interaction.member.displayName
        },
        room: {
          channelId: room.channelId,
          name: room.name
        },
        details: {
          previousState,
          newState: isPermanent
        }
      });
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(isPermanent ? Colors.Green : Colors.Orange)
        .setTitle(isPermanent ? '🔒 Room Set as Permanent' : '🔓 Room Set as Temporary')
        .setDescription(`Room **${room.name}** (${roomId}) will ${isPermanent ? 'no longer' : 'now'} be deleted when empty.`)
        .addFields(
          { name: 'Owner', value: `<@${room.ownerId}>`, inline: true },
          { name: 'Channel', value: `<#${room.channelId}>`, inline: true },
          { name: 'Status', value: isPermanent ? 'Permanent' : 'Temporary', inline: true }
        )
        .setFooter({ text: `Modified by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`Room ${room.name} (${roomId}) ${isPermanent ? 'set as permanent' : 'set as temporary'} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing permanent command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to update the room status.',
        ephemeral: true 
      });
    }
  }
};