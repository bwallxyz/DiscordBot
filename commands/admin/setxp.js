// commands/admin/setxp.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionsBitField } = require('discord.js');
const logger = require('../../utils/logger');
const { UserLevel, calculateLevelFromXp, getXpRequiredForLevel } = require('../../database/schemas/userLevel');
const { getGuildLevelSettings } = require('../../database/schemas/guildLevelSettings');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('setxp')
    .setDescription('Set a user\'s XP to a specific value (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to set XP for')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of XP to set')
        .setMinValue(0)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for setting XP')
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
          content: 'You need Administrator permissions to use this command.',
          ephemeral: true 
        });
      }
      
      // Get command options
      const targetUser = interaction.options.getUser('user');
      const targetMember = interaction.options.getMember('user');
      const amount = interaction.options.getInteger('amount');
      const reason = interaction.options.getString('reason') || 'Admin adjustment';
      
      // Skip if it's a bot
      if (targetUser.bot) {
        return interaction.reply({ 
          content: 'You cannot set XP for bots.',
          ephemeral: true 
        });
      }
      
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Get user's level data
      let userLevel = await UserLevel.findOne({ 
        guildId: interaction.guild.id, 
        userId: targetUser.id 
      });
      
      // Create new level data if not exists
      if (!userLevel) {
        userLevel = new UserLevel({
          guildId: interaction.guild.id,
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: targetMember ? targetMember.displayName : targetUser.username,
          xp: 0,
          level: 0,
          voiceXp: 0,
          messageXp: 0
        });
      }
      
      // Record previous level and XP
      const oldLevel = userLevel.level;
      const oldXp = userLevel.xp;
      
      // Update XP to the specified amount
      userLevel.xp = amount;
      
      // Recalculate level based on new XP
      userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
      userLevel.lastUpdated = new Date();
      
      // Save changes
      await userLevel.save();
      
      // Initialize leveling service
      const levelingService = new LevelingService(client);
      
      // Check for level change and handle it
      if (userLevel.level !== oldLevel) {
        // Level changed, check if user needs level roles
        try {
          await levelingService.checkAndAwardLevelRoles(
            interaction.guild,
            targetUser.id,
            userLevel.level,
            guildSettings
          );
        } catch (error) {
          logger.error(`Error awarding level roles: ${error}`);
        }
      }
      
      // Calculate XP for next level
      const nextLevelXp = getXpRequiredForLevel(userLevel.level + 1, guildSettings);
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`XP Set`)
        .setDescription(`Set ${targetUser}'s XP to **${amount} XP**`)
        .addFields(
          { name: 'Previous XP', value: `${oldXp} XP (Level ${oldLevel})`, inline: true },
          { name: 'New XP', value: `${userLevel.xp} XP (Level ${userLevel.level})`, inline: true },
          { name: 'Change', value: `${amount > oldXp ? '+' : ''}${amount - oldXp} XP`, inline: true },
          { name: 'Next Level', value: `${nextLevelXp} XP needed for Level ${userLevel.level + 1}`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Set by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add thumbnail if user has avatar
      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }
      
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} set ${targetUser.tag}'s XP to ${amount} (previous: ${oldXp})`);
    } catch (error) {
      logger.error(`Error executing setxp command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while setting XP.',
        ephemeral: true 
      });
    }
  }
};