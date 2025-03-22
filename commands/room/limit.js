// Room user limit command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel } = require('../../utils/validators');
const Room = require('../../models/Room');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('limit')
    .setDescription('Set a user limit for your room (only for temporary rooms)')
    .addIntegerOption(option => 
      option.setName('users')
        .setDescription('Maximum number of users (0 for no limit)')
        .setMinValue(0)
        .setMaxValue(99)
        .setRequired(true)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the user limit
      const userLimit = interaction.options.getInteger('users');
      
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
          content: 'You can only set limits for rooms you own.',
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
      
      // Check if the room is permanent (limit only applies to temporary rooms)
      if (room.isPermanent) {
        return interaction.reply({ 
          content: 'User limits can only be set for temporary rooms, not permanent ones.',
          ephemeral: true 
        });
      }
      
      // Store the old limit for logging
      const oldLimit = room.userLimit;
      
      // Update the user limit in the database
      room.userLimit = userLimit;
      await room.save();
      
      // Update the Discord channel limit
      await voiceChannel.setUserLimit(userLimit);
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Log the limit change
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'ROOM_LIMIT_CHANGE',
        performedBy: {
          userId: interaction.user.id,
          username: interaction.user.tag,
          displayName: interaction.member.displayName
        },
        room: {
          channelId: voiceChannel.id,
          name: voiceChannel.name
        },
        details: {
          previousLimit: oldLimit,
          newLimit: userLimit
        }
      });
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('👥 Room User Limit Updated')
        .setDescription(userLimit === 0 
          ? `Your room now has no user limit.` 
          : `Your room is now limited to ${userLimit} user${userLimit !== 1 ? 's' : ''}.`
        )
        .addFields(
          { name: 'Previous Limit', value: oldLimit === 0 ? 'No limit' : `${oldLimit} user${oldLimit !== 1 ? 's' : ''}`, inline: true },
          { name: 'New Limit', value: userLimit === 0 ? 'No limit' : `${userLimit} user${userLimit !== 1 ? 's' : ''}`, inline: true }
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`Room ${voiceChannel.name} user limit changed from ${oldLimit} to ${userLimit} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing limit command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to set the room user limit.',
        ephemeral: true 
      });
    }
  }
};