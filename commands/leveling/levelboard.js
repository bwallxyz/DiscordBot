// commands/leveling/levelboard.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('levelboard')
    .setDescription('Display the server\'s XP leaderboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(option => 
      option.setName('limit')
        .setDescription('Number of users to show (default: 10)')
        .setMinValue(5)
        .setMaxValue(25)
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the limit option
      const limit = interaction.options.getInteger('limit') || 10;
      
      // Initialize leveling service
      const levelingService = new LevelingService(client);
      
      // Get the leaderboard
      const leaderboard = await levelingService.getLevelLeaderboard(interaction.guild.id, limit);
      
      // If no entries, show message
      if (leaderboard.length === 0) {
        return interaction.reply({
          content: 'No users have earned any XP yet!',
          ephemeral: true
        });
      }
      
      // Create the leaderboard embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle(`📊 XP Leaderboard - Top ${leaderboard.length} Users`)
        .setDescription(`The most active users in ${interaction.guild.name}`)
        .setFooter({ text: `Use /level to check your own detailed stats` })
        .setTimestamp();
      
      // Format the leaderboard entries
      const entries = leaderboard.map((entry, index) => {
        // Create a small progress bar for each user
        const progressBarLength = 10;
        const filledBars = Math.round((entry.progress / 100) * progressBarLength);
        const progressBar = '█'.repeat(filledBars) + '░'.repeat(progressBarLength - filledBars);
        
        // Format with medals for top 3
        const rankDisplay = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        
        return `${rankDisplay} **${entry.username}** (Lvl ${entry.level})\n XP: ${entry.xp} | Progress: ${progressBar} ${entry.progress}%`;
      });
      
      // Add all entries to the embed description
      embed.setDescription(entries.join('\n\n'));
      
      // Reply with the leaderboard
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} viewed the level leaderboard`);
    } catch (error) {
      logger.error(`Error executing levelboard command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while retrieving the leaderboard.',
        ephemeral: true 
      });
    }
  }
};