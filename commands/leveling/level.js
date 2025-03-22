// commands/leveling/level.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your level or another user\'s level')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
      
      // Initialize leveling service
      const levelingService = new LevelingService(client);
      
      // Get the user's level info
      const levelInfo = await levelingService.getUserLevelInfo(
        interaction.guild.id,
        targetUser.id
      );
      
      // Create a progress bar
      const progressBarLength = 20;
      const filledBars = Math.round((levelInfo.progressPercentage / 100) * progressBarLength);
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(progressBarLength - filledBars);
      
      // Create an embed for the response
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle(`📊 Level Stats for ${targetUser.username}`)
        .setDescription(
          targetUser.id === interaction.user.id
            ? `Here are your current level stats in ${interaction.guild.name}`
            : `Level stats for ${targetUser} in ${interaction.guild.name}`
        )
        .addFields(
          { name: 'Current Level', value: `Level ${levelInfo.level}`, inline: true },
          { name: 'Total XP', value: `${levelInfo.xp} XP`, inline: true },
          { name: 'Rank', value: levelInfo.rank ? `#${levelInfo.rank}` : 'Unranked', inline: true },
          { name: `Level Progress (${levelInfo.progressPercentage}%)`, value: `${progressBar}\n${levelInfo.xpProgress}/${levelInfo.nextLevelXp} XP needed for Level ${levelInfo.level + 1}` },
          { name: 'XP Sources', value: `Voice: ${levelInfo.voiceXp} XP\nMessages: ${levelInfo.messageXp} XP` }
        )
        .setThumbnail(targetUser.displayAvatarURL())
        .setFooter({ text: `Stay active in voice and chat to earn more XP!` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} checked ${targetUser.id === interaction.user.id ? 'their own' : targetUser.tag + '\'s'} level`);
    } catch (error) {
      logger.error(`Error executing level command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while checking level information.',
        ephemeral: true 
      });
    }
  }
};