// commands/leveling/rank.js
const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');
const logger = require('../../utils/logger');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Display your rank card or another user\'s rank card')
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
      const progressBarLength = 15;
      const filledBars = Math.round((levelInfo.progressPercentage / 100) * progressBarLength);
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(progressBarLength - filledBars);
      
      // Create an embed for the rank card
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setAuthor({ 
          name: targetUser.username, 
          iconURL: targetUser.displayAvatarURL()
        })
        .setTitle(`Rank: #${levelInfo.rank || '??'}`)
        .setDescription(`**Level ${levelInfo.level}**`)
        .addFields(
          { 
            name: 'XP', 
            value: `${levelInfo.xp} / ${levelInfo.xp + levelInfo.nextLevelXp - levelInfo.xpProgress} XP`,
            inline: true 
          },
          { 
            name: 'Progress to Level ' + (levelInfo.level + 1), 
            value: `${levelInfo.progressPercentage}%`,
            inline: true 
          },
          { 
            name: 'Progress Bar', 
            value: progressBar
          }
        )
        .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `Voice XP: ${levelInfo.voiceXp} • Message XP: ${levelInfo.messageXp}` })
        .setTimestamp();
      
      // Display differently colored border based on level range
      if (levelInfo.level >= 50) {
        embed.setColor(Colors.Gold);
      } else if (levelInfo.level >= 25) {
        embed.setColor(Colors.Purple);
      } else if (levelInfo.level >= 10) {
        embed.setColor(Colors.Blue);
      } else if (levelInfo.level >= 5) {
        embed.setColor(Colors.Green);
      }
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`User ${interaction.user.tag} checked ${targetUser.id === interaction.user.id ? 'their own' : targetUser.tag + '\'s'} rank card`);
    } catch (error) {
      logger.error(`Error executing rank command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while generating the rank card.',
        ephemeral: true 
      });
    }
  }
};