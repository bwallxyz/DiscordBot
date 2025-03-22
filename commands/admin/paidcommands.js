// commands/admin/paidcommands.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const PaidCommandService = require('../../services/PaidCommandService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('paidcommands')
    .setDescription('Manage paid commands (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('register')
        .setDescription('Register or update a paid command')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('The command name to register')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('cost')
            .setDescription('The cost to use this command (0 for free)')
            .setMinValue(0)
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description of what this paid command does')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Whether this paid command is enabled')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a paid command registration')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('The command name to delete')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all paid commands')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Get information about a paid command')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('The command name to get info for')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('bypass')
        .setDescription('Manage bypass roles and permissions for a command')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('The command to modify')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role that can bypass payment (omit to see current settings)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Action to perform with the role')
            .setRequired(false)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' }
            )
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
      
      // Initialize paid command service
      const paidCommandService = new PaidCommandService(client);
      
      // Handle different subcommands
      switch (subcommand) {
        case 'register': {
          const commandName = interaction.options.getString('command');
          const cost = interaction.options.getInteger('cost');
          const description = interaction.options.getString('description') || `Paid command: /${commandName}`;
          const enabled = interaction.options.getBoolean('enabled') ?? true;
          
          // Register the command
          const result = await paidCommandService.registerCommand({
            guildId: interaction.guild.id,
            commandName,
            cost,
            description,
            enabled
          });
          
          // Get currency info
          const commandDetails = await paidCommandService.getCommandDetails(
            interaction.guild.id,
            commandName
          );
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`💰 Paid Command ${result.enabled ? 'Registered' : 'Disabled'}`)
            .setDescription(`Command **/${commandName}** has been ${result.cost > 0 ? 'registered as a paid command' : 'set as free'}`)
            .addFields(
              { name: 'Cost', value: `${commandDetails.currencySymbol} ${result.cost}`, inline: true },
              { name: 'Status', value: result.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Description', value: result.description }
            )
            .setFooter({ text: `Configured by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} registered paid command /${commandName} with cost ${cost}`);
          break;
        }
        
        case 'delete': {
          const commandName = interaction.options.getString('command');
          
          // Delete the command
          const result = await paidCommandService.deleteCommandConfig(
            interaction.guild.id,
            commandName
          );
          
          if (result) {
            // Create an embed for the response
            const embed = new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle(`🗑️ Paid Command Deleted`)
              .setDescription(`Command **/${commandName}** has been removed from the paid command registry`)
              .setFooter({ text: `Deleted by ${interaction.user.tag}` })
              .setTimestamp();
            
            // Reply
            await interaction.reply({ embeds: [embed] });
            
            logger.info(`User ${interaction.user.tag} deleted paid command /${commandName}`);
          } else {
            await interaction.reply({
              content: `Command /${commandName} was not registered as a paid command.`,
              ephemeral: true
            });
          }
          break;
        }
        
        case 'list': {
          // Get all paid commands
          const commands = await paidCommandService.getAllPaidCommands(interaction.guild.id);
          
          if (commands.length === 0) {
            await interaction.reply({
              content: 'No paid commands have been registered yet.',
              ephemeral: true
            });
            return;
          }
          
          // Get currency info from the first command
          const commandDetails = await paidCommandService.getCommandDetails(
            interaction.guild.id,
            commands[0].commandName
          );
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(`💰 Paid Commands`)
            .setDescription(`All paid commands in ${interaction.guild.name}:`)
            .setFooter({ text: `Use /paidcommands info <command> for details` })
            .setTimestamp();
          
          // Add a field for each command
          for (const cmd of commands) {
            const statusEmoji = cmd.enabled ? '✅' : '❌';
            const costDisplay = cmd.cost > 0 
              ? `${commandDetails.currencySymbol} ${cmd.cost}` 
              : 'Free';
            
            embed.addFields({
              name: `/${cmd.commandName}`,
              value: `Cost: ${costDisplay}\nEnabled: ${statusEmoji}\nDescription: ${cmd.description}`,
              inline: true
            });
          }
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} listed paid commands`);
          break;
        }
        
        case 'info': {
          const commandName = interaction.options.getString('command');
          
          // Get command details
          const details = await paidCommandService.getCommandDetails(
            interaction.guild.id,
            commandName
          );
          
          if (!details.exists) {
            await interaction.reply({
              content: `Command /${commandName} is not registered as a paid command.`,
              ephemeral: true
            });
            return;
          }
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(details.enabled ? Colors.Blue : Colors.Gray)
            .setTitle(`💰 Paid Command: /${details.commandName}`)
            .setDescription(details.description)
            .addFields(
              { name: 'Cost', value: details.formattedCost, inline: true },
              { name: 'Status', value: details.enabled ? 'Enabled' : 'Disabled', inline: true },
              { name: 'Currency', value: details.currencyName, inline: true }
            )
            .setFooter({ text: `Use /paidcommands bypass to manage bypass roles` })
            .setTimestamp();
          
          // Add bypass roles if any
          if (details.bypassRoles && details.bypassRoles.length > 0) {
            const rolesList = details.bypassRoles.map(roleId => {
              const role = interaction.guild.roles.cache.get(roleId);
              return role ? `<@&${roleId}>` : roleId;
            }).join(', ');
            
            embed.addFields({
              name: 'Bypass Roles',
              value: rolesList || 'None',
              inline: false
            });
          } else {
            embed.addFields({
              name: 'Bypass Roles',
              value: 'None',
              inline: false
            });
          }
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} viewed info for paid command /${commandName}`);
          break;
        }
        
        case 'bypass': {
          const commandName = interaction.options.getString('command');
          const role = interaction.options.getRole('role');
          const action = interaction.options.getString('action');
          
          // Get command details
          const details = await paidCommandService.getCommandDetails(
            interaction.guild.id,
            commandName
          );
          
          if (!details.exists) {
            await interaction.reply({
              content: `Command /${commandName} is not registered as a paid command.`,
              ephemeral: true
            });
            return;
          }
          
          // If no role provided, just show current bypass roles
          if (!role) {
            // Create an embed for the response
            const embed = new EmbedBuilder()
              .setColor(Colors.Blue)
              .setTitle(`🔑 Bypass Roles for /${details.commandName}`)
              .setDescription(`Roles that can use this command without paying ${details.formattedCost}:`)
              .setFooter({ text: `Use /paidcommands bypass <command> <role> <add|remove> to modify` })
              .setTimestamp();
            
            // Add current bypass roles
            if (details.bypassRoles && details.bypassRoles.length > 0) {
              const rolesList = details.bypassRoles.map(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                return role ? `<@&${roleId}>` : roleId;
              }).join('\n');
              
              embed.addFields({
                name: 'Current Bypass Roles',
                value: rolesList || 'None',
                inline: false
              });
            } else {
              embed.addFields({
                name: 'Current Bypass Roles',
                value: 'None',
                inline: false
              });
            }
            
            // Note about Administrator
            embed.addFields({
              name: 'Note',
              value: 'Users with Administrator permission always bypass payment.',
              inline: false
            });
            
            // Reply
            await interaction.reply({ embeds: [embed] });
            return;
          }
          
          // If role provided but no action, default to add
          if (!action) {
            await interaction.reply({
              content: `Please specify whether to add or remove the role with the 'action' option.`,
              ephemeral: true
            });
            return;
          }
          
          // Get current bypass roles
          const bypassRoles = [...(details.bypassRoles || [])];
          
          // Perform action
          if (action === 'add') {
            // Add role if not already in the list
            if (!bypassRoles.includes(role.id)) {
              bypassRoles.push(role.id);
            }
          } else if (action === 'remove') {
            // Remove role if in the list
            const index = bypassRoles.indexOf(role.id);
            if (index !== -1) {
              bypassRoles.splice(index, 1);
            }
          }
          
          // Update command config
          const result = await paidCommandService.updateCommandConfig({
            guildId: interaction.guild.id,
            commandName,
            bypassRoles
          });
          
          // Create an embed for the response
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle(`🔑 Bypass Roles Updated for /${commandName}`)
            .setDescription(`${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'to' : 'from'} bypass roles`)
            .addFields({
              name: 'Effect',
              value: `Users with the ${role} role ${action === 'add' ? 'can now' : 'can no longer'} use /${commandName} without paying ${details.formattedCost}`,
              inline: false
            })
            .setFooter({ text: `Modified by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Reply
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} ${action}ed bypass role ${role.name} for command /${commandName}`);
          break;
        }
        
        default:
          await interaction.reply({
            content: 'Unknown subcommand.',
            ephemeral: true
          });
      }
    } catch (error) {
      logger.error(`Error executing paidcommands command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while managing paid commands.',
        ephemeral: true 
      });
    }
  }
};