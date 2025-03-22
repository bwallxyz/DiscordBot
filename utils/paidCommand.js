// utils/paidCommand.js - Updated to use the PaidCommandService
const { EmbedBuilder, Colors } = require('discord.js');
const logger = require('./logger');
const PaidCommandService = require('../services/PaidCommandService');

/**
 * Decorator function to handle paid commands
 * @param {Function} commandFunction - Original command execute function
 * @param {Object} options - Additional options (optional)
 * @returns {Function} Wrapped command function
 */
function paidCommand(commandFunction, options = {}) {
  // Return wrapped function
  return async function(client, interaction) {
    try {
      // Initialize paid command service
      const paidCommandService = new PaidCommandService(client);
      
      // Process the command payment
      const result = await paidCommandService.processCommand({
        guildId: interaction.guild.id,
        commandName: interaction.commandName,
        member: interaction.member,
        user: interaction.user
      });
      
      // Handle result
      if (!result.success && result.isPaid) {
        // Create error embed for insufficient funds
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setTitle(`💰 Insufficient ${result.currencyName}`)
          .setDescription(
            `This command costs **${result.currencySymbol} ${result.cost}**, but you only have **${result.currencySymbol} ${result.balance}**.`
          )
          .addFields(
            { 
              name: 'How to Earn More', 
              value: 'Stay active in voice channels, send messages, or level up to earn more currency!' 
            }
          )
          .setFooter({ 
            text: `Type /balance to check your current balance` 
          });
        
        // Reply with the error
        return await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }
      
      // If this is a paid command that was successfully charged
      if (result.isPaid && result.charged) {
        logger.info(`User ${interaction.user.tag} was charged ${result.cost} ${result.currencyName} for /${interaction.commandName} command`);
        
        // Let the user know they were charged
        await interaction.reply({
          content: `You were charged **${result.currencySymbol} ${result.cost}** for using this command.`,
          ephemeral: true
        });
      }
      
      // If payment was bypassed due to role or permission, we can optionally notify
      if (result.isPaid && result.bypassedPayment) {
        logger.info(`User ${interaction.user.tag} bypassed payment for /${interaction.commandName} command`);
      }
      
      // Execute the original command function
      // If we replied about payment, we need to use followUp instead
      if (result.isPaid && (result.charged || result.bypassedPayment)) {
        // Create a modified interaction object that uses followUp instead of reply
        const modifiedInteraction = Object.create(interaction);
        modifiedInteraction.reply = interaction.followUp.bind(interaction);
        
        return await commandFunction(client, modifiedInteraction);
      } else {
        return await commandFunction(client, interaction);
      }
    } catch (error) {
      logger.error(`Error in paid command wrapper for ${interaction.commandName}:`, error);
      
      // Handle error response
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing this command.',
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: 'An error occurred while processing this command.',
          ephemeral: true
        });
      }
    }
  };
}

module.exports = paidCommand;