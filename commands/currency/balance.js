// commands/currency/balance.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const CurrencyService = require('../../services/CurrencyService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your currency balance or another user\'s balance')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to check (default: yourself)')
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user (or the command user if not specified)
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMember = interaction.options.getMember('user') || interaction.member;
      
      // Initialize currency service
      const currencyService = new CurrencyService(client);
      
      // Get the user's balance
      const balanceInfo = await currencyService.getFormattedBalance(
        interaction.guild.id,
        targetUser.id
      );
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`💰 ${balanceInfo.currencyName} Balance`)
        .setDescription(
          targetUser.id === interaction.user.id
            ? `You have **${balanceInfo.formattedBalance}**`
            : `${targetUser} has **${balanceInfo.formattedBalance}**`
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ text: `Use currency to purchase premium features and commands` })
        .setTimestamp();
      
      // Add info on how to earn more if this is the user's own balance
      if (targetUser.id === interaction.user.id) {
        embed.addFields({
          name: 'How to Earn More',
          value: 
            '• Be active in voice channels\n' +
            '• Send messages in text channels\n' +
            '• Level up for bonus rewards\n' +
            '• Claim daily bonus with `/daily`'
        });
      }
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} checked ${targetUser.id === interaction.user.id ? 'their own' : targetUser.tag + '\'s'} balance`);
    } catch (error) {
      logger.error(`Error executing balance command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while checking the balance.',
        ephemeral: true 
      });
    }
  }
};