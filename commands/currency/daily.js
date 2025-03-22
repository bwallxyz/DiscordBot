// commands/currency/daily.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const CurrencyService = require('../../services/CurrencyService');
const { formatRelativeTime } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily currency bonus'),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Initialize currency service
      const currencyService = new CurrencyService(client);
      
      // Claim daily bonus
      const result = await currencyService.awardDailyBonus({
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        username: interaction.user.tag,
        displayName: interaction.member.displayName
      });
      
      // Check if successful
      if (result.success) {
        // Create success embed
        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle(`🎁 Daily ${result.currencyName} Bonus`)
          .setDescription(`You claimed **${result.currencySymbol} ${result.earned}** as your daily bonus!`)
          .addFields(
            { name: 'New Balance', value: `${result.currencySymbol} ${result.currency.balance}`, inline: true },
            { name: 'Next Reset', value: formatRelativeTime(result.nextReset), inline: true }
          )
          .setFooter({ text: `Return tomorrow for another bonus` })
          .setTimestamp();
        
        // Reply with success
        await interaction.reply({ embeds: [embed] });
        
        logger.info(`User ${interaction.user.tag} claimed daily bonus of ${result.earned} ${result.currencyName}`);
      } else {
        // Already claimed or error
        if (result.reason === 'already_claimed') {
          const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(`⏰ Daily Bonus Already Claimed`)
            .setDescription(`You've already claimed your daily bonus.`)
            .addFields(
              { name: 'Next Reset', value: formatRelativeTime(result.nextReset) }
            )
            .setFooter({ text: `Check back later` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          // Generic error
          await interaction.reply({ 
            content: 'An error occurred while claiming your daily bonus.',
            ephemeral: true 
          });
        }
      }
    } catch (error) {
      logger.error(`Error executing daily command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while claiming your daily bonus.',
        ephemeral: true 
      });
    }
  }
};