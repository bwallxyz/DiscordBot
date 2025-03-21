// Level system commands: rank, leaderboard, setxp, etc.
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const ActivityTrackerService = require('../../services/ActivityTrackerService');
const LevelingService = require('../../services/LevelingService');
const { 
  UserLevel, 
  GuildLevelSettings, 
  getGuildLevelSettings,
  updateGuildLevelSettings,
  setRoleMultiplier,
  calculateLevelFromXp
} = require('../../database/schemas/userLevel');
const { formatDuration, formatDateTime } = require('../../utils/formatters');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Level system commands')
    // rank subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('rank')
        .setDescription('Check your rank and level')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to check (defaults to yourself)')
            .setRequired(false)
        )
    )
    // leaderboard subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('leaderboard')
        .setDescription('View the level leaderboard')
        .addIntegerOption(option =>
          option.setName('limit')
            .setDescription('Number of users to show (default: 10)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    // setxp subcommand (admin only)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setxp')
        .setDescription('Set a user\'s XP amount (Admin only)')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to modify XP for')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('xp')
            .setDescription('The amount of XP to set')
            .setMinValue(0)
            .setRequired(true)
        )
    )
    // addxp subcommand (admin only)
    .addSubcommand(subcommand =>
      subcommand
        .setName('addxp')
        .setDescription('Add XP to a user (Admin only)')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to add XP to')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('xp')
            .setDescription('The amount of XP to add')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    // setmultiplier subcommand (admin only)
    .addSubcommand(subcommand =>
      subcommand
        .setName('setmultiplier')
        .setDescription('Set an XP multiplier for a role (Admin only)')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('The role to set a multiplier for')
            .setRequired(true)
        )
        .addNumberOption(option =>
          option.setName('multiplier')
            .setDescription('The XP multiplier (1.0 = normal, 2.0 = double XP)')
            .setMinValue(0.1)
            .setMaxValue(10.0)
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description for this multiplier (optional)')
            .setRequired(false)
        )
    )
    // multipliers subcommand (view all multipliers)
    .addSubcommand(subcommand =>
      subcommand
        .setName('multipliers')
        .setDescription('View all XP multipliers for roles')
    )
    // settings subcommand (admin only)
    .addSubcommand(subcommand =>
      subcommand
        .setName('settings')
        .setDescription('Configure level system settings (Admin only)')
        .addChannelOption(option =>
          option.setName('notification_channel')
            .setDescription('Channel for level-up notifications (optional)')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName('dm_notifications')
            .setDescription('Send level-up notifications via DM')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option.setName('channel_notifications')
            .setDescription('Send level-up notifications in the active channel')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('voice_xp_per_minute')
            .setDescription('XP per minute in voice channels')
            .setMinValue(1)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('message_xp')
            .setDescription('XP per message')
            .setMinValue(1)
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('message_cooldown')
            .setDescription('Cooldown between message XP in seconds')
            .setMinValue(10)
            .setRequired(false)
        )
    )
    // recalculate subcommand
    .addSubcommand(subcommand =>
      subcommand
        .setName('recalculate')
        .setDescription('Recalculate levels for users')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to recalculate (defaults to all users)')
            .setRequired(false)
        )
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();
      
      // Determine which subcommand was used
      switch (subcommand) {
        case 'rank':
          await this.handleRankCommand(client, interaction);
          break;
        case 'leaderboard':
          await this.handleLeaderboardCommand(client, interaction);
          break;
        case 'setxp':
          await this.handleSetXpCommand(client, interaction);
          break;
        case 'addxp':
          await this.handleAddXpCommand(client, interaction);
          break;
        case 'setmultiplier':
          await this.handleSetMultiplierCommand(client, interaction);
          break;
        case 'multipliers':
          await this.handleMultipliersCommand(client, interaction);
          break;
        case 'settings':
          await this.handleSettingsCommand(client, interaction);
          break;
        case 'recalculate':
          await this.handleRecalculateCommand(client, interaction);
          break;
        default:
          await interaction.reply({ 
            content: 'Unknown subcommand', 
            ephemeral: true 
          });
      }
    } catch (error) {
      logger.error(`Error executing level command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while processing the command.',
        ephemeral: true 
      });
    }
  },
  
  // Handle rank subcommand
  async handleRankCommand(client, interaction) {
    // Get the target user (or self if not specified)
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    // Defer the reply while we get the data
    await interaction.deferReply();
    
    // Get user level info
    const activityTracker = new ActivityTrackerService(client);
    const levelInfo = await activityTracker.getUserLevelInfo(interaction.guild.id, targetUser.id);
    
    // Get user activity stats for combined display
    const activityStats = await activityTracker.getUserStats(interaction.guild.id, targetUser.id);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setAuthor({
        name: `${targetUser.username}'s Level and Rank`,
        iconURL: targetUser.displayAvatarURL()
      })
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${levelInfo.level}`, inline: true },
        { name: 'Rank', value: levelInfo.rank ? `#${levelInfo.rank}` : 'Unranked', inline: true },
        { name: 'Total XP', value: `${levelInfo.xp} XP`, inline: true },
        { name: 'Progress to Next Level', value: `${levelInfo.xpProgress || 0}/${levelInfo.nextLevelXp || 100} XP (${levelInfo.progressPercentage || 0}%)`, inline: false },
        { name: 'Voice XP', value: `${levelInfo.voiceXp} XP`, inline: true },
        { name: 'Message XP', value: `${levelInfo.messageXp} XP`, inline: true }
      )
      .setFooter({ text: `ID: ${targetUser.id}` })
      .setTimestamp();
    
    // Add activity data if available
    if (activityStats && activityStats.totalTime) {
      embed.addFields(
        { name: 'Time Spent in Voice', value: activityStats.formattedTime, inline: false },
        { name: 'Voice Sessions', value: `${activityStats.totalSessions}`, inline: true },
        { name: 'First Seen', value: formatDateTime(activityStats.firstSeen), inline: true }
      );
    }
    
    // Add current activity if the user is in a voice channel
    if (activityStats?.isCurrentlyActive && activityStats?.currentSession) {
      embed.addFields(
        { name: '🔊 Currently Active', value: `In **${activityStats.currentSession.channelName}** for ${activityStats.currentSession.duration}`, inline: false }
      );
    }
    
    // Send the response
    await interaction.editReply({ embeds: [embed] });
  },
  
  // Handle leaderboard subcommand
  async handleLeaderboardCommand(client, interaction) {
    // Get the limit option
    const limit = interaction.options.getInteger('limit') || 10;
    
    // Defer the reply while we get the data
    await interaction.deferReply();
    
    // Get leaderboard data
    const activityTracker = new ActivityTrackerService(client);
    const leaderboard = await activityTracker.getLevelLeaderboard(interaction.guild.id, limit);
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle(`🏆 Level Leaderboard`)
      .setDescription(`Top ${leaderboard.length} users by XP and level`)
      .setFooter({ text: `Server: ${interaction.guild.name}` })
      .setTimestamp();
    
    // Add leaderboard entries
    if (leaderboard.length === 0) {
      embed.setDescription('No level data found for this server yet.');
    } else {
      let leaderboardText = '';
      
      leaderboard.forEach((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        leaderboardText += `${medal} <@${entry.userId}> - **Level ${entry.level}** (${entry.xp} XP)\n`;
      });
      
      embed.setDescription(leaderboardText);
    }
    
    // Send the response
    await interaction.editReply({ embeds: [embed] });
  },
  
  // Handle setxp subcommand
  async handleSetXpCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    const targetUser = interaction.options.getUser('user');
    const xpAmount = interaction.options.getInteger('xp');
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Find or create user level record
      let userLevel = await UserLevel.findOne({ 
        guildId: interaction.guild.id, 
        userId: targetUser.id 
      });
      
      if (!userLevel) {
        userLevel = new UserLevel({
          guildId: interaction.guild.id,
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: interaction.guild.members.cache.get(targetUser.id)?.displayName || targetUser.username,
          xp: 0,
          level: 0
        });
      }
      
      // Store the old level for comparison
      const oldLevel = userLevel.level;
      
      // Set the new XP amount
      userLevel.xp = xpAmount;
      
      // Recalculate level based on new XP
      const levelingService = new LevelingService(client);
      userLevel.level = calculateLevelFromXp(xpAmount, guildSettings);
      
      // Save the changes
      await userLevel.save();
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('XP Updated')
        .setDescription(`Set ${targetUser}'s XP to **${xpAmount}** (Level ${userLevel.level})`)
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add level change information if applicable
      if (oldLevel !== userLevel.level) {
        embed.addFields(
          { name: 'Level Change', value: `Level ${oldLevel} → ${userLevel.level}`, inline: true }
        );
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
      
      // Check if user leveled up or down and award/remove roles if needed
      if (oldLevel !== userLevel.level) {
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (member) {
          await levelingService.checkAndAwardLevelRoles(
            interaction.guild, 
            targetUser.id, 
            userLevel.level, 
            guildSettings
          );
        }
      }
    } catch (error) {
      logger.error(`Error setting user XP:`, error);
      await interaction.editReply({ content: 'An error occurred while setting XP.' });
    }
  },
  
  // Handle addxp subcommand
  async handleAddXpCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    const targetUser = interaction.options.getUser('user');
    const xpAmount = interaction.options.getInteger('xp');
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Find or create user level record
      let userLevel = await UserLevel.findOne({ 
        guildId: interaction.guild.id, 
        userId: targetUser.id 
      });
      
      if (!userLevel) {
        userLevel = new UserLevel({
          guildId: interaction.guild.id,
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: interaction.guild.members.cache.get(targetUser.id)?.displayName || targetUser.username,
          xp: 0,
          level: 0
        });
      }
      
      // Store the old level and XP for comparison
      const oldLevel = userLevel.level;
      const oldXp = userLevel.xp;
      
      // Add the new XP amount
      userLevel.xp += xpAmount;
      
      // Recalculate level based on new XP
      const levelingService = new LevelingService(client);
      userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
      
      // Save the changes
      await userLevel.save();
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('XP Added')
        .setDescription(`Added **${xpAmount} XP** to ${targetUser}`)
        .addFields(
          { name: 'Old XP', value: `${oldXp} XP (Level ${oldLevel})`, inline: true },
          { name: 'New XP', value: `${userLevel.xp} XP (Level ${userLevel.level})`, inline: true }
        )
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
      
      // Check if user leveled up and award roles if needed
      if (userLevel.level > oldLevel) {
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        if (member) {
          await levelingService.checkAndAwardLevelRoles(
            interaction.guild, 
            targetUser.id, 
            userLevel.level, 
            guildSettings
          );
        }
      }
    } catch (error) {
      logger.error(`Error adding user XP:`, error);
      await interaction.editReply({ content: 'An error occurred while adding XP.' });
    }
  },
  
  // Handle setmultiplier subcommand
  async handleSetMultiplierCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    const role = interaction.options.getRole('role');
    const multiplier = interaction.options.getNumber('multiplier');
    const description = interaction.options.getString('description') || '';
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Set the role multiplier
      await setRoleMultiplier(
        interaction.guild.id,
        role.id,
        multiplier,
        description
      );
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('XP Multiplier Set')
        .setDescription(`Set XP multiplier for ${role} to **${multiplier}x**`)
        .setFooter({ text: `Updated by ${interaction.user.tag}` })
        .setTimestamp();
      
      if (description) {
        embed.addFields({ name: 'Description', value: description });
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error setting role multiplier:`, error);
      await interaction.editReply({ content: 'An error occurred while setting the role multiplier.' });
    }
  },
  
  // Handle multipliers subcommand
  async handleMultipliersCommand(client, interaction) {
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('XP Role Multipliers')
        .setDescription('The following roles have XP multipliers:')
        .setFooter({ text: `Server: ${interaction.guild.name}` })
        .setTimestamp();
      
      // Add multipliers to embed
      if (!guildSettings.roleMultipliers || guildSettings.roleMultipliers.length === 0) {
        embed.setDescription('No role multipliers are configured for this server.');
      } else {
        let multipliersList = '';
        
        for (const roleMultiplier of guildSettings.roleMultipliers) {
          const role = interaction.guild.roles.cache.get(roleMultiplier.roleId);
          const roleName = role ? role.name : `Unknown Role (${roleMultiplier.roleId})`;
          
          multipliersList += `• <@&${roleMultiplier.roleId}> - **${roleMultiplier.multiplier}x** XP`;
          if (roleMultiplier.description) {
            multipliersList += ` - ${roleMultiplier.description}`;
          }
          multipliersList += '\n';
        }
        
        embed.setDescription('The following roles have XP multipliers:\n\n' + multipliersList);
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error getting role multipliers:`, error);
      await interaction.editReply({ content: 'An error occurred while fetching role multipliers.' });
    }
  },
  
  // Handle settings subcommand
  async handleSettingsCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    // Defer reply
    await interaction.deferReply();
    
    try {
      // Get current guild settings
      let guildSettings = await getGuildLevelSettings(interaction.guild.id);
      
      // Get command options
      const notificationChannel = interaction.options.getChannel('notification_channel');
      const dmNotifications = interaction.options.getBoolean('dm_notifications');
      const channelNotifications = interaction.options.getBoolean('channel_notifications');
      const voiceXpPerMinute = interaction.options.getInteger('voice_xp_per_minute');
      const messageXp = interaction.options.getInteger('message_xp');
      const messageCooldown = interaction.options.getInteger('message_cooldown');
      
      // Create update object with only the changed settings
      const updates = {};
      
      // Update notification settings if provided
      if (notificationChannel !== null) {
        updates['notifications.channelId'] = notificationChannel.id;
      }
      
      if (dmNotifications !== null) {
        updates['notifications.dmUser'] = dmNotifications;
      }
      
      if (channelNotifications !== null) {
        updates['notifications.announceInChannel'] = channelNotifications;
      }
      
      // Update XP settings if provided
      if (voiceXpPerMinute !== null) {
        updates['xpSettings.voiceXpPerMinute'] = voiceXpPerMinute;
      }
      
      if (messageXp !== null) {
        updates['xpSettings.messageXpPerMessage'] = messageXp;
      }
      
      if (messageCooldown !== null) {
        updates['xpSettings.messageXpCooldown'] = messageCooldown;
      }
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        // Update the settings
        guildSettings = await updateGuildLevelSettings(interaction.guild.id, updates);
      }
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Level System Settings')
        .setDescription('Current level system settings:')
        .addFields(
          { name: 'Voice XP', value: `${guildSettings.xpSettings.voiceXpPerMinute} XP per minute`, inline: true },
          { name: 'Message XP', value: `${guildSettings.xpSettings.messageXpPerMessage} XP per message`, inline: true },
          { name: 'Message Cooldown', value: `${guildSettings.xpSettings.messageXpCooldown} seconds`, inline: true },
          { name: 'Base XP for Level 1', value: `${guildSettings.xpSettings.baseXpRequired} XP`, inline: true },
          { name: 'XP Scaling Factor', value: `${guildSettings.xpSettings.xpScalingFactor}x`, inline: true }
        )
        .setFooter({ text: `Server: ${interaction.guild.name}` })
        .setTimestamp();
      
      // Add notification settings
      const notificationSettings = [];
      
      if (guildSettings.notifications.enabled) {
        notificationSettings.push('✅ Notifications enabled');
        
        if (guildSettings.notifications.channelId) {
          const channel = interaction.guild.channels.cache.get(guildSettings.notifications.channelId);
          if (channel) {
            notificationSettings.push(`📢 Notification channel: ${channel}`);
          }
        }
        
        if (guildSettings.notifications.dmUser) {
          notificationSettings.push('📩 DM notifications: Enabled');
        } else {
          notificationSettings.push('📩 DM notifications: Disabled');
        }
        
        if (guildSettings.notifications.announceInChannel) {
          notificationSettings.push('💬 Channel announcements: Enabled');
        } else {
          notificationSettings.push('💬 Channel announcements: Disabled');
        }
      } else {
        notificationSettings.push('❌ Notifications disabled');
      }
      
      embed.addFields(
        { name: 'Notification Settings', value: notificationSettings.join('\n'), inline: false }
      );
      
      // Add role multipliers
      if (guildSettings.roleMultipliers.length > 0) {
        const multipliers = guildSettings.roleMultipliers.map(rm => {
          const role = interaction.guild.roles.cache.get(rm.roleId);
          return `• <@&${rm.roleId}>: **${rm.multiplier}x** XP`;
        });
        
        embed.addFields(
          { name: 'Role Multipliers', value: multipliers.join('\n'), inline: false }
        );
      }
      
      // Add excluded channels if any
      if (guildSettings.excludedChannels.length > 0) {
        const excludedChannels = guildSettings.excludedChannels.map(id => {
          const channel = interaction.guild.channels.cache.get(id);
          return channel ? `• ${channel}` : `• Unknown Channel (${id})`;
        });
        
        embed.addFields(
          { name: 'Excluded Channels', value: excludedChannels.join('\n') || 'None', inline: false }
        );
      }
      
      // Reply with the result
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error(`Error updating level settings:`, error);
      await interaction.editReply({ content: 'An error occurred while updating the level system settings.' });
    }
  },
  
  // Handle recalculate subcommand
  async handleRecalculateCommand(client, interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
    }
    
    // Defer reply as this might take time
    await interaction.deferReply();
    
    try {
      const targetUser = interaction.options.getUser('user');
      const levelingService = new LevelingService(client);
      
      if (targetUser) {
        // Recalculate for a specific user
        const userLevel = await UserLevel.findOne({ 
          guildId: interaction.guild.id, 
          userId: targetUser.id 
        });
        
        if (!userLevel) {
          return interaction.editReply({ content: `${targetUser} has no level data in this server.` });
        }
        
        const oldLevel = userLevel.level;
        
        // Get guild settings
        const guildSettings = await getGuildLevelSettings(interaction.guild.id);
        
        // Recalculate level based on XP
        userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
        await userLevel.save();
        
        // Create response embed
        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('Level Recalculated')
          .setDescription(`Recalculated level for ${targetUser}`)
          .addFields(
            { name: 'Old Level', value: `${oldLevel}`, inline: true },
            { name: 'New Level', value: `${userLevel.level}`, inline: true },
            { name: 'XP', value: `${userLevel.xp}`, inline: true }
          )
          .setFooter({ text: `Recalculated by ${interaction.user.tag}` })
          .setTimestamp();
          
        await interaction.editReply({ embeds: [embed] });
        
        // Update roles if needed
        if (oldLevel !== userLevel.level) {
          const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (member) {
            await levelingService.checkAndAwardLevelRoles(
              interaction.guild, 
              targetUser.id, 
              userLevel.level, 
              guildSettings
            );
          }
        }
      } else {
        // Recalculate for all users
        const guildSettings = await getGuildLevelSettings(interaction.guild.id);
        const users = await UserLevel.find({ guildId: interaction.guild.id });
        
        let updated = 0;
        let changed = 0;
        
        for (const user of users) {
          const oldLevel = user.level;
          user.level = calculateLevelFromXp(user.xp, guildSettings);
          
          if (user.level !== oldLevel) {
            changed++;
            
            // Update roles if level changed
            try {
              const member = await interaction.guild.members.fetch(user.userId).catch(() => null);
              if (member) {
                await levelingService.checkAndAwardLevelRoles(
                  interaction.guild, 
                  user.userId, 
                  user.level, 
                  guildSettings
                );
              }
            } catch (roleError) {
              logger.error(`Error updating roles for user ${user.userId}:`, roleError);
            }
          }
          
          await user.save();
          updated++;
        }
        
        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('Levels Recalculated')
          .setDescription(`Recalculated levels for all users`)
          .addFields(
            { name: 'Users Updated', value: `${updated}`, inline: true },
            { name: 'Levels Changed', value: `${changed}`, inline: true }
          )
          .setFooter({ text: `Recalculated by ${interaction.user.tag}` })
          .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      logger.error(`Error handling recalculate command:`, error);
      await interaction.editReply({ content: 'An error occurred while recalculating levels.' });
    }
  }
};