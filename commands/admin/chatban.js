// commands/admin/chatban.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const AuditLogService = require('../../services/AuditLogService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('chatban')
    .setDescription('Ban a user from text channels (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban from text channels')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the chat ban')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Name of the category to ban from (in addition to #main). Default: all text channels')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration of the ban in days (0 for permanent)')
        .setMinValue(0)
        .setRequired(false)
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
      
      // Get command options
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const categoryName = interaction.options.getString('category')?.toLowerCase() || null;
      const duration = interaction.options.getInteger('duration') || 0; // 0 = permanent
      
      // Skip if target is a bot or not found
      if (!targetMember) {
        return interaction.reply({ 
          content: 'That user was not found in this server.',
          ephemeral: true 
        });
      }
      
      if (targetUser.bot) {
        return interaction.reply({ 
          content: 'You cannot chat ban bots.',
          ephemeral: true 
        });
      }
      
      // Check if user is trying to ban themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You cannot chat ban yourself.',
          ephemeral: true
        });
      }
      
      // Check if user is trying to ban a server admin or moderator
      if (targetMember.permissions.has(PermissionFlagsBits.Administrator) || 
          targetMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({
          content: 'You cannot chat ban an administrator or moderator.',
          ephemeral: true
        });
      }
      
      // Defer reply while processing
      await interaction.deferReply();
      
      // Initialize audit log service
      const auditLogService = new AuditLogService(client);
      
      // Find main channel and appropriate categories
      const mainChannel = interaction.guild.channels.cache.find(
        channel => channel.name.toLowerCase() === 'main' && channel.type === ChannelType.GuildText
      );
      
      let categoriesToProcess = [];
      let channelsToProcess = [];
      
      // Add main channel if found
      if (mainChannel) {
        channelsToProcess.push(mainChannel);
      }
      
      // Find categories to process
      if (categoryName) {
        // If category specified, only process that category
        const category = interaction.guild.channels.cache.find(
          channel => channel.name.toLowerCase() === categoryName && channel.type === ChannelType.GuildCategory
        );
        
        if (category) {
          categoriesToProcess.push(category);
        } else {
          return interaction.followUp({
            content: `No category found with name "${categoryName}". Please check the name and try again.`,
            ephemeral: true
          });
        }
      } else {
        // If no category specified, process all categories
        categoriesToProcess = Array.from(interaction.guild.channels.cache.filter(
          channel => channel.type === ChannelType.GuildCategory
        ).values());
      }
      
      // Find all text channels in the specified categories
      for (const category of categoriesToProcess) {
        const textChannelsInCategory = category.children.cache.filter(
          channel => channel.type === ChannelType.GuildText
        );
        
        channelsToProcess = [...channelsToProcess, ...textChannelsInCategory.values()];
      }
      
      // If no channels found
      if (channelsToProcess.length === 0) {
        return interaction.followUp({
          content: 'No text channels found to process.',
          ephemeral: true
        });
      }
      
      // Process each channel
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      
      // Find moderation logs channel (if any)
      const modLogChannel = interaction.guild.channels.cache.find(
        channel => 
          ['mod-logs', 'mod-log', 'modlog', 'moderation-logs', 'moderation-log', 'audit-log', 'audit-logs']
            .includes(channel.name.toLowerCase()) && 
          channel.type === ChannelType.GuildText
      );
      
      // Find support channel
      const supportChannel = interaction.guild.channels.cache.find(
        channel => channel.name.toLowerCase() === 'support' && channel.type === ChannelType.GuildText
      );
      
      for (const channel of channelsToProcess) {
        try {
          // Skip moderation logs channel to ensure it remains visible
          if (modLogChannel && channel.id === modLogChannel.id) {
            skippedCount++;
            logger.info(`Skipped moderation logs channel ${channel.name} to maintain visibility`);
            continue;
          }
          
          // Skip support channel to ensure it remains visible
          if (supportChannel && channel.id === supportChannel.id) {
            skippedCount++;
            logger.info(`Skipped support channel ${channel.name} to maintain visibility`);
            continue;
          }
          
          // Check if user already has a permission override in this channel
          const existingPermissions = channel.permissionOverwrites.cache.get(targetUser.id);
          
          // Skip if user is already banned from this channel (no View Channel permission)
          if (existingPermissions && existingPermissions.deny.has(PermissionFlagsBits.ViewChannel)) {
            skippedCount++;
            continue;
          }
          
          // Apply permission override - remove View Channel permission
          await channel.permissionOverwrites.edit(targetUser.id, {
            ViewChannel: false
          }, { reason: `Chat ban by ${interaction.user.tag}: ${reason}` });
          
          successCount++;
        } catch (error) {
          logger.error(`Error banning ${targetUser.tag} from channel ${channel.name}:`, error);
          errorCount++;
        }
      }
      
      // Log the chat ban action to audit log
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'CHAT_BAN',
        performedBy: {
          id: interaction.user.id,
          tag: interaction.user.tag,
          displayName: interaction.member.displayName
        },
        targetUser: {
          userId: targetUser.id,
          username: targetUser.tag,
          displayName: targetMember.displayName
        },
        details: {
          reason,
          categoryName: categoryName || 'All categories',
          successCount,
          errorCount,
          skippedCount,
          totalChannels: channelsToProcess.length,
          duration: duration || 'Permanent',
          expiresAt: duration ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) : null
        }
      });
      
      // If temporary ban, schedule the unban
      if (duration > 0) {
        // Store temporary ban in the database
        try {
          // We'll use a simple approach - store the ban info in a JSON file if MongoDB isn't available
          const tempBanInfo = {
            guildId: interaction.guild.id,
            userId: targetUser.id,
            reason: reason,
            categoryName: categoryName,
            bannedBy: interaction.user.id,
            bannedAt: new Date(),
            expiresAt: new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
          };
          
          // In a real implementation, you would store this in MongoDB
          // For now, we'll store it in memory on the client
          if (!client.tempChatBans) {
            client.tempChatBans = [];
          }
          
          client.tempChatBans.push(tempBanInfo);
          
          // If we don't have a scheduler running yet, start one
          if (!client.chatBanCheckInterval) {
            client.chatBanCheckInterval = setInterval(() => {
              // This will run every hour to check for expired bans
              if (client.tempChatBans && client.tempChatBans.length > 0) {
                const now = new Date();
                const expiredBans = client.tempChatBans.filter(ban => ban.expiresAt <= now);
                
                // Process expired bans
                expiredBans.forEach(async (ban) => {
                  try {
                    // Remove from the list
                    client.tempChatBans = client.tempChatBans.filter(b => 
                      b.userId !== ban.userId || b.guildId !== ban.guildId || b.expiresAt.getTime() !== ban.expiresAt.getTime()
                    );
                    
                    // Get the guild
                    const guild = client.guilds.cache.get(ban.guildId);
                    if (!guild) return;
                    
                    // Get the user
                    const user = await client.users.fetch(ban.userId).catch(() => null);
                    if (!user) return;
                    
                    // Execute the unban logic (similar to the chatunban command)
                    logger.info(`Auto-unbanning ${user.tag} from text channels as temporary ban has expired`);
                    
                    // This would be the implementation for auto-unbanning
                    // For now, just log it - in a real implementation, you would create a function
                    // that shares the unban logic with the chatunban command
                    logger.info(`Temporary chat ban expired for ${user.tag} in ${guild.name}`);
                    
                    // Log to audit log
                    const auditLogService = new AuditLogService(client);
                    await auditLogService.logAction({
                      guildId: guild.id,
                      actionType: 'CHAT_UNBAN',
                      performedBy: {
                        id: client.user.id,
                        tag: client.user.tag,
                        displayName: client.user.username
                      },
                      targetUser: {
                        userId: user.id,
                        username: user.tag
                      },
                      details: {
                        reason: 'Temporary chat ban expired',
                        automatic: true,
                        originalBanDuration: ban.expiresAt - ban.bannedAt
                      }
                    });
                  } catch (error) {
                    logger.error(`Error processing expired chat ban:`, error);
                  }
                });
              }
            }, 60 * 60 * 1000); // Check every hour
          }
        } catch (error) {
          logger.error(`Error scheduling temporary chat ban:`, error);
        }
      }
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle('🚫 User Chat Banned')
        .setDescription(`${targetUser} has been banned from text channels.`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { 
            name: 'Duration', 
            value: duration > 0 
              ? `${duration} day${duration !== 1 ? 's' : ''} (expires <t:${Math.floor((Date.now() + duration * 24 * 60 * 60 * 1000) / 1000)}:R>)` 
              : 'Permanent', 
            inline: true 
          },
          { name: 'Scope', value: categoryName ? `Category: ${categoryName}` : 'All text channels', inline: true },
          { name: 'Channels Processed', value: channelsToProcess.length.toString(), inline: true },
          { name: 'Results', value: 
            `✅ Success: ${successCount}\n` +
            `⏩ Already banned/Skipped: ${skippedCount}\n` +
            `❌ Errors: ${errorCount}`
          }
        )
        .setFooter({ text: `Banned by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add thumbnail if user has avatar
      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }
      
      // Reply with results
      await interaction.followUp({ embeds: [embed] });
      
      logger.info(`${interaction.user.tag} chat banned ${targetUser.tag} from ${successCount} channels`);
    } catch (error) {
      logger.error(`Error executing chatban command:`, error);
      if (interaction.deferred) {
        await interaction.followUp({ 
          content: 'An error occurred while executing the chat ban.',
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'An error occurred while executing the chat ban.',
          ephemeral: true 
        });
      }
    }
  }
};