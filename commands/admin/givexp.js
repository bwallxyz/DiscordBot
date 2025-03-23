// commands/admin/givexp.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagBits } = require('discord.js');
const logger = require('../../utils/logger');
const { UserLevel, calculateLevelFromXp, getXpRequiredForLevel } = require('../../database/schemas/userLevel');
const { getGuildLevelSettings } = require('../../database/schemas/guildLevelSettings');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('givexp')
    .setDescription('Give XP to a user (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to give XP to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('The amount of XP to give (use negative numbers to remove XP)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for giving XP')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagBits.Administrator),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Check if user has admin permissions
      if (!interaction.member.permissions.has(PermissionFlagBits.Administrator)) {
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
          content: 'You cannot give XP to bots.',
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
      
      // Update XP
      userLevel.xp += amount;
      
      // Ensure XP doesn't go negative
      if (userLevel.xp < 0) {
        userLevel.xp = 0;
      }
      
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
        if (userLevel.level > oldLevel) {
          // Level up
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
      }
      
      // Calculate XP for next level
      const nextLevelXp = getXpRequiredForLevel(userLevel.level + 1, guildSettings);
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(amount >= 0 ? Colors.Green : Colors.Red)
        .setTitle(`${amount >= 0 ? '📈 XP Added' : '📉 XP Removed'}`)
        .setDescription(`${amount >= 0 ? 'Added' : 'Removed'} **${Math.abs(amount)} XP** ${amount >= 0 ? 'to' : 'from'} ${targetUser}`)
        .addFields(
          { name: 'Previous XP', value: `${oldXp} XP (Level ${oldLevel})`, inline: true },
          { name: 'New XP', value: `${userLevel.xp} XP (Level ${userLevel.level})`, inline: true },
          { name: 'Change', value: `${amount >= 0 ? '+' : ''}${amount} XP`, inline: true },
          { name: 'Next Level', value: `${nextLevelXp} XP needed for Level ${userLevel.level + 1}`, inline: false },
          { name: 'Reason', value: reason, inline: false }
        )
        .setFooter({ text: `Adjusted by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add thumbnail if user has avatar
      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }
      
      await interaction.reply({ embeds: [embed] });
      
      /* Try to notify the user
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor(amount >= 0 ? Colors.Green : Colors.Red)
          .setTitle(`${amount >= 0 ? '📈 XP Added' : '📉 XP Removed'}`)
          .setDescription(`An admin has ${amount >= 0 ? 'added' : 'removed'} **${Math.abs(amount)} XP** ${amount >= 0 ? 'to' : 'from'} your account in ${interaction.guild.name}`)
          .addFields(
            { name: 'New XP', value: `${userLevel.xp} XP (Level ${userLevel.level})`, inline: true },
            { name: 'Reason', value: reason, inline: true }
          )
          .setFooter({ text: `From ${interaction.guild.name}` })
          .setTimestamp();
        
        await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (error) {
        logger.warn(`Could not DM XP notification to ${targetUser.tag}: ${error.message}`);
      }*/
      
      logger.info(`User ${interaction.user.tag} ${amount >= 0 ? 'gave' : 'removed'} ${Math.abs(amount)} XP ${amount >= 0 ? 'to' : 'from'} ${targetUser.tag}`);
    } catch (error) {
      logger.error(`Error executing givexp command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while giving XP.',
        ephemeral: true 
      });
    }
  }
};