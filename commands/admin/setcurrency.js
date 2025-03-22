// commands/admin/setcurrency.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const { getGuildCurrencySettings, updateGuildCurrencySettings } = require('../../models/UserCurrency');
const CurrencyService = require('../../services/CurrencyService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('setcurrency')
    .setDescription('Configure the currency system (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('name')
        .setDescription('Set the name of the currency')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('The new currency name')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('symbol')
        .setDescription('Set the symbol for the currency')
        .addStringOption(option =>
          option.setName('symbol')
            .setDescription('The new currency symbol (emoji recommended)')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('commandcost')
        .setDescription('Set the cost for a paid command')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('The command to set the cost for')
            .setRequired(true)
            .addChoices(
              { name: 'rename', value: 'rename' },
              { name: 'transfer', value: 'transfer' },
              { name: 'permanent', value: 'permanent' },
              { name: 'vip', value: 'vip' },
              { name: 'custom', value: 'custom' }
            )
        )
        .addIntegerOption(option =>
          option.setName('cost')
            .setDescription('The cost (0 for free)')
            .setMinValue(0)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('give')
        .setDescription('Give currency to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to give currency to')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('The amount to give')
            .setMinValue(1)
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for giving currency')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('reward_rates')
        .setDescription('Set currency reward rates')
        .addNumberOption(option =>
          option.setName('voice_rate')
            .setDescription('Currency per minute in voice channels')
            .setMinValue(0.1)
            .setRequired(false)
        )
        .addNumberOption(option =>
          option.setName('message_rate')
            .setDescription('Currency per message')
            .setMinValue(0.1)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('daily_bonus')
            .setDescription('Amount for daily bonus')
            .setMinValue(1)
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ 
          content: 'You need Administrator permissions to use this command.',
          ephemeral: true 
        });
      }
      
      // Get the subcommand
      const subcommand = interaction.options.getSubcommand();
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(interaction.guild.id);
      
      // Initialize currency service
      const currencyService = new CurrencyService(client);
      
      // Handle different subcommands
      switch (subcommand) {
        case 'name': {
          const newName = interaction.options.getString('name');
          
          // Update the settings
          guildSettings.currencyName = newName;
          await guildSettings.save();
          
          // Reply
          await interaction.reply({
            content: `Currency name has been set to "${newName}"`,
            ephemeral: true
          });
          
          logger.info(`User ${interaction.user.tag} set currency name to ${newName}`);
          break;
        }
        
        case 'symbol': {
          const newSymbol = interaction.options.getString('symbol');
          
          // Update the settings
          guildSettings.currencySymbol = newSymbol;
          await guildSettings.save();
          
          // Reply
          await interaction.reply({
            content: `Currency symbol has been set to "${newSymbol}"`,
            ephemeral: true
          });
          
          logger.info(`User ${interaction.user.tag} set currency symbol to ${newSymbol}`);
          break;
        }
        
        case 'commandcost': {
          const command = interaction.options.getString('command');
          const cost = interaction.options.getInteger('cost');
          
          // Update the command cost
          guildSettings.paidCommands.set(command, cost);
          await guildSettings.save();
          
          // Reply
          await interaction.reply({
            content: `Cost for /${command} has been set to ${guildSettings.currencySymbol} ${cost}`,
            ephemeral: true
          });
          
          logger.info(`User ${interaction.user.tag} set cost for /${command} to ${cost}`);
          break;
        }
        
        case 'give': {
          const targetUser = interaction.options.getUser('user');
          const amount = interaction.options.getInteger('amount');
          const reason = interaction.options.getString('reason') || 'Admin gift';
          
          // Can't give to bots
          if (targetUser.bot) {
            return interaction.reply({ 
              content: 'You cannot give currency to bots.',
              ephemeral: true 
            });
          }
          
          // Add the currency using the currencyService
          const result = await currencyService.addCurrency({
            guildId: interaction.guild.id,
            userId: targetUser.id,
            amount,
            type: 'ADMIN',
            description: `Admin gift from ${interaction.user.tag}: ${reason}`,
            username: targetUser.tag,
            displayName: interaction.options.getMember('user')?.displayName || targetUser.username
          });
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`💰 Currency Added`)
            .setDescription(`Added **${guildSettings.currencySymbol} ${amount}** to ${targetUser}`)
            .addFields(
              { name: 'New Balance', value: `${guildSettings.currencySymbol} ${result.balance}`, inline: true },
              { name: 'Reason', value: reason, inline: true }
            )
            .setFooter({ text: `Added by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          // Try to notify the user
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(Colors.Green)
              .setTitle(`💰 Currency Received`)
              .setDescription(`You received **${guildSettings.currencySymbol} ${amount}** from an admin in ${interaction.guild.name}`)
              .addFields(
                { name: 'New Balance', value: `${guildSettings.currencySymbol} ${result.balance}`, inline: true },
                { name: 'Reason', value: reason, inline: true }
              )
              .setFooter({ text: `From ${interaction.guild.name}` })
              .setTimestamp();
            
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch (dmError) {
            logger.warn(`Could not send DM to currency recipient: ${dmError.message}`);
          }
          
          logger.info(`User ${interaction.user.tag} gave ${amount} ${guildSettings.currencyName} to ${targetUser.tag}`);
          break;
        }
        
        case 'reward_rates': {
          const voiceRate = interaction.options.getNumber('voice_rate');
          const messageRate = interaction.options.getNumber('message_rate');
          const dailyBonus = interaction.options.getInteger('daily_bonus');
          
          // Update the settings if provided
          if (voiceRate !== null) {
            guildSettings.rewardRates.voiceActivityPerMinute = voiceRate;
          }
          
          if (messageRate !== null) {
            guildSettings.rewardRates.messageReward = messageRate;
          }
          
          if (dailyBonus !== null) {
            guildSettings.rewardRates.dailyBonus = dailyBonus;
          }
          
          await guildSettings.save();
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(`⚙️ Currency Reward Rates Updated`)
            .setDescription(`Current ${guildSettings.currencyName} reward rates:`)
            .addFields(
              { name: 'Voice Activity', value: `${guildSettings.currencySymbol} ${guildSettings.rewardRates.voiceActivityPerMinute}/minute`, inline: true },
              { name: 'Messages', value: `${guildSettings.currencySymbol} ${guildSettings.rewardRates.messageReward}/message`, inline: true },
              { name: 'Daily Bonus', value: `${guildSettings.currencySymbol} ${guildSettings.rewardRates.dailyBonus}`, inline: true }
            )
            .setFooter({ text: `Updated by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} updated currency reward rates`);
          break;
        }
        
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error(`Error executing setcurrency command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while configuring the currency system.',
        ephemeral: true 
      });
    }
  }
};