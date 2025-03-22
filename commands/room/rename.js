// Room rename command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const AuditLogService = require('../../services/AuditLogService');
const { isInVoiceChannel, isValidRoomName } = require('../../utils/validators');
const Room = require('../../models/Room');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename your room')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('The new name for your room')
        .setRequired(true)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the new room name
      const newName = interaction.options.getString('name');
      
      // Validate the new name
      if (!isValidRoomName(newName)) {
        return interaction.reply({ 
          content: 'Invalid room name. Names must be between 1-100 characters.',
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
          content: 'You can only rename rooms you own.',
          ephemeral: true 
        });
      }
      
      // Get the current room name before updating
      const room = await Room.findOne({ channelId: voiceChannel.id });
      const oldName = room.name;
      
      // Update the name in the database
      room.name = newName;
      await room.save();
      
      // Update the Discord channel name
      await voiceChannel.setName(newName);
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Log the rename action
      await auditLogService.logRoomRename(
        interaction.guild,
        interaction.member,
        {
          id: voiceChannel.id,
          name: newName,
          channelId: voiceChannel.id
        },
        oldName,
        newName
      );
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('✏️ Room Renamed')
        .setDescription(`Your room has been renamed successfully.`)
        .addFields(
          { name: 'Old Name', value: oldName, inline: true },
          { name: 'New Name', value: newName, inline: true }
        )
        .setFooter({ text: `Renamed by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`Room ${oldName} renamed to ${newName} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing rename command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to rename the room.',
        ephemeral: true 
      });
    }
  }
};