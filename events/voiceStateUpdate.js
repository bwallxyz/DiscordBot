// Voice state update event handler
const logger = require('../utils/logger');
const RoomService = require('../services/RoomService');

module.exports = {
  async execute(client, oldState, newState) {
    try {
      const roomService = new RoomService(client);
      
      // Handle room creation when user joins creation channel
      if (newState.channelId) {
        await roomService.handlePotentialRoomCreation(oldState, newState);
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