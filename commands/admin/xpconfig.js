// commands/admin/xpconfig.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const { getGuildLevelSettings, updateGuildLevelSettings } = require('../../database/schemas/guildLevelSettings');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('xpconfig')
    .setDescription('Configure the XP and leveling system (Admin only)')
    .addSubcommand(subcommand =>
      subcommand
        .setName('rates')
        .setDescription('Configure XP rates')
        .addNumberOption(option =>
          option.setName('voice_rate')
            .setDescription('XP per minute in voice channels')
            .setMinValue(0.1)
            .setMaxValue(10)
            .setRequired(false)
        )
        .addNumberOption(option =>
          option.setName('message_rate')
            .setDescription('XP per message')
            .setMinValue(0.1)
            .setMaxValue(10)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('message_cooldown')
            .setDescription('Cooldown between message XP in seconds')
            .setMinValue(10)
            .setMaxValue(300)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configure level-up notifications')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Whether to send level-up notifications')
            .setRequired(true)
        )
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel for level-up announcements (none = use where it happened)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName('dm_user')
            .setDescription('Whether to DM the user on level-up')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName('announce_in_channel')
            .setDescription('Whether to announce in the channel where it happened')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('exclude')
        .setDescription('Exclude a channel from earning XP')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to exclude')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('include')
        .setDescription('Re-include a previously excluded channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('The channel to include')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('levelrole')
        .setDescription('Set a role to be awarded at a specific level')
        .addIntegerOption(option =>
          option.setName('level')
            .setDescription('The level at which to award the role')
            .setMinValue(1)
            .setRequired(true)
        )
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to award (none to remove)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current XP configuration')
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
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      switch (subcommand) {
        case 'rates': {
          const voiceRate = interaction.options.getNumber('voice_rate');
          const messageRate = interaction.options.getNumber('message_rate');
          const messageCooldown = interaction.options.getInteger('message_cooldown');
          
          // Update settings
          const updates = { xpSettings: { ...guildSettings.xpSettings } };
          
          if (voiceRate !== null) {
            updates.xpSettings.voiceXpPerMinute = voiceRate;
          }
          
          if (messageRate !== null) {
            updates.xpSettings.messageXpPerMessage = messageRate;
          }
          
          if (messageCooldown !== null) {
            updates.xpSettings.messageXpCooldown = messageCooldown;
          }
          
          await updateGuildLevelSettings(interaction.guild.id, updates);
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('⚙️ XP Rates Updated')
            .setDescription(`XP rate settings have been updated.`)
            .addFields(
              { name: 'Voice Activity', value: `${updates.xpSettings.voiceXpPerMinute} XP per minute`, inline: true },
              { name: 'Messages', value: `${updates.xpSettings.messageXpPerMessage} XP per message`, inline: true },
              { name: 'Message Cooldown', value: `${updates.xpSettings.messageXpCooldown} seconds`, inline: true }
            )
            .setFooter({ text: `Updated by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} updated XP rates`);
          break;
        }
        
        case 'notifications': {
          const enabled = interaction.options.getBoolean('enabled');
          const channel = interaction.options.getChannel('channel');
          const dmUser = interaction.options.getBoolean('dm_user');
          const announceInChannel = interaction.options.getBoolean('announce_in_channel');
          
          // Prepare updates
          const updates = { 
            notifications: { 
              ...guildSettings.notifications,
              enabled 
            } 
          };
          
          if (channel !== null) {
            updates.notifications.channelId = channel.id;
          }
          
          if (dmUser !== null) {
            updates.notifications.dmUser = dmUser;
          }
          
          if (announceInChannel !== null) {
            updates.notifications.announceInChannel = announceInChannel;
          }
          
          await updateGuildLevelSettings(interaction.guild.id, updates);
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(enabled ? Colors.Green : Colors.Red)
            .setTitle(`${enabled ? '✅' : '❌'} Level-Up Notifications ${enabled ? 'Enabled' : 'Disabled'}`)
            .setDescription(`Level-up notifications have been ${enabled ? 'enabled' : 'disabled'}.`);
          
          if (enabled) {
            embed.addFields(
              { name: 'Notification Channel', value: channel ? `${channel}` : 'Not set (where it happens)', inline: true },
              { name: 'DM User', value: updates.notifications.dmUser ? 'Yes' : 'No', inline: true },
              { name: 'Announce In Channel', value: updates.notifications.announceInChannel ? 'Yes' : 'No', inline: true }
            );
          }
          
          embed.setFooter({ text: `Updated by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} ${enabled ? 'enabled' : 'disabled'} level-up notifications`);
          break;
        }
        
        case 'exclude': {
          const channel = interaction.options.getChannel('channel');
          
          // Check if channel is already excluded
          if (guildSettings.excludedChannels.includes(channel.id)) {
            return interaction.reply({
              content: `${channel} is already excluded from earning XP.`,
              ephemeral: true
            });
          }
          
          // Add channel to excluded list
          guildSettings.excludedChannels.push(channel.id);
          await guildSettings.save();
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('🚫 Channel Excluded')
            .setDescription(`${channel} has been excluded from earning XP.`)
            .setFooter({ text: `Updated by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} excluded channel ${channel.name} from earning XP`);
          break;
        }
        
        case 'include': {
          const channel = interaction.options.getChannel('channel');
          
          // Check if channel is excluded
          if (!guildSettings.excludedChannels.includes(channel.id)) {
            return interaction.reply({
              content: `${channel} is not excluded from earning XP.`,
              ephemeral: true
            });
          }
          
          // Remove channel from excluded list
          guildSettings.excludedChannels = guildSettings.excludedChannels.filter(id => id !== channel.id);
          await guildSettings.save();
          
          // Create response embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('✅ Channel Included')
            .setDescription(`${channel} will now earn XP again.`)
            .setFooter({ text: `Updated by ${interaction.user.tag}` })
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} included channel ${channel.name} for earning XP`);
          break;
        }
        
        case 'levelrole': {
          const level = interaction.options.getInteger('level');
          const role = interaction.options.getRole('role');
          
          if (role) {
            // Set role for level
            guildSettings.levelRoles.set(level.toString(), role.id);
            await guildSettings.save();
            
            // Create response embed
            const embed = new EmbedBuilder()
              .setColor(Colors.Green)
              .setTitle('🏆 Level Role Set')
              .setDescription(`${role} will now be awarded at level ${level}.`)
              .addFields(
                { name: 'Level', value: `${level}`, inline: true },
                { name: 'Role', value: `${role}`, inline: true }
              )
              .setFooter({ text: `Set by ${interaction.user.tag}` })
              .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            logger.info(`User ${interaction.user.tag} set role ${role.name} to be awarded at level ${level}`);
          } else {
            // Remove role for level
            guildSettings.levelRoles.delete(level.toString());
            await guildSettings.save();
            
            // Create response embed
            const embed = new EmbedBuilder()
              .setColor(Colors.Red)
              .setTitle('🗑️ Level Role Removed')
              .setDescription(`No role will be awarded at level ${level} anymore.`)
              .setFooter({ text: `Removed by ${interaction.user.tag}` })
              .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
            
            logger.info(`User ${interaction.user.tag} removed role award for level ${level}`);
          }
          break;
        }
        
        case 'view': {
          // Create detailed config embed
          const embed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('⚙️ XP System Configuration')
            .setDescription(`Current XP and leveling configuration for ${interaction.guild.name}`)
            .addFields(
              { 
                name: 'XP Rates', 
                value: `Voice Activity: ${guildSettings.xpSettings.voiceXpPerMinute} XP/min\n` +
                      `Messages: ${guildSettings.xpSettings.messageXpPerMessage} XP/msg\n` +
                      `Message Cooldown: ${guildSettings.xpSettings.messageXpCooldown} sec`, 
                inline: false 
              },
              { 
                name: 'Level-Up Notifications', 
                value: `Enabled: ${guildSettings.notifications.enabled ? 'Yes' : 'No'}\n` +
                      `DM User: ${guildSettings.notifications.dmUser ? 'Yes' : 'No'}\n` +
                      `Channel Announcements: ${guildSettings.notifications.announceInChannel ? 'Yes' : 'No'}`, 
                inline: false 
              }
            )
            .setFooter({ text: `Viewed by ${interaction.user.tag}` })
            .setTimestamp();
          
          // Add level roles if any
          if (guildSettings.levelRoles.size > 0) {
            const rolesList = [];
            
            for (const [levelStr, roleId] of guildSettings.levelRoles.entries()) {
              const role = interaction.guild.roles.cache.get(roleId);
              if (role) {
                rolesList.push(`Level ${levelStr}: ${role.name}`);
              }
            }
            
            embed.addFields({
              name: 'Level Roles',
              value: rolesList.join('\n') || 'None',
              inline: false
            });
          }
          
          // Add excluded channels if any
          if (guildSettings.excludedChannels.length > 0) {
            const channelsList = [];
            
            for (const channelId of guildSettings.excludedChannels) {
              const channel = interaction.guild.channels.cache.get(channelId);
              if (channel) {
                channelsList.push(`${channel.name}`);
              }
            }
            
            embed.addFields({
              name: 'Excluded Channels',
              value: channelsList.join('\n') || 'None',
              inline: false
            });
          }
          
          await interaction.reply({ embeds: [embed] });
          
          logger.info(`User ${interaction.user.tag} viewed XP configuration`);
          break;
        }
      }
    } catch (error) {
      logger.error(`Error executing xpconfig command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while configuring the XP system.',
        ephemeral: true 
      });
    }
  }
};