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
userStateSchema.index({ guildId: 1, roomId: 1, userId: 1, state: 1 }, { unique: true });

// Create the model
const UserState = mongoose.model('UserState', userStateSchema);

class UserStateTrackerService {
  /**
   * Track when a user is banned from a room - with robust error handling
   * @param {Object} options - State tracking options
   * @returns {Promise<Object>} Updated or created state entry
   */
  async trackBannedUser(options) {
    try {
      const { guildId, userId, roomId, appliedBy, reason, username } = options;
      
      // First try to find an existing state
      let state = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state: 'BANNED'
      });
      
      if (state) {
        // If state exists, just update it
        state.appliedBy = appliedBy;
        state.appliedAt = new Date();
        state.reason = reason || 'No reason provided';
        await state.save();
        
        logger.info(`Updated ban state for user ${userId} in room ${roomId}`);
      } else {
        try {
          // Try to create a new state
          state = new UserState({
            guildId,
            userId,
            roomId,
            state: 'BANNED',
            appliedBy,
            appliedAt: new Date(),
            reason: reason || 'No reason provided'
          });
          
          await state.save();
          logger.info(`Created new ban state for user ${userId} in room ${roomId}`);
        } catch (insertError) {
          // If we get a duplicate key error, try a different approach
          if (insertError.code === 11000) {
            logger.warn(`Duplicate key detected when banning user ${userId} in room ${roomId}, trying updateOne instead`);
            
            // Use updateOne with a filter instead of findOneAndUpdate
            await UserState.updateOne(
              {
                guildId,
                userId,
                roomId,
                state: 'BANNED'
              },
              {
                appliedBy,
                appliedAt: new Date(),
                reason: reason || 'No reason provided'
              }
            );
            
            // Fetch the updated document
            state = await UserState.findOne({
              guildId,
              userId,
              roomId,
              state: 'BANNED'
            });
            
            if (!state) {
              logger.error(`Failed to find or create ban state for user ${userId} in room ${roomId} after updateOne`);
              // Continue anyway to update the Room document
            } else {
              logger.info(`Successfully updated ban state for user ${userId} in room ${roomId} using updateOne`);
            }
          } else {
            // If it's not a duplicate key error, rethrow
            throw insertError;
          }
        }
      }
      
      // Update the Room document regardless of whether the UserState operation succeeded
      try {
        const room = await Room.findOne({ channelId: roomId });
        if (room) {
          if (!room.bannedUsers) {
            room.bannedUsers = [];
          }
          
          // Remove the user from bannedUsers if they're already there
          room.bannedUsers = room.bannedUsers.filter(user => user.userId !== userId);
          
          // Add to bannedUsers array
          room.bannedUsers.push({
            userId,
            username: username || 'Unknown User',
            reason: reason || 'No reason provided',
            bannedAt: new Date(),
            bannedBy: appliedBy
          });
          
          await room.save();
          logger.info(`Updated room document with ban for user ${userId} in room ${roomId}`);
        }
      } catch (roomError) {
        logger.error(`Error updating room document: ${roomError.message}`);
        // Continue anyway, as the UserState is more important
      }
      
      return state;
    } catch (error) {
      logger.error(`Error tracking banned user:`, error);
      // Return a dummy state object so calling code can continue
      return {
        guildId,
        userId,
        roomId,
        state: 'BANNED',
        appliedBy,
        reason: reason || 'No reason provided',
        _errorOccurred: true
      };
    }
  }
  
  /**
   * Track when a user is muted in a room - with robust error handling
   * @param {Object} options - State tracking options
   * @returns {Promise<Object>} Updated or created state entry
   */
  async trackMutedUser(options) {
    try {
      const { guildId, userId, roomId, appliedBy, reason, username } = options;
      
      // First try to find an existing state
      let state = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state: 'MUTED'
      });
      
      if (state) {
        // If state exists, just update it
        state.appliedBy = appliedBy;
        state.appliedAt = new Date();
        state.reason = reason || 'No reason provided';
        await state.save();
        
        logger.info(`Updated mute state for user ${userId} in room ${roomId}`);
      } else {
        try {
          // Try to create a new state
          state = new UserState({
            guildId,
            userId,
            roomId,
            state: 'MUTED',
            appliedBy,
            appliedAt: new Date(),
            reason: reason || 'No reason provided'
          });
          
          await state.save();
          logger.info(`Created new mute state for user ${userId} in room ${roomId}`);
        } catch (insertError) {
          // If we get a duplicate key error, try a different approach
          if (insertError.code === 11000) {
            logger.warn(`Duplicate key detected when muting user ${userId} in room ${roomId}, trying updateOne instead`);
            
            // Use updateOne with a filter instead of findOneAndUpdate
            await UserState.updateOne(
              {
                guildId,
                userId,
                roomId,
                state: 'MUTED'
              },
              {
                appliedBy,
                appliedAt: new Date(),
                reason: reason || 'No reason provided'
              }
            );
            
            // Fetch the updated document
            state = await UserState.findOne({
              guildId,
              userId,
              roomId,
              state: 'MUTED'
            });
            
            if (!state) {
              logger.error(`Failed to find or create mute state for user ${userId} in room ${roomId} after updateOne`);
              // Continue anyway to update the Room document
            } else {
              logger.info(`Successfully updated mute state for user ${userId} in room ${roomId} using updateOne`);
            }
          } else {
            // If it's not a duplicate key error, rethrow
            throw insertError;
          }
        }
      }
      
      // Update the Room document regardless of whether the UserState operation succeeded
      try {
        const room = await Room.findOne({ channelId: roomId });
        if (room) {
          if (!room.mutedUsers) {
            room.mutedUsers = [];
          }
          
          // Remove the user from mutedUsers if they're already there
          room.mutedUsers = room.mutedUsers.filter(user => user.userId !== userId);
          
          // Add to mutedUsers array
          room.mutedUsers.push({
            userId,
            username: username || 'Unknown User',
            reason: reason || 'No reason provided',
            mutedAt: new Date(),
            mutedBy: appliedBy
          });
          
          await room.save();
          logger.info(`Updated room document with mute for user ${userId} in room ${roomId}`);
        }
      } catch (roomError) {
        logger.error(`Error updating room document: ${roomError.message}`);
        // Continue anyway, as the UserState is more important
      }
      
      return state;
    } catch (error) {
      logger.error(`Error tracking muted user:`, error);
      // Return a dummy state object so calling code can continue
      return {
        guildId,
        userId,
        roomId,
        state: 'MUTED',
        appliedBy,
        reason: reason || 'No reason provided',
        _errorOccurred: true
      };
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
      
      // First check the UserState collection
      const exists = await UserState.findOne({
        guildId,
        userId,
        roomId,
        state
      });
      
      if (exists) return true;
      
      // If not found in UserState, also check the Room document as a fallback
      const room = await Room.findOne({ channelId: roomId });
      if (!room) return false;
      
      if (state === 'MUTED' && room.mutedUsers) {
        return room.mutedUsers.some(user => user.userId === userId);
      } else if (state === 'BANNED' && room.bannedUsers) {
        return room.bannedUsers.some(user => user.userId === userId);
      }
      
      return false;
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
      // Get states from the UserState collection
      const states = await UserState.find({
        guildId,
        roomId,
        state
      });
      
      const userIds = states.map(s => s.userId);
      
      // Also check the Room document for additional users with this state
      const room = await Room.findOne({ channelId: roomId });
      if (room) {
        if (state === 'MUTED' && room.mutedUsers) {
          room.mutedUsers.forEach(user => {
            if (!userIds.includes(user.userId)) {
              userIds.push(user.userId);
            }
          });
        } else if (state === 'BANNED' && room.bannedUsers) {
          room.bannedUsers.forEach(user => {
            if (!userIds.includes(user.userId)) {
              userIds.push(user.userId);
            }
          });
        }
      }
      
      return userIds;
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
   * Get all rooms where a user has a specific state
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @param {String} state - State to check (MUTED or BANNED)
   * @returns {Promise<Array>} Array of room IDs
   */
  async getRoomsWithUserState(guildId, userId, state) {
    try {
      // Get states from UserState collection
      const states = await UserState.find({
        guildId,
        userId,
        state
      });
      
      return states.map(s => s.roomId);
    } catch (error) {
      logger.error(`Error getting rooms with user state:`, error);
      throw error;
    }
  }
}

module.exports = { UserStateTrackerService, UserState };