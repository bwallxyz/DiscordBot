// commands/room/listmute.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService');
const { isInVoiceChannel } = require('../../utils/validators');
const { formatDateTime } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('listmute')
    .setDescription('List all users muted in your room'),
  
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
      
      // Get muted users from the user state tracker
      const mutedUsers = await stateTracker.getUsersWithStateInRoom(
        interaction.guild.id,
        voiceChannel.id,
        'MUTED'
      );
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('🔇 Muted Users')
        .setDescription(`Users muted in ${voiceChannel.name}`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      // If no muted users
      if (mutedUsers.length === 0) {
        embed.setDescription(`No users are currently muted in ${voiceChannel.name}.`);
      } else {
        // Fetch detailed state information for each muted user
        const detailedMutes = [];
        
        for (const userId of mutedUsers) {
          try {
            // Try to get the user info
            const user = await client.users.fetch(userId).catch(() => null);
            const username = user ? user.tag : `Unknown User (${userId})`;
            
            // Check if the user is currently in the voice channel
            const member = voiceChannel.members.get(userId);
            const status = member ? (member.voice.serverMute ? 'In channel (server muted)' : 'In channel (not server muted)') : 'Not in channel';
            
            // Get mute details
            const states = await stateTracker.getUserStatesInRoom(
              interaction.guild.id,
              userId,
              voiceChannel.id
            );
            
            const muteState = states.find(s => s.state === 'MUTED');
            
            if (muteState) {
              // Try to get the moderator who muted
              const moderator = await client.users.fetch(muteState.appliedBy).catch(() => null);
              const modName = moderator ? moderator.tag : `Unknown User (${muteState.appliedBy})`;
              
              detailedMutes.push({
                userId,
                username,
                status,
                reason: muteState.reason,
                mutedAt: muteState.appliedAt,
                mutedBy: modName
              });
            }
          } catch (error) {
            logger.error(`Error fetching mute details for ${userId}:`, error);
            // Add basic information
            detailedMutes.push({ userId, username: `User (${userId})`, status: 'Unknown' });
          }
        }
        
        // Add muted users to the embed
        if (detailedMutes.length > 0) {
          const muteList = detailedMutes.map((mute, index) => {
            const muteTime = mute.mutedAt ? formatDateTime(mute.mutedAt) : 'Unknown time';
            return `${index + 1}. <@${mute.userId}> (${mute.username})\n   » Status: ${mute.status}\n   » Muted by: ${mute.mutedBy || 'Unknown'}\n   » When: ${muteTime}\n   » Reason: ${mute.reason || 'No reason provided'}`;
          }).join('\n\n');
          
          embed.setDescription(`**${detailedMutes.length} user${detailedMutes.length !== 1 ? 's' : ''} muted in ${voiceChannel.name}:**\n\n${muteList}`);
        }
      }
      
      // Add command tip
      embed.addFields({
        name: 'Tip',
        value: 'Use `/unmute @user` to unmute a specific user'
      });
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error executing listmute command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while trying to list muted users.',
        ephemeral: true 
      });
    }
  }
};