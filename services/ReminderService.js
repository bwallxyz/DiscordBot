// ReminderService.js - Service for sending periodic room feature reminders
const { EmbedBuilder, Colors } = require('discord.js');
const logger = require('../utils/logger');
const Room = require('../models/Room');

class ReminderService {
  constructor(client) {
    this.client = client;
    this.reminderIntervals = new Map(); // Map to store interval IDs by guildId
    this.enabled = true; // Enabled by default
    this.reminderMessages = this.getReminderMessages();
    this.minInterval = 20 * 60 * 1000; // 20 minutes
    this.maxInterval = 60 * 60 * 1000; // 60 minutes
  }

  /**
   * Start the reminder service
   */
  start() {
    if (!this.enabled) return;
    logger.info('Starting room reminder service');
    this.scheduleGuildReminders();
  }

  /**
   * Stop the reminder service
   */
  stop() {
    logger.info('Stopping room reminder service');
    // Clear all existing intervals
    for (const [guildId, intervalId] of this.reminderIntervals.entries()) {
      clearInterval(intervalId);
      this.reminderIntervals.delete(guildId);
    }
  }

  /**
   * Enable or disable the reminder service
   * @param {Boolean} enabled - Whether to enable reminders
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
    logger.info(`Room reminder service ${enabled ? 'enabled' : 'disabled'}`);
    return this.enabled;
  }

  /**
   * Refresh all reminder schedules (useful after bot restart or config change)
   */
  refresh() {
    this.stop();
    if (this.enabled) {
      this.start();
    }
  }

  /**
   * Schedule reminders for all guilds
   */
  scheduleGuildReminders() {
    // Clear any existing schedules
    this.stop();

    // Skip if not enabled
    if (!this.enabled) return;

    // For each guild the bot is in
    this.client.guilds.cache.forEach(guild => {
      this.scheduleGuildReminder(guild.id);
    });
  }

  /**
   * Schedule reminders for a specific guild
   * @param {String} guildId - Discord guild ID
   */
  scheduleGuildReminder(guildId) {
    // Clear existing interval if any
    if (this.reminderIntervals.has(guildId)) {
      clearInterval(this.reminderIntervals.get(guildId));
    }

    // Create a new reminder interval for this guild
    const intervalId = setInterval(async () => {
      try {
        await this.sendGuildReminders(guildId);
        // Reschedule with a new random interval
        clearInterval(intervalId);
        this.scheduleGuildReminder(guildId);
      } catch (error) {
        logger.error(`Error sending guild reminders: ${error}`);
      }
    }, this.getRandomInterval());

    // Store the interval ID
    this.reminderIntervals.set(guildId, intervalId);
  }

  /**
   * Send reminders to all active rooms in a guild
   * @param {String} guildId - Discord guild ID
   */
  async sendGuildReminders(guildId) {
    try {
      // Get the guild
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return;

      // Find all active user-created rooms in the database
      const rooms = await Room.find({ guildId });

      // Skip if no rooms
      if (rooms.length === 0) return;

      // For each room, send a random reminder
      for (const room of rooms) {
        // Get the channel
        const channel = guild.channels.cache.get(room.channelId);
        if (!channel || channel.members.size === 0) continue;

        // Send a random reminder to the channel
        await this.sendRandomReminder(channel, room);
      }
    } catch (error) {
      logger.error(`Error sending guild reminders: ${error}`);
    }
  }

  /**
   * Send a random reminder to a specific room
   * @param {VoiceChannel} channel - Discord voice channel
   * @param {Object} room - Room document from database
   */
  async sendRandomReminder(channel, room) {
    try {
      // Choose a random reminder type
      const reminderTypes = Object.keys(this.reminderMessages);
      const randomType = reminderTypes[Math.floor(Math.random() * reminderTypes.length)];
      
      // Get reminder content
      const reminderContent = this.reminderMessages[randomType];
      
      // Create embed
      const embed = new EmbedBuilder()
        .setColor(reminderContent.color)
        .setTitle(reminderContent.title)
        .setDescription(reminderContent.description)
        .setFooter({ 
          text: `💡 Tip: Room owners have special moderation powers` 
        })
        .setTimestamp();
      
      // Add fields if any
      if (reminderContent.fields) {
        for (const field of reminderContent.fields) {
          embed.addFields(field);
        }
      }
      
      // Send the reminder
      await channel.send({ 
        embeds: [embed],
      //  content: `<@${room.ownerId}> Room Owner Info:`
      });
      
      logger.info(`Sent ${randomType} reminder to room ${room.name} (${channel.id})`);
    } catch (error) {
      logger.error(`Error sending reminder: ${error}`);
    }
  }

  /**
   * Get a random interval between min and max
   * @returns {Number} Interval in milliseconds
   */
  getRandomInterval() {
    return Math.floor(Math.random() * (this.maxInterval - this.minInterval) + this.minInterval);
  }

  /**
   * Generate reminder message templates
   * @returns {Object} Reminder message templates
   */
  getReminderMessages() {
    return {
      commands: {
        title: '📋 Available Room Commands',
        description: 'As the room owner, you have access to these commands:',
        color: Colors.Blue,
        fields: [
          { 
            name: 'Moderation Commands', 
            value: '• `/mute` - Mute a user in your room\n• `/unmute` - Unmute a user\n• `/kick` - Remove a user from your room\n• `/ban` - Ban a user from your room\n• `/unban` - Allow a banned user to join again', 
            inline: false 
          },
          { 
            name: 'Room Management', 
            value: '• `/lock` - Prevent new users from joining\n• `/unlock` - Allow users to join again\n• `/rename` - Change your room name\n• `/limit` - Set a user limit for your room\n• `/transfer` - Transfer room ownership', 
            inline: false 
          }
        ]
      },
      moderation: {
        title: '🛡️ Room Moderation Powers',
        description: 'The room owner can moderate their voice channel:',
        color: Colors.Red,
        fields: [
          { 
            name: 'Voice Permissions', 
            value: 'You can mute disruptive users with `/mute` - they will remain muted even if they leave and rejoin.', 
            inline: false 
          },
          { 
            name: 'Access Control', 
            value: 'Use `/ban` to prevent specific users from joining your room, or `/lock` to temporarily prevent new users from entering.', 
            inline: false 
          },
          { 
            name: 'Community Moderation', 
            value: 'If you\'re not the owner, you can still start a vote to mute someone using `/votemute`.', 
            inline: false 
          }
        ]
      },
      roomTips: {
        title: '💡 Room Management Tips',
        description: 'Make the most of your custom voice room:',
        color: Colors.Green,
        fields: [
          { 
            name: 'Customize Your Space', 
            value: 'Use `/rename` to give your room a unique name that reflects the activity or theme.', 
            inline: false 
          },
          { 
            name: 'Control Room Size', 
            value: 'Use `/limit` to set a maximum number of users for your room (set to 0 for unlimited).', 
            inline: false 
          },
          { 
            name: 'Transfer Ownership', 
            value: 'If you need to leave but want the room to continue, use `/transfer` to make someone else the owner.', 
            inline: false 
          }
        ]
      },
      voiceActivities: {
        title: '🎮 Voice Activities',
        description: 'Make your voice chat more fun with these tips:',
        color: Colors.Purple,
        fields: [
          { 
            name: 'Room Management', 
            value: 'Room owners can rename their room to match the current activity using `/rename`.', 
            inline: false 
          },
          { 
            name: 'Moderation Controls', 
            value: 'If someone is being disruptive, the room owner can use `/mute` or community members can start a vote with `/votemute`.', 
            inline: false 
          }
        ]
      }
    };
  }
}

module.exports = ReminderService;