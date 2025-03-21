// Room mute command
const { SlashCommandBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const { isInVoiceChannel, isRoomOwner } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user in your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to mute')
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
      
      // Mute the user
      const permissionService = new PermissionService();
      await permissionService.muteUser(voiceChannel, targetUser.id);
      
      // Reply to the interaction
      await interaction.reply({ 
        content: `${targetUser} has been muted in this room.`
      });
      
      logger.info(`User ${targetUser.tag} muted in room ${voiceChannel.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing mute command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to mute the user.',
        ephemeral: true 
      });
    }
  }
};