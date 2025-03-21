// Level roles command - assign roles at specific levels
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const { getGuildLevelSettings, updateGuildLevelSettings } = require('../../database/schemas/userLevel');
const LevelingService = require('../../services/LevelingService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('levelroles')
    .setDescription('Manage level-based role rewards')
    // List all level roles
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all level roles')
    )
    // Set a level role
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set a role to be awarded at a specific level')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to award')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('The level at which to award this role')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    // Remove a level role
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a level role')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('The level to remove the role from')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    // Force update roles for a user
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Force update roles for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to update roles for')
            .setRequired(true)
        )
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      switch (subcommand) {
        case 'list':
          await this.handleListCommand(client, interaction);
          break;
        case 'set':
          await this.handleSetCommand(client, interaction);
          break;
        case 'remove':
          await this.handleRemoveCommand(client, interaction);
          break;
        case 'update':
          await this.handleUpdateCommand(client, interaction);
          break;
        default:
          await interaction.reply({ 
            content: 'Unknown subcommand', 
            ephemeral: true 
          });
      }
    } catch (error) {
      logger.error(`Error executing levelroles command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while processing the command.',
        ephemeral: true 
      });
    }
  },
  
  // Handle list subcommand
  async handleListCommand(client, interaction) {
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Level Roles')
        .setDescription('Roles awarded at specific levels:')
        .setFooter({ text: `Server: ${interaction.guild.name}` })
        .setTimestamp();
      
      // Add level roles to embed
      if (!guildSettings.levelRoles || guildSettings.levelRoles.size === 0) {
        embed.setDescription('No level roles are configured for this server.');
      } else {
        const levelRoles = [];
        
        // Sort by level (ascending)
        const sortedEntries = Array.from(guildSettings.levelRoles.entries())
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        
        for (const [levelStr, roleId] of sortedEntries) {
          const level = parseInt(levelStr, 10);
          const role = interaction.guild.roles.cache.get(roleId);
          const roleName = role ? role.name : `Unknown Role (${roleId})`;
          
          levelRoles.push(`• Level **${level}**: <@&${roleId}>`);
        }
        
        embed.setDescription('Roles awarded at specific levels:\n\n' + levelRoles.join('\n'));
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error listing level roles:`, error);
      await interaction.editReply({ content: 'An error occurred while fetching level roles.' });
    }
  },
  
  // Handle set subcommand
  async handleSetCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    const role = interaction.options.getRole('role');
    const level = interaction.options.getInteger('level');
    
    // Verify role is valid and assignable
    if (role.managed) {
      return interaction.reply({ content: 'This role is managed by an integration and cannot be assigned manually.', ephemeral: true });
    }
    
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return interaction.reply({ content: 'I cannot assign this role as it is positioned higher than or equal to my highest role.', ephemeral: true });
    }
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      let guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Create a new map if it doesn't exist
      if (!guildSettings.levelRoles) {
        guildSettings.levelRoles = new Map();
      }
      
      // Check if this level already has a role
      const existingRoleId = guildSettings.levelRoles.get(level.toString());
      let replacedRole = null;
      
      if (existingRoleId) {
        replacedRole = interaction.guild.roles.cache.get(existingRoleId);
      }
      
      // Set the level role
      guildSettings.levelRoles.set(level.toString(), role.id);
      await guildSettings.save();
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Level Role Set')
        .setDescription(`Set ${role} to be awarded at Level **${level}**`)
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      if (replacedRole) {
        embed.addFields({ name: 'Replaced Role', value: `${replacedRole}` });
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error setting level role:`, error);
      await interaction.editReply({ content: 'An error occurred while setting the level role.' });
    }
  },
  
  // Handle remove subcommand
  async handleRemoveCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    const level = interaction.options.getInteger('level');
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      let guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Check if this level has a role
      const levelStr = level.toString();
      if (!guildSettings.levelRoles || !guildSettings.levelRoles.has(levelStr)) {
        return interaction.editReply({ content: `No role is set for Level ${level}.` });
      }
      
      // Get the role that's being removed
      const roleId = guildSettings.levelRoles.get(levelStr);
      const role = interaction.guild.roles.cache.get(roleId);
      
      // Remove the level role
      guildSettings.levelRoles.delete(levelStr);
      await guildSettings.save();
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('Level Role Removed')
        .setDescription(`Removed role requirement for Level **${level}**`)
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      if (role) {
        embed.addFields({ name: 'Removed Role', value: `${role}` });
      } else {
        embed.addFields({ name: 'Removed Role', value: `Unknown Role (${roleId})` });
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error removing level role:`, error);
      await interaction.editReply({ content: 'An error occurred while removing the level role.' });
    }
  },
  
  // Handle update subcommand
  async handleUpdateCommand(client, interaction) {
    // Only moderators or higher can use this command
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: 'You need Manage Roles permission to use this command.', ephemeral: true });
    }
    
    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    if (!targetMember) {
      return interaction.reply({ content: 'Unable to find that user in this server.', ephemeral: true });
    }
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Get user level
      const userLevel = await require('../../database/schemas/userLevel').UserLevel.findOne({ 
        guildId: interaction.guild.id, 
        userId: targetUser.id 
      });
      
      if (!userLevel) {
        return interaction.editReply({ content: `${targetUser} has no level data in this server.` });
      }
      
      // Create levelingService to handle role updates
      const levelingService = new LevelingService(client);
      
      // Apply level roles
      await levelingService.checkAndAwardLevelRoles(
        interaction.guild,
        targetUser.id,
        userLevel.level,
        guildSettings
      );
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('Roles Updated')
        .setDescription(`Updated level roles for ${targetUser}`)
        .addFields(
          { name: 'Current Level', value: `${userLevel.level}`, inline: true },
          { name: 'XP', value: `${userLevel.xp}`, inline: true }
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error updating user roles:`, error);
      await interaction.editReply({ content: 'An error occurred while updating the user\'s roles.' });
    }
  }
};