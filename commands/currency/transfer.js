// commands/currency/transfer.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const CurrencyService = require('../../services/CurrencyService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer currency to another user')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to transfer currency to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount to transfer')
        .setMinValue(1)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the transfer (optional)')
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get options
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      
      // Can't transfer to self
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({ 
          content: 'You cannot transfer currency to yourself.',
          ephemeral: true 
        });
      }
      
      // Can't transfer to bots
      if (targetUser.bot) {
        return interaction.reply({ 
          content: 'You cannot transfer currency to bots.',
          ephemeral: true 
        });
      }
      
      // Initialize currency service
      const currencyService = new CurrencyService(client);
      
      // Get currency settings for name/symbol
      const balanceInfo = await currencyService.getFormattedBalance(
        interaction.guild.id,
        interaction.user.id
      );
      
      // Process the transfer
      const result = await currencyService.transferCurrency({
        guildId: interaction.guild.id,
        fromUserId: interaction.user.id,
        toUserId: targetUser.id,
        amount,
        description: `Transfer from ${interaction.user.tag}: ${reason}`
      });
      
      // Check result
      if (result.success) {
        // Create success embed
        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle(`💸 Currency Transfer`)
          .setDescription(`You transferred **${balanceInfo.currencySymbol} ${amount}** to ${targetUser}`)
          .addFields(
            { name: 'New Balance', value: `${balanceInfo.currencySymbol} ${result.fromUser.balance}`, inline: true },
            { name: 'Reason', value: reason, inline: true }
          )
          .setFooter({ text: `Transaction complete` })
          .setTimestamp();
        
        // Reply with success
        await interaction.reply({ embeds: [embed] });
        
        // Try to notify the receiver
        try {
          const targetMember = await interaction.guild.members.fetch(targetUser.id);
          const dmEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`💰 Currency Received`)
            .setDescription(`You received **${balanceInfo.currencySymbol} ${amount}** from ${interaction.user.tag} in ${interaction.guild.name}`)
            .addFields(
              { name: 'New Balance', value: `${balanceInfo.currencySymbol} ${result.toUser.balance}`, inline: true },
              { name: 'Reason', value: reason, inline: true }
            )
            .setFooter({ text: `Transaction from ${interaction.guild.name}` })
            .setTimestamp();
          
          await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (dmError) {
          logger.warn(`Could not send DM to transfer recipient: ${dmError.message}`);
        }
        
        logger.info(`User ${interaction.user.tag} transferred ${amount} ${balanceInfo.currencyName} to ${targetUser.tag}`);
      } else {
        // Transfer failed
        if (result.error === 'Insufficient funds') {
          const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle(`❌ Transfer Failed`)
            .setDescription(`You don't have enough ${balanceInfo.currencyName} to complete this transfer.`)
            .addFields(
              { name: 'Your Balance', value: `${balanceInfo.currencySymbol} ${result.senderBalance}`, inline: true },
              { name: 'Required', value: `${balanceInfo.currencySymbol} ${amount}`, inline: true }
            )
            .setFooter({ text: `Unable to complete transaction` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          // Other error
          await interaction.reply({ 
            content: `An error occurred during the transfer: ${result.error}`,
            ephemeral: true 
          });
        }
      }
    } catch (error) {
      logger.error(`Error executing transfer command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while transferring currency.',
        ephemeral: true 
      });
    }
  }
};