// Reminders command - Toggle room reminder system
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Configure the room reminder system (Admin only)')
    .addBooleanOption(option => 
      option.setName('enabled')
        .setDescription('Enable or disable room feature reminders')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('min_interval')
        .setDescription('Minimum interval between reminders (in minutes)')
        .setMinValue(5)
        .setMaxValue(180)
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('max_interval')
        .setDescription('Maximum interval between reminders (in minutes)')
        .setMinValue(10)
        .setMaxValue(360)
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
      
      // Get the reminder service if available
      if (!client.reminderService) {
        return interaction.reply({
          content: 'The reminder service is not initialized.',
          ephemeral: true
        });
      }
      
      // Get options
      const enabled = interaction.options.getBoolean('enabled');
      const minInterval = interaction.options.getInteger('min_interval');
      const maxInterval = interaction.options.getInteger('max_interval');
      
      // Update service configuration
      if (minInterval) {
        client.reminderService.minInterval = minInterval * 60 * 1000; // Convert to ms
      }
      
      if (maxInterval) {
        client.reminderService.maxInterval = maxInterval * 60 * 1000; // Convert to ms
      }
      
      // Validate intervals if both are provided
      if (minInterval && maxInterval && minInterval >= maxInterval) {
        return interaction.reply({
          content: 'The minimum interval must be less than the maximum interval.',
          ephemeral: true
        });
      }
      
      // Enable or disable the service
      client.reminderService.setEnabled(enabled);
      
      // If enabled, refresh the service to apply new settings
      if (enabled) {
        client.reminderService.refresh();
      }
      
      // Create response embed
      const embed = new EmbedBuilder()
        .setColor(enabled ? Colors.Green : Colors.Red)
        .setTitle(`Room Reminders ${enabled ? 'Enabled' : 'Disabled'}`)
        .setDescription(`Room feature reminders have been ${enabled ? 'enabled' : 'disabled'}.`)
        .addFields({
          name: 'Configuration',
          value: `Minimum interval: ${client.reminderService.minInterval / (60 * 1000)} minutes
Maximum interval: ${client.reminderService.maxInterval / (60 * 1000)} minutes`
        })
        .setFooter({ text: `Modified by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Reply to the interaction
      await interaction.reply({ embeds: [embed] });
      
      logger.info(`Room reminders ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing reminders command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while configuring the reminder system.',
        ephemeral: true 
      });
    }
  }
};