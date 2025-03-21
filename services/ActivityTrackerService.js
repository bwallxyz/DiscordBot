// User activity tracking service
const logger = require('../utils/logger');
const {
  startUserSession,
  endUserSession,
  getUserActivity,
  getUserTimeStatistics,
  getTopUsersByTime
} = require('../database/schemas/userActivity');
const Room = require('../models/Room');
const { formatDuration } = require('../utils/formatters');

class ActivityTrackerService {
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Track when a user joins a voice channel
   * @param {Object} member - Discord guild member
   * @param {Object} channel - Voice channel the user joined
   */
  async trackUserJoin(member, channel) {
    try {
      // Check if this channel is a user-created room
      const isUserRoom = await Room.findOne({ channelId: channel.id });
      const isOwner = isUserRoom && isUserRoom.ownerId === member.id;
      
      // Start tracking session
      await startUserSession({
        guildId: member.guild.id,
        userId: member.id,
        username: member.user.tag,
        displayName: member.displayName,
        channelId: channel.id,
        channelName: channel.name,
        isOwner
      });
      
      logger.info(`Started tracking user ${member.user.tag} in channel ${channel.name}`);
    } catch (error) {
      logger.error(`Error tracking user join:`, error);
    }
  }
  
  /**
   * Track when a user leaves a voice channel
   * @param {Object} member - Discord guild member
   */
  async trackUserLeave(member) {
    try {
      // End current session if exists
      const result = await endUserSession({
        guildId: member.guild.id,
        userId: member.id
      });
      
      if (result) {
        const formattedDuration = formatDuration(result.currentSession.duration);
        logger.info(`User ${member.user.tag} left channel ${result.currentSession.channelName} after ${formattedDuration}`);
      }
    } catch (error) {
      logger.error(`Error tracking user leave:`, error);
    }
  }
  
  /**
   * Handle voice state update events to track user activity
   * @param {Object} oldState - Previous voice state
   * @param {Object} newState - Current voice state
   */
  async handleVoiceStateUpdate(oldState, newState) {
    try {
      const { member } = newState;
      
      // Skip tracking for bot users
      if (member.user.bot) return;
      
      // Case 1: User joined a voice channel
      if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        await this.trackUserJoin(member, channel);
      }
      // Case 2: User switched channels
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // First end the old session
        await this.trackUserLeave(member);
        
        // Then start a new one
        const channel = newState.channel;
        await this.trackUserJoin(member, channel);
      }
      // Case 3: User left voice
      else if (oldState.channelId && !newState.channelId) {
        await this.trackUserLeave(member);
      }
    } catch (error) {
      logger.error(`Error handling voice state update for activity tracking:`, error);
    }
  }
  
  /**
   * Get a user's activity statistics
   * @param {String} guildId - Discord guild ID
   * @param {String} userId - Discord user ID
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats(guildId, userId) {
    try {
      const stats = await getUserTimeStatistics(guildId, userId);
      const activity = await getUserActivity(guildId, userId);
      
      return {
        userId,
        username: activity?.username || 'Unknown User',
        displayName: activity?.displayName || 'Unknown',
        totalTime: stats.totalTimeMs,
        formattedTime: formatDuration(stats.totalTimeMs),
        totalSessions: stats.totalSessions,
        firstSeen: stats.firstSeen,
        lastActive: stats.lastActive,
        isCurrentlyActive: !!activity?.currentSession,
        currentSession: activity?.currentSession ? {
          channelId: activity.currentSession.channelId,
          channelName: activity.currentSession.channelName,
          joinedAt: activity.currentSession.joinedAt,
          duration: formatDuration(Date.now() - activity.currentSession.joinedAt.getTime())
        } : null
      };
    } catch (error) {
      logger.error(`Error getting user stats:`, error);
      throw error;
    }
  }
  
  /**
   * Get activity leaderboard
   * @param {String} guildId - Discord guild ID
   * @param {Number} limit - Max number of users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getActivityLeaderboard(guildId, limit = 10) {
    try {
      const topUsers = await getTopUsersByTime(guildId, limit);
      
      return topUsers.map(user => ({
        userId: user.userId,
        username: user.username || 'Unknown User',
        displayName: user.displayName || 'Unknown',
        totalTime: user.totalTimeMs,
        formattedTime: formatDuration(user.totalTimeMs),
        totalSessions: user.totalSessions,
        lastActive: user.lastActive
      }));
    } catch (error) {
      logger.error(`Error getting activity leaderboard:`, error);
      throw error;
    }
  }
}

module.exports = ActivityTrackerService;