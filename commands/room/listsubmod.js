// commands/room/listsubmod.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const { isInVoiceChannel } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('listsubmod')
    .setDescription('List all sub-moderators in your room'),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if the command user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      // Get the voice channel
      const voiceChannel = interaction.member.voice.channel;
      
      // Get the room from database
      const room = await Room.findOne({ channelId: voiceChannel.id });
      
      if (!room) {
        return interaction.reply({ 
          content: 'This does not appear to be a user-created room.',
          ephemeral: true 
        });
      }
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('👮 Room Sub-Moderators')
        .setDescription(`Sub-moderators for ${voiceChannel.name}`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Get sub-moderators
      const submods = room.submoderators || [];
      
      // If no sub-moderators
      if (submods.length === 0) {
        embed.setDescription(`No sub-moderators have been added to ${voiceChannel.name}.`);
      } else {
        // Fetch detailed information for each sub-moderator
        const detailedSubmods = [];
        
        for (const userId of submods) {
          try {
            // Try to get the user info
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.tag : `Unknown User (${userId})`;
            
            // Check if the user is currently in the voice channel
            const member = voiceChannel.members.get(userId);
            const status = member ? 'In channel' : 'Not in channel';
            
            detailedSubmods.push({
              userId,
              username,
              status
            });
          } catch (error) {
            logger.error(`Error fetching submod details for ${userId}:`, error);
            // Add basic information
            detailedSubmods.push({ userId, username: `User (${userId})`, status: 'Unknown' });
          }
        }
        
        // Add sub-moderators to the embed
        if (detailedSubmods.length > 0) {
          const submodList = detailedSubmods.map((submod, index) => {
            return `${index + 1}. <@${submod.userId}> (${submod.username})\n   » Status: ${submod.status}`;
          }).join('\n\n');
          
          embed.setDescription(`**${detailedSubmods.length} sub-moderator${detailedSubmods.length !== 1 ? 's' : ''} in ${voiceChannel.name}:**\n\n${submodList}`);
        }
      }
      
      // Add owner information
      try {
        const owner = await client.users.fetch(room.ownerId).catch(() => null);
        const ownerTag = owner ? owner.tag : `Unknown User (${room.ownerId})`;
        
        embed.addFields({
          name: 'Room Owner',
          value: `<@${room.ownerId}> (${ownerTag})`
        });
      } catch (error) {
        logger.error(`Error fetching room owner info:`, error);
        embed.addFields({
          name: 'Room Owner',
          value: `<@${room.ownerId}>`
        });
      }
      
      // Add commands information
      if (room.ownerId === interaction.user.id) {
        embed.addFields({
          name: 'Management Commands',
          value: '• `/submod @user` - Add a sub-moderator\n• `/unsubmod @user` - Remove a sub-moderator'
        });
      }
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error executing listsubmod command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to list sub-moderators.',
        ephemeral: true 
      });
    }
  }
};