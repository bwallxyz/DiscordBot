// commands/admin/xpboost.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const { GuildLevelSettings, setRoleMultiplier } = require('../../database/schemas/guildLevelSettings');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('xpboost')
    .setDescription('Configure XP boost multipliers for roles (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set an XP multiplier for a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to set a multiplier for')
            .setRequired(true)
        )
        .addNumberOption(option =>
          option.setName('multiplier')
            .setDescription('The XP multiplier value (1.0 = normal, 2.0 = double XP)')
            .setMinValue(0.1)
            .setMaxValue(5.0)
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description of this boost')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an XP multiplier from a role')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to remove the multiplier from')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all XP multipliers for roles')
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
      const guildSettings = await GuildLevelSettings.findOne({ 
        guildId: interaction.guild.id 
      }) || await GuildLevelSettings.create({ 
        guildId: interaction.guild.id 
      });
      
      switch (subcommand) {
        case 'set': {
          const role = interaction.options.getRole('role');
          const multiplier = interaction.options.getNumber('multiplier');
          const description = interaction.options.getString('description') || `XP Boost for ${role.name}`;
          
          // Set the multiplier
          await setRoleMultiplier(
            interaction.guild.id,
            role.id,
            multiplier,
            description
          );
          
          // Create embed for response
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ XP Boost Set')
            .setDescription(`XP Boost for ${role} has been set to **${multiplier}x**`)
            .addFields(
              { name: 'Role', value: role.name, inline: true },
              { name: 'Multiplier', value: `${multiplier}x`, inline: true },
              { name: 'Description', value: description }
            )
            .setFooter({ text: `Set by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} set XP multiplier ${multiplier}x for role ${role.name}`);
          break;
        }
        
        case 'remove': {
          const role = interaction.options.getRole('role');
          
          // Find and remove the multiplier
          const existingIndex = guildSettings.roleMultipliers.findIndex(
            rm => rm.roleId === role.id
          );
          
          if (existingIndex === -1) {
            return interaction.reply({
              content: `${role.name} doesn't have an XP multiplier set.`,
              ephemeral: true
            });
          }
          
          // Remove the multiplier
          guildSettings.roleMultipliers.splice(existingIndex, 1);
          await guildSettings.save();
          
          // Create embed for response
          const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('🗑️ XP Boost Removed')
            .setDescription(`XP Boost for ${role} has been removed`)
            .addFields(
              { name: 'Role', value: role.name, inline: true }
            )
            .setFooter({ text: `Removed by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} removed XP multiplier for role ${role.name}`);
          break;
        }
        
        case 'list': {
          // Create embed for multipliers list
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('📊 XP Boosts')
            .setDescription(`XP multipliers for roles in ${interaction.guild.name}`)
            .setFooter({ text: `Use /xpboost set to configure` })
            .setTimestamp();
          
          // Add multipliers to the embed
          if (guildSettings.roleMultipliers.length === 0) {
            embed.setDescription('No XP boosts have been configured yet.');
          } else {
            for (const multiplier of guildSettings.roleMultipliers) {
              const role = interaction.guild.roles.cache.get(multiplier.roleId);
              const roleName = role ? role.name : `Unknown Role (${multiplier.roleId})`;
              
              embed.addFields({
                name: roleName,
                value: `**${multiplier.multiplier}x** XP - ${multiplier.description || 'No description'}`,
                inline: false
              });
            }
          }
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} listed XP multipliers`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Error executing xpboost command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while managing XP boosts.',
        ephemeral: true 
      });
    }
  }
};