// Activity statistics command
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const ActivityTrackerService = require('../../services/ActivityTrackerService');
const logger = require('../../utils/logger');
const { formatDateTime, formatRelativeTime } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('View user activity statistics')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('View activity stats for a specific user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to check (defaults to yourself)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View top users by time spent in voice channels')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of users to show (default: 10)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      const activityTracker = new ActivityTrackerService(client);
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'user') {
        await this.handleUserStats(interaction, activityTracker);
      } else if (subcommand === 'leaderboard') {
        await this.handleLeaderboard(interaction, activityTracker);
      }
    } catch (error) {
      logger.error(`Error executing activity command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while retrieving activity statistics.',
        ephemeral: true 
      });
    }
  },
  
  // Handle user stats subcommand
  async handleUserStats(interaction, activityTracker) {
    // Get the target user (or self if not specified)
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Defer the reply while we get the data
    await interaction.deferReply();
    
    // Get user statistics
    const stats = await activityTracker.getUserStats(interaction.guild.id, targetUser.id);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setAuthor({
        name: `Activity Stats for ${stats.username}`,
        iconURL: targetUser.displayAvatarURL()
      })
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Total Time Spent', value: stats.formattedTime, inline: false },
        { name: 'Sessions', value: `${stats.totalSessions} total voice sessions`, inline: true },
        { name: 'First Seen', value: formatDateTime(stats.firstSeen), inline: true },
        { name: 'Last Active', value: formatRelativeTime(stats.lastActive), inline: true }
      )
      .setFooter({ text: `ID: ${targetUser.id}` })
      .setTimestamp();
    
    // Add current activity if the user is in a voice channel
    if (stats.isCurrentlyActive && stats.currentSession) {
      embed.addFields(
        { 
          name: '🔊 Currently Active', 
          value: `In **${stats.currentSession.channelName}** for ${stats.currentSession.duration}`, 
          inline: false 
        }
      );
    }
    
    // Send the response
    await interaction.editReply({ embeds: [embed] });
  },
  
  // Handle leaderboard subcommand
  async handleLeaderboard(interaction, activityTracker) {
    // Get the limit option
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Defer the reply while we get the data
    await interaction.deferReply();
    
    // Get leaderboard data
    const leaderboard = await activityTracker.getActivityLeaderboard(interaction.guild.id, limit);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`🏆 Voice Activity Leaderboard`)
      .setDescription(`Top ${leaderboard.length} users by time spent in voice channels`)
      .setFooter({ text: `Server: ${interaction.guild.name}` })
      .setTimestamp();
    
    // Add leaderboard entries
    if (leaderboard.length === 0) {
      embed.setDescription('No activity data found for this server yet.');
    } else {
      let leaderboardText = '';
      
      leaderboard.forEach((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        leaderboardText += `${medal} <@${entry.userId}> - **${entry.formattedTime}** (${entry.totalSessions} sessions)\n`;
      });
      
      embed.setDescription(leaderboardText);
    }
    
    // Send the response
    await interaction.editReply({ embeds: [embed] });
  }
};