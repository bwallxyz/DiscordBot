// Enhanced User state tracking service for room moderation states
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const Room = require('../models/Room');

// Define schema for tracking user states in rooms
const userStateSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  roomId: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true,
    enum: ['MUTED', 'BANNED']
  },
  appliedBy: {
    type: String,
    required: true
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    default: 'No reason provided'
  }
});

// Create compound index for faster lookups
userStateSchema.index({ guildId: 1, roomId: 1, userId: 1 }, { unique: true });

// Create the model
const UserState = mongoose.model('UserState', userStateSchema);

class UserStateTrackerService {
  /**
   * Track when a user is muted in a room
   * @param {Object} options - State tracking options
   * @returns {Promise<Object>} Created state entry
   */
  async trackMutedUser(options) {
    try {
      const { guildId, userId, roomId, appliedBy, reason, username } = options;
      
      // Check if user already has a muted state in this room
      const existingState = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state: 'MUTED'
      });
      
      if (existingState) {
        // Update the existing state
        existingState.appliedBy = appliedBy;
        existingState.appliedAt = new Date();
        existingState.reason = reason || 'No reason provided';
        await existingState.save();
        
        // Also update the Room document
        const room = await Room.findOne({ channelId: roomId });
        if (room) {
          // Remove the user from mutedUsers if they're already there
          room.mutedUsers = room.mutedUsers.filter(user => user.userId !== userId);
          
          // Add updated mute info
          room.mutedUsers.push({
            userId,
            username: username || 'Unknown User',
            reason: reason || 'No reason provided',
            mutedAt: new Date(),
            mutedBy: appliedBy
          });
          
          await room.save();
        }
        
        return existingState;
      }
      
      // Create new state entry
      const state = new UserState({
        guildId,
        userId,
        roomId,
        state: 'MUTED',
        appliedBy,
        reason: reason || 'No reason provided'
      });
      
      await state.save();
      logger.info(`User ${userId} muted in room ${roomId} by ${appliedBy}`);
      
      // Also update the Room document
      const room = await Room.findOne({ channelId: roomId });
      if (room) {
        if (!room.mutedUsers) {
          room.mutedUsers = [];
        }
        
        // Add to mutedUsers array
        room.mutedUsers.push({
          userId,
          username: username || 'Unknown User',
          reason: reason || 'No reason provided',
          mutedAt: new Date(),
          mutedBy: appliedBy
        });
        
        await room.save();
      }
      
      return state;
    } catch (error) {
      logger.error(`Error tracking muted user:`, error);
      throw error;
    }
  }
  
  /**
   * Track when a user is banned from a room
   * @param {Object} options - State tracking options
   * @returns {Promise<Object>} Created state entry
   */
  async trackBannedUser(options) {
    try {
      const { guildId, userId, roomId, appliedBy, reason, username } = options;
      
      // Check if user already has a banned state in this room
      const existingState = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state: 'BANNED'
      });
      
      if (existingState) {
        // Update the existing state
        existingState.appliedBy = appliedBy;
        existingState.appliedAt = new Date();
        existingState.reason = reason || 'No reason provided';
        await existingState.save();
        
        // Also update the Room document
        const room = await Room.findOne({ channelId: roomId });
        if (room) {
          // Remove the user from bannedUsers if they're already there
          room.bannedUsers = room.bannedUsers.filter(user => user.userId !== userId);
          
          // Add updated ban info
          room.bannedUsers.push({
            userId,
            username: username || 'Unknown User',
            reason: reason || 'No reason provided',
            bannedAt: new Date(),
            bannedBy: appliedBy
          });
          
          await room.save();
        }
        
        return existingState;
      }
      
      // Create new state entry
      const state = new UserState({
        guildId,
        userId,
        roomId,
        state: 'BANNED',
        appliedBy,
        reason: reason || 'No reason provided'
      });
      
      await state.save();
      logger.info(`User ${userId} banned from room ${roomId} by ${appliedBy}`);
      
      // Also update the Room document
      const room = await Room.findOne({ channelId: roomId });
      if (room) {
        if (!room.bannedUsers) {
          room.bannedUsers = [];
        }
        
        // Add to bannedUsers array
        room.bannedUsers.push({
          userId,
          username: username || 'Unknown User',
          reason: reason || 'No reason provided',
          bannedAt: new Date(),
          bannedBy: appliedBy
        });
        
        await room.save();
      }
      
      return state;
    } catch (error) {
      logger.error(`Error tracking banned user:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a tracked state for a user
   * @param {Object} options - State removal options
   * @returns {Promise<Boolean>} Whether state was removed
   */
  async removeUserState(options) {
    try {
      const { guildId, userId, roomId, state } = options;
      
      const result = await UserState.deleteOne({
        guildId,
        userId,
        roomId,
        state
      });
      
      if (result.deletedCount > 0) {
        logger.info(`Removed ${state} state for user ${userId} in room ${roomId}`);
        
        // Also update the Room document
        const room = await Room.findOne({ channelId: roomId });
        if (room) {
          if (state === 'MUTED' && room.mutedUsers) {
            room.mutedUsers = room.mutedUsers.filter(user => user.userId !== userId);
            await room.save();
          } else if (state === 'BANNED' && room.bannedUsers) {
            room.bannedUsers = room.bannedUsers.filter(user => user.userId !== userId);
            await room.save();
          }
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Error removing user state:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a user has a specific state in a room
   * @param {Object} options - State check options
   * @returns {Promise<Boolean>} Whether user has the state
   */
  async hasUserState(options) {
    try {
      const { guildId, userId, roomId, state } = options;
      
      const exists = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state
      });
      
      return !!exists;
    } catch (error) {
      logger.error(`Error checking user state:`, error);
      throw error;
    }
  }
  
  /**
   * Get all states for a user in a specific room
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @param {String} roomId - Room ID
   * @returns {Promise<Array>} Array of state entries
   */
  async getUserStatesInRoom(guildId, userId, roomId) {
    try {
      return await UserState.find({
        guildId,
        userId,
        roomId
      });
    } catch (error) {
      logger.error(`Error getting user states:`, error);
      throw error;
    }
  }
  
  /**
   * Get all users with a specific state in a room
   * @param {String} guildId - Guild ID
   * @param {String} roomId - Room ID
   * @param {String} state - State to check
   * @returns {Promise<Array>} Array of user IDs with the state
   */
  async getUsersWithStateInRoom(guildId, roomId, state) {
    try {
      const states = await UserState.find({
        guildId,
        roomId,
        state
      });
      
      return states.map(s => s.userId);
    } catch (error) {
      logger.error(`Error getting users with state:`, error);
      throw error;
    }
  }
  
  /**
   * Clear all states for users in a specific room
   * @param {String} guildId - Guild ID
   * @param {String} roomId - Room ID
   * @returns {Promise<Number>} Number of states cleared
   */
  async clearAllStatesForRoom(guildId, roomId) {
    try {
      const result = await UserState.deleteMany({
        guildId,
        roomId
      });
      
      // Also clear the Room document states
      const room = await Room.findOne({ channelId: roomId });
      if (room) {
        room.mutedUsers = [];
        room.bannedUsers = [];
        await room.save();
      }
      
      logger.info(`Cleared ${result.deletedCount} user states for room ${roomId}`);
      return result.deletedCount;
    } catch (error) {
      logger.error(`Error clearing room states:`, error);
      throw error;
    }
  }
  
  /**
   * Get statistics on moderation actions in a room
   * @param {String} guildId - Guild ID
   * @param {String} roomId - Room ID
   * @returns {Promise<Object>} Statistics object
   */
  async getRoomModerationStats(guildId, roomId) {
    try {
      const mutedUsersCount = await UserState.countDocuments({
        guildId, 
        roomId, 
        state: 'MUTED'
      });
      
      const bannedUsersCount = await UserState.countDocuments({
        guildId,
        roomId,
        state: 'BANNED'
      });
      
      const mutedUsers = await this.getUsersWithStateInRoom(guildId, roomId, 'MUTED');
      const bannedUsers = await this.getUsersWithStateInRoom(guildId, roomId, 'BANNED');
      
      return {
        mutedUsersCount,
        bannedUsersCount,
        mutedUsers,
        bannedUsers,
        totalModeratedUsers: mutedUsersCount + bannedUsersCount
      };
    } catch (error) {
      logger.error(`Error getting room moderation stats:`, error);
      throw error;
    }
  }
  
  /**
   * Synchronize states between UserState collection and Room document
   * @param {String} guildId - Guild ID
   * @param {String} roomId - Room ID
   * @returns {Promise<Object>} Sync results
   */
  async syncRoomStates(guildId, roomId) {
    try {
      // Get the room
      const room = await Room.findOne({ channelId: roomId });
      if (!room) {
        throw new Error(`Room not found: ${roomId}`);
      }
      
      // Get all states from UserState collection
      const mutedStates = await UserState.find({
        guildId,
        roomId,
        state: 'MUTED'
      });
      
      const bannedStates = await UserState.find({
        guildId,
        roomId,
        state: 'BANNED'
      });
      
      // Reset room arrays
      room.mutedUsers = [];
      room.bannedUsers = [];
      
      // Sync muted users
      for (const state of mutedStates) {
        room.mutedUsers.push({
          userId: state.userId,
          username: 'Unknown User', // We don't have this info in UserState
          reason: state.reason,
          mutedAt: state.appliedAt,
          mutedBy: state.appliedBy
        });
      }
      
      // Sync banned users
      for (const state of bannedStates) {
        room.bannedUsers.push({
          userId: state.userId,
          username: 'Unknown User', // We don't have this info in UserState
          reason: state.reason,
          bannedAt: state.appliedAt,
          bannedBy: state.appliedBy
        });
      }
      
      // Save the room
      await room.save();
      
      return {
        success: true,
        mutedCount: mutedStates.length,
        bannedCount: bannedStates.length
      };
    } catch (error) {
      logger.error(`Error syncing room states:`, error);
      throw error;
    }
  }
}