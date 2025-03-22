// commands/admin/resetxp.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagBits } = require('discord.js');
const logger = require('../../utils/logger');
const { UserLevel } = require('../../database/schemas/userLevel');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('resetxp')
    .setDescription('Reset XP for a user or the entire server (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('Reset XP for a specific user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to reset XP for')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('server')
        .setDescription('Reset XP for the entire server (THIS CANNOT BE UNDONE)')
        .addStringOption(option =>
          option.setName('confirm')
            .setDescription('Type "CONFIRM" to reset all XP data (case-sensitive)')
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagBits.Administrator),
  
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
      
      switch (subcommand) {
        case 'user': {
          const targetUser = interaction.options.getUser('user');
          
          // Skip if it's a bot
          if (targetUser.bot) {
            return interaction.reply({ 
              content: 'Bots do not have XP to reset.',
              ephemeral: true 
            });
          }
          
          // Check if user has any XP data
          const userData = await UserLevel.findOne({ 
            guildId: interaction.guild.id, 
            userId: targetUser.id 
          });
          
          if (!userData) {
            return interaction.reply({
              content: `${targetUser.username} does not have any XP data to reset.`,
              ephemeral: true
            });
          }
          
          // Store previous data for logging
          const oldXp = userData.xp;
          const oldLevel = userData.level;
          
          // Reset XP data
          userData.xp = 0;
          userData.level = 0;
          userData.voiceXp = 0;
          userData.messageXp = 0;
          userData.lastUpdated = new Date();
          
          await userData.save();
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('🗑️ XP Reset')
            .setDescription(`XP data for ${targetUser} has been reset.`)
            .addFields(
              { name: 'Previous Data', value: `XP: ${oldXp}\nLevel: ${oldLevel}`, inline: true },
              { name: 'Current Data', value: `XP: 0\nLevel: 0`, inline: true }
            )
            .setFooter({ text: `Reset by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Add thumbnail if user has avatar
          if (targetUser.displayAvatarURL()) {
            embed.setThumbnail(targetUser.displayAvatarURL());
          }
          
          await interaction.reply({ embeds: [embed] });
          
          // Try to notify the user
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('🗑️ XP Reset')
              .setDescription(`Your XP data in ${interaction.guild.name} has been reset by an administrator.`)
              .setFooter({ text: `From ${interaction.guild.name}` })
              .setTimestamp();
            
            await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch (error) {
            logger.warn(`Could not DM XP reset notification to ${targetUser.tag}: ${error.message}`);
          }
          
          logger.info(`User ${interaction.user.tag} reset XP for ${targetUser.tag}`);
          break;
        }
        
        case 'server': {
          const confirmText = interaction.options.getString('confirm');
          
          // Check confirmation text
          if (confirmText !== 'CONFIRM') {
            return interaction.reply({
              content: 'You must type "CONFIRM" exactly to reset XP for the entire server.',
              ephemeral: true
            });
          }
          
          // Get count of users with XP data
          const userCount = await UserLevel.countDocuments({ guildId: interaction.guild.id });
          
          if (userCount === 0) {
            return interaction.reply({
              content: 'There is no XP data to reset for this server.',
              ephemeral: true
            });
          }
          
          // Delete all XP data for the guild
          const deleteResult = await UserLevel.deleteMany({ guildId: interaction.guild.id });
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('⚠️ Server XP Reset')
            .setDescription(`**All XP data for ${interaction.guild.name} has been reset.**`)
            .addFields(
              { name: 'Users Affected', value: `${deleteResult.deletedCount} user${deleteResult.deletedCount !== 1 ? 's' : ''}`, inline: true },
              { name: 'Warning', value: 'This action cannot be undone. All level progress has been permanently deleted.', inline: false }
            )
            .setFooter({ text: `Reset by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} reset XP for the entire server ${interaction.guild.name} (${interaction.guild.id}), affecting ${deleteResult.deletedCount} users`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Error executing resetxp command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while resetting XP data.',
        ephemeral: true 
      });
    }
  }
};