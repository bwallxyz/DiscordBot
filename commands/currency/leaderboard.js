// commands/currency/leaderboard.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const CurrencyService = require('../../services/CurrencyService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('richest')
    .setDescription('Show the richest users in the server'),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Initialize currency service
      const currencyService = new CurrencyService(client);
      
      // Get the leaderboard
      const result = await currencyService.getCurrencyLeaderboard(interaction.guild.id, 10);
      
      // Create the leaderboard embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`💰 Richest Users - ${result.currencyName} Leaderboard`)
        .setDescription(`The wealthiest users in ${interaction.guild.name}`)
        .setFooter({ text: `Use /balance to check your own balance` })
        .setTimestamp();
      
      // Add entries to the leaderboard
      if (result.entries.length === 0) {
        embed.setDescription(`No users have earned any ${result.currencyName} yet!`);
      } else {
        // Format the leaderboard entries
        const leaderboardText = result.entries.map((entry, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
          return `${medal} **${entry.username}**: ${entry.formattedBalance}`;
        }).join('\n');
        
        embed.setDescription(leaderboardText);
      }
      
      // Reply with the leaderboard
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} viewed the currency leaderboard`);
    } catch (error) {
      logger.error(`Error executing richest command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while retrieving the leaderboard.',
        ephemeral: true 
      });
    }
  }
};
