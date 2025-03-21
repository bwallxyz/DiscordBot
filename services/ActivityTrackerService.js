// Enhanced User activity tracking service with XP and leveling integration
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
const LevelingService = require('./LevelingService');

class ActivityTrackerService {
  constructor(client) {
    this.client = client;
    this.levelingService = new LevelingService(client);
  }
  
  /**
   * Track when a user sends a message (for XP)
   * @param {Object} message - Discord message
   */
  async trackUserMessage(message) {
    try {
      // Skip messages from bots, DMs, and system messages
      if (message.author.bot || !message.guild || message.system) return;
      
      // Award XP for the message
      const xpResult = await this.levelingService.awardMessageXp({
        guildId: message.guild.id,
        userId: message.author.id,
        username: message.author.tag,
        displayName: message.member?.displayName || message.author.username,
        channelId: message.channel.id
      });
      
      // If user leveled up, send notification
      if (xpResult.leveledUp && xpResult.levelUpInfo) {
        try {
          const guildSettings = await require('../database/schemas/userLevel').getGuildLevelSettings(message.guild.id);
          
          await this.levelingService.sendLevelUpNotification({
            guild: message.guild,
            member: message.member,
            channel: message.channel,
            oldLevel: xpResult.levelUpInfo.oldLevel,
            newLevel: xpResult.levelUpInfo.newLevel,
            currentXp: xpResult.levelUpInfo.currentXp,
            nextLevelXp: xpResult.levelUpInfo.nextLevelXp,
            settings: guildSettings
          });
        } catch (notifError) {
          logger.error(`Error sending level up notification: ${notifError.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error tracking user message:`, error);
    }
  }
  
  /**
   * Track when a user joins a voice channel
   * @param {Object} member - Discord guild member
   * @param {Object} channel - Voice channel the user joined
   */
  async trackUserJoin(member, channel) {
    try {
      // Skip tracking for bot users
      if (member.user.bot) return;
      
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
      // Skip tracking for bot users
      if (member.user.bot) return;
      
      // Get the user's active session before ending it
      const activity = await getUserActivity(member.guild.id, member.id);
      
      // End current session
      const result = await endUserSession({
        guildId: member.guild.id,
        userId: member.id
      });
      
      if (result && result.currentSession) {
        const formattedDuration = formatDuration(result.currentSession.duration);
        logger.info(`User ${member.user.tag} left channel ${result.currentSession.channelName} after ${formattedDuration}`);
        
        // Only award XP for time since last update
        if (activity && activity.currentSession) {
          const now = new Date();
          const lastUpdate = activity.lastUpdate || activity.currentSession.joinedAt;
          const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
          
          // Only award if at least 1 minute has passed since last update
          if (minutesSinceLastUpdate >= 1) {
            const xpResult = await this.levelingService.awardVoiceXp({
              guildId: member.guild.id,
              userId: member.id,
              username: member.user.tag,
              displayName: member.displayName,
              minutesActive: minutesSinceLastUpdate,
              channelId: result.currentSession.channelId
            });
            
            // If user leveled up, send notification
            if (xpResult.leveledUp && xpResult.levelUpInfo) {
              // ... existing level up notification code ...
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error tracking user leave:`, error);
    }
  }

  /**
   * Update voice XP for a member since their last update
   * @param {Object} options - Options
   * @returns {Promise<Object>} Update result
   */
  async updateVoiceXpForMember(options) {
    const { guild, member, activity, channelId } = options;
    
    try {
      const now = new Date();
      const lastUpdate = activity.lastUpdate || activity.currentSession.joinedAt;
      const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      
      // Only award if at least 1 minute has passed since last update
      if (minutesSinceLastUpdate < 1) {
        return { success: false, reason: 'too_soon' };
      }
      
      // Award XP for this time period - now 1 XP per minute by default
      const xpResult = await this.levelingService.awardVoiceXp({
        guildId: guild.id,
        userId: member.id,
        username: member.user.tag,
        displayName: member.displayName,
        minutesActive: minutesSinceLastUpdate,
        channelId
      });
      
      // Update the last update timestamp
      if (xpResult.success && activity) {
        activity.lastUpdate = now;
        await activity.save();
      }
      
      return xpResult;
    } catch (error) {
      logger.error(`Error updating voice XP for member:`, error);
      return { success: false, error: error.message };
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
  
  /**
   * Get a user's level and XP information
   * @param {String} guildId - Discord guild ID
   * @param {String} userId - Discord user ID
   * @returns {Promise<Object>} User level information
   */
  async getUserLevelInfo(guildId, userId) {
    try {
      return await this.levelingService.getUserLevelInfo(guildId, userId);
    } catch (error) {
      logger.error(`Error getting user level info:`, error);
      throw error;
    }
  }
  
  /**
   * Get level leaderboard
   * @param {String} guildId - Discord guild ID
   * @param {Number} limit - Maximum number of users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getLevelLeaderboard(guildId, limit = 10) {
    try {
      return await this.levelingService.getLevelLeaderboard(guildId, limit);
    } catch (error) {
      logger.error(`Error getting level leaderboard:`, error);
      throw error;
    }
  }
}

module.exports = ActivityTrackerService;