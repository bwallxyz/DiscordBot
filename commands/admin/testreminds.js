// Test reminder command - Send a test reminder to the current room
const { SlashCommandBuilder, EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const Room = require('../../models/Room');
const { isInVoiceChannel } = require('../../utils/validators');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('testreminder')
    .setDescription('Send a test reminder to the current room (Admin only)')
    .addStringOption(option => 
      option.setName('type')
        .setDescription('Type of reminder to send')
        .setRequired(false)
        .addChoices(
          { name: 'Commands', value: 'commands' },
          { name: 'Moderation', value: 'moderation' },
          { name: 'Room Tips', value: 'roomTips' },
          { name: 'Voice Activities', value: 'voiceActivities' },
          { name: 'Random', value: 'random' }
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
      
      // Check if the reminder service is initialized
      if (!client.reminderService) {
        return interaction.reply({
          content: 'The reminder service is not initialized.',
          ephemeral: true
        });
      }
      
      // Check if user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      // Get the voice channel
      const voiceChannel = interaction.member.voice.channel;
      
      // Check if this is a user-created room
      const room = await Room.findOne({ channelId: voiceChannel.id });
      
      if (!room) {
        return interaction.reply({ 
          content: 'This is not a user-created room. Test reminders can only be sent to user-created rooms.',
          ephemeral: true 
        });
      }
      
      // Get the reminder type
      let reminderType = interaction.options.getString('type') || 'random';
      
      // If random, choose a random type
      if (reminderType === 'random') {
        const reminderTypes = Object.keys(client.reminderService.reminderMessages);
        reminderType = reminderTypes[Math.floor(Math.random() * reminderTypes.length)];
      }
      
      // Check if the reminder type exists
      if (!client.reminderService.reminderMessages[reminderType]) {
        return interaction.reply({
          content: `Invalid reminder type: ${reminderType}`,
          ephemeral: true
        });
      }
      
      // Send the reminder
      const reminderContent = client.reminderService.reminderMessages[reminderType];
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(reminderContent.color)
        .setTitle(`${reminderContent.title} (TEST)`)
        .setDescription(reminderContent.description)
        .setFooter({ 
          text: `💡 Test reminder sent by ${interaction.user.tag}` 
        })
        .setTimestamp();
      
      // Add fields if any
      if (reminderContent.fields) {
        for (const field of reminderContent.fields) {
          embed.addFields(field);
        }
      }
      
      // Send the reminder
      await voiceChannel.send({ 
        embeds: [embed],
        content: `<@${room.ownerId}> Room Owner Info (Test Reminder):`
      });
      
      // Reply to the interaction
      await interaction.reply({ 
        content: `Test reminder of type "${reminderType}" sent to the room.`,
        ephemeral: true 
      });
      
      logger.info(`Test ${reminderType} reminder sent to room ${room.name} (${voiceChannel.id}) by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing testreminder command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while sending the test reminder.',
        ephemeral: true 
      });
    }
  }
};