// Voice state update event handler
const logger = require('../utils/logger');
const RoomService = require('../services/RoomService');
const ActivityTrackerService = require('../services/ActivityTrackerService');
const { getGuildConfig } = require('../database/schemas/guildConfig');

module.exports = {
  async execute(client, oldState, newState) {
    try {
      // Initialize services
      const roomService = new RoomService(client);
      const activityTracker = new ActivityTrackerService(client);
      
      // Track user activity for this voice state change
      await activityTracker.handleVoiceStateUpdate(oldState, newState);
      
      // Check if user joined the creation channel
      if (newState.channelId) {
        const guildConfig = await getGuildConfig(newState.guild.id);
        
        if (guildConfig && guildConfig.creationChannelId && newState.channelId === guildConfig.creationChannelId) {
          logger.info(`User ${newState.member.user.tag} joined creation channel, creating a room`);
          
          // Create room and immediately move the user
          const roomResult = await roomService.createRoomForUserImmediate(newState.member, guildConfig);
          
          if (roomResult && roomResult.success) {
            logger.info(`Successfully created room and moved user ${newState.member.user.tag}`);
            // Skip the normal room creation handler since we already handled it
            return;
          }
        } else {
          // Handle room creation through the normal flow for other cases
          await roomService.handlePotentialRoomCreation(oldState, newState);
        }
      }
      
      // Handle room deletion when a room becomes empty
      if (oldState.channelId && oldState.channel) {
        await roomService.handlePotentialRoomDeletion(oldState, newState);
      }
    } catch (error) {
      logger.error('Error handling voice state update:', error);
    }
  }
};