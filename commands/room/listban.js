// commands/room/listban.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService');
const { isInVoiceChannel } = require('../../utils/validators');
const { formatDateTime } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('listban')
    .setDescription('List all users banned from your room'),
  
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
      
      // Check if the user is the room owner or a submoderator
      const isOwner = room.ownerId === interaction.user.id;
      const isSubMod = room.submoderators && room.submoderators.includes(interaction.user.id);
      
      if (!isOwner && !isSubMod) {
        return interaction.reply({ 
          content: 'You must be the room owner or a sub-moderator to use this command.',
          ephemeral: true 
        });
      }
      
      // Initialize user state tracker service
      const stateTracker = new UserStateTrackerService();
      
      // Get banned users from the user state tracker
      const bannedUsers = await stateTracker.getUsersWithStateInRoom(
        interaction.guild.id,
        voiceChannel.id,
        'BANNED'
      );
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('🚫 Banned Users')
        .setDescription(`Users banned from ${voiceChannel.name}`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      // If no banned users
      if (bannedUsers.length === 0) {
        embed.setDescription(`No users are currently banned from ${voiceChannel.name}.`);
      } else {
        // Fetch detailed state information for each banned user
        const detailedBans = [];
        
        for (const userId of bannedUsers) {
          try {
            // Try to get the user info
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.tag : `Unknown User (${userId})`;
            
            // Get ban details
            const states = await stateTracker.getUserStatesInRoom(
              interaction.guild.id,
              userId,
              voiceChannel.id
            );
            
            const banState = states.find(s => s.state === 'BANNED');
            
            if (banState) {
              // Try to get the moderator who banned
              const moderator = await client.users.fetch(banState.appliedBy).catch(() => null);
              const modName = moderator ? moderator.tag : `Unknown User (${banState.appliedBy})`;
              
              detailedBans.push({
                userId,
                username,
                reason: banState.reason,
                bannedAt: banState.appliedAt,
                bannedBy: modName
              });
            }
          } catch (error) {
            logger.error(`Error fetching ban details for ${userId}:`, error);
            // Add basic information
            detailedBans.push({ userId, username: `User (${userId})` });
          }
        }
        
        // Add banned users to the embed
        if (detailedBans.length > 0) {
          const banList = detailedBans.map((ban, index) => {
            const banTime = ban.bannedAt ? formatDateTime(ban.bannedAt) : 'Unknown time';
            return `${index + 1}. <@${ban.userId}> (${ban.username})\n   » Banned by: ${ban.bannedBy || 'Unknown'}\n   » When: ${banTime}\n   » Reason: ${ban.reason || 'No reason provided'}`;
          }).join('\n\n');
          
          embed.setDescription(`**${detailedBans.length} user${detailedBans.length !== 1 ? 's' : ''} banned from ${voiceChannel.name}:**\n\n${banList}`);
        }
      }
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error executing listban command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to list banned users.',
        ephemeral: true 
      });
    }
  }
};