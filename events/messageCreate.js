// Message create event handler for XP tracking
const logger = require('../utils/logger');
const ActivityTrackerService = require('../services/ActivityTrackerService');

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    try {
      // Skip if not a guild message, or from a bot, or a system message
      if (!message.guild || message.author.bot || message.system) {
        return;
      }
      
      // Track the message for XP
      const activityTracker = new ActivityTrackerService(client);
      await activityTracker.trackUserMessage(message);
    } catch (error) {
      logger.error(`Error handling messageCreate event:`, error);
    }
  }
};