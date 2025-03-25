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
    this.lastMessageIds = new Map(); // Map to store the last message ID sent to each channel
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
      // Delete the previous message if it exists
      const previousMessageId = this.lastMessageIds.get(channel.id);
      if (previousMessageId) {
        try {
          // Try to fetch and delete the previous message
          const previousMessage = await channel.messages.fetch(previousMessageId);
          if (previousMessage) {
            await previousMessage.delete();
            logger.info(`Deleted previous reminder message in ${room.name} (${channel.id})`);
          }
        } catch (error) {
          // Message might not exist anymore, just log and continue
          logger.warn(`Could not delete previous message in ${room.name}: ${error.message}`);
        }
      }

      // Randomly decide whether to show the owner information or a regular reminder
      const showOwnerInfo = Math.random() < 0.25; // 25% chance to show owner info
      
      if (showOwnerInfo) {
        // Check if the room has an owner
        const hasOwner = !!room.ownerId;
        const channelId = channel.id;
        const guild = channel.guild;
        
        // Create the embed
        const reminderEmbed = new EmbedBuilder()
          .setTitle("📢 Channel Information")
          .setColor(hasOwner ? '#00AAFF' : '#FFA500')
          .setTimestamp();
        
        if (hasOwner) {
          // Get the owner's ID and try to fetch their username
          const ownerId = room.ownerId;
          let ownerName = 'Unknown User';
          
          try {
            const owner = await guild.members.fetch(ownerId);
            ownerName = owner.user.username;
            
            // Add owner's avatar if available
            if (owner.user.displayAvatarURL()) {
              reminderEmbed.setThumbnail(owner.user.displayAvatarURL());
            }
          } catch (error) {
            logger.error(`Could not fetch owner ${ownerId} for channel ${channelId}`, error);
          }
          
          reminderEmbed
            .setDescription(`This voice channel is owned by <@${ownerId}> (${ownerName})`)
            .addFields(
              { name: 'Owner Permissions', value: 'The channel owner can use commands like `/kick`, `/ban`, and `/mute` to moderate this channel.' },
              { name: 'Owner Commands', value: 'Additional commands include `/rename`, `/limit`, `/submod`, and more.' }
            );
        }
        
        // Send the reminder and store the message ID
        const sentMessage = await channel.send({ embeds: [reminderEmbed] });
        this.lastMessageIds.set(channel.id, sentMessage.id);
        
        logger.info(`Sent owner info reminder to room ${room.name} (${channelId})`);
      } else {
        // Choose a random reminder type from the reminder messages
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
        
        // Send the reminder and store the message ID
        const sentMessage = await channel.send({ embeds: [embed] });
        this.lastMessageIds.set(channel.id, sentMessage.id);
        
        logger.info(`Sent ${randomType} reminder to room ${room.name} (${channelId})`);
      }
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
      votemuteReminder: {
        title: '🔇 Votemute Reminder',
        description: 'Keep the conversation enjoyable for everyone!',
        color: Colors.Red,
        fields: [
          {
            name: 'Using /votemute',
            value: 'Any user can run `/votemute` on a disruptive user at any time to start a community vote.',
            inline: false
          }
        ]
      },
      inviteReminder: {
        title: '👋 Invite Your Friends!',
        description: 'The Brainiac community thrives with more like-minded individuals.',
        color: Colors.Green,
        fields: [
          {
            name: 'Spread the Word',
            value: 'Invite your friends to join and help keep the community strong!',
            inline: false
          }
        ]
      },
      createRoomReminder: {
        title: '🏠 Create Your Own Room!',
        description: 'Want your own space? You can create a room at any time.',
        color: Colors.Blue,
        fields: [
          {
            name: 'How to Create',
            value: 'Join `+CREATE` to create your own room where you can moderate it how you see fit.',
            inline: false
          }
        ]
      }
    };
  }
}

module.exports = ReminderService;