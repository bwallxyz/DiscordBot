// commands/currency/balance.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const CurrencyService = require('../../services/CurrencyService');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition remains the same
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your currency balance and level')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to check (admins only)')
        .setRequired(false)
    ),
  
  // Updated command execution with permission checks
  async execute(client, interaction) {
    try {
      // Get the target user (or the command user if not specified)
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMember = interaction.options.getMember('user') || interaction.member;
      
      // Check if the user is trying to view someone else's stats
      const isViewingOthers = targetUser.id !== interaction.user.id;
      
      // Check if the user has Administrator permission
      const hasAdminPermission = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      
      // If user is trying to view others' stats but doesn't have admin permissions
      if (isViewingOthers && !hasAdminPermission) {
        return interaction.reply({ 
          content: "You can only check your own stats. Administrator permission is required to check others' stats.",
          ephemeral: true 
        });
      }
      
      // Initialize services
      const currencyService = new CurrencyService(client);
      const levelingService = new LevelingService(client);
      
      // Get the user's balance
      const balanceInfo = await currencyService.getFormattedBalance(
        interaction.guild.id,
        targetUser.id
      );
      
      // Get the user's level information
      const levelInfo = await levelingService.getUserLevelInfo(
        interaction.guild.id,
        targetUser.id
      );
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.LuminousVividPink)
        .setTitle(`🧠 Brainiac Balance`)
        .setDescription(
          targetUser.id === interaction.user.id
            ? `Here are your stats:`
            : `Here are ${targetUser}'s stats:`
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { 
            name: `${balanceInfo.currencyName} Balance`, 
            value: `**${balanceInfo.formattedBalance}**`,
            inline: true 
          },
          { 
            name: 'Level Progress', 
            value: `**Level ${levelInfo.level}** (${levelInfo.xp}/${levelInfo.xpNeeded} XP)`,
            inline: true 
          }
        )
        .setFooter({ text: `Use currency to purchase premium features and commands` })
        .setTimestamp();
      
      // Add progress bar to visualize XP progress
      const progressBar = createProgressBar(levelInfo.xp, levelInfo.xpNeeded);
      embed.addFields({ name: 'XP Progress', value: progressBar });
      
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
      
      // Reply to the interaction as ephemeral (only visible to the command user)
      await interaction.reply({ embeds: [embed], ephemeral: true });
      
      // Log the action
      if (isViewingOthers) {
        logger.info(`Admin ${interaction.user.tag} checked ${targetUser.tag}'s balance and level`);
      } else {
        logger.info(`User ${interaction.user.tag} checked their own balance and level`);
      }
    } catch (error) {
      logger.error(`Error executing balance command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while checking user stats.',
        ephemeral: true 
      });
    }
  }
};

// Helper function to create a visual progress bar
function createProgressBar(current, max, barSize = 15) {
  const progress = Math.round((current / max) * barSize);
  const progressBar = '█'.repeat(progress) + '░'.repeat(barSize - progress);
  return `${progressBar} (${Math.round((current / max) * 100)}%)`;
}