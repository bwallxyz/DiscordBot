// commands/admin/chatunban.js
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType } = require('discord.js');
const logger = require('../../utils/logger');
const AuditLogService = require('../../services/AuditLogService');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('chatunban')
    .setDescription('Unban a user from text channels (Admin only)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to unban from text channels')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the chat unban')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Name of the category to unban from (in addition to #main). Default: all text channels')
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
      
      // Skip if target is not found
      if (!targetMember) {
        return interaction.reply({ 
          content: 'That user was not found in this server.',
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
        categoriesToProcess = interaction.guild.channels.cache.filter(
          channel => channel.type === ChannelType.GuildCategory
        ).toArray();
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
      
      for (const channel of channelsToProcess) {
        try {
          // Check if user has a permission override in this channel
          const existingPermissions = channel.permissionOverwrites.cache.get(targetUser.id);
          
          // Skip if user doesn't have permission override or isn't banned from viewing
          if (!existingPermissions || !existingPermissions.deny.has(PermissionFlagsBits.ViewChannel)) {
            skippedCount++;
            continue;
          }
          
          // Remove permission override - restore View Channel permission
          if (existingPermissions.allow.bitfield === 0 && existingPermissions.deny.equals(PermissionFlagsBits.ViewChannel)) {
            // If the only permission is denying ViewChannel, remove the entire override
            await channel.permissionOverwrites.delete(targetUser.id, `Chat unban by ${interaction.user.tag}: ${reason}`);
          } else {
            // Otherwise, just remove the ViewChannel denial
            await channel.permissionOverwrites.edit(targetUser.id, {
              ViewChannel: null
            }, { reason: `Chat unban by ${interaction.user.tag}: ${reason}` });
          }
          
          successCount++;
        } catch (error) {
          logger.error(`Error unbanning ${targetUser.tag} from channel ${channel.name}:`, error);
          errorCount++;
        }
      }
      
      // Log the chat unban action to audit log
      await auditLogService.logAction({
        guildId: interaction.guild.id,
        actionType: 'CHAT_UNBAN',
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
          totalChannels: channelsToProcess.length
        }
      });
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ User Chat Unbanned')
        .setDescription(`${targetUser} has been unbanned from text channels.`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Scope', value: categoryName ? `Category: ${categoryName}` : 'All text channels', inline: true },
          { name: 'Channels Processed', value: channelsToProcess.length.toString(), inline: true },
          { name: 'Results', value: 
            `✅ Success: ${successCount}\n` +
            `⏩ Not banned: ${skippedCount}\n` +
            `❌ Errors: ${errorCount}`
          }
        )
        .setFooter({ text: `Unbanned by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add thumbnail if user has avatar
      if (targetUser.displayAvatarURL()) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }
      
      // Reply with results
      await interaction.followUp({ embeds: [embed] });
      
      logger.info(`${interaction.user.tag} chat unbanned ${targetUser.tag} from ${successCount} channels`);
    } catch (error) {
      logger.error(`Error executing chatunban command:`, error);
      if (interaction.deferred) {
        await interaction.followUp({ 
          content: 'An error occurred while executing the chat unban.',
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: 'An error occurred while executing the chat unban.',
          ephemeral: true 
        });
      }
    }
  }
};