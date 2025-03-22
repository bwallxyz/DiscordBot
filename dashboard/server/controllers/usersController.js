// server/controllers/usersController.js
/**
 * Users controller
 */

const moment = require('moment');
const { UserLevel, UserActivity } = require('../models');
const { formatDuration } = require('../../../utils/formatters');
const LevelingService = require('../../../services/LevelingService');

// Get all users with pagination and search
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    
    // Build query
    const query = { guildId: process.env.GUILD_ID };
    
    // Add search filter if provided
    if (search) {
      query.username = { $regex: search, $options: 'i' };
    }
    
    // Get total count for pagination
    const total = await UserLevel.countDocuments(query);
    
    // Get users with pagination
    const users = await UserLevel.find(query)
      .sort({ xp: -1 })
      .skip(page * limit)
      .limit(limit);
    
    // Enhance user data with activity information
    const enhancedUsers = await Promise.all(users.map(async (user) => {
      const userObj = user.toObject();
      
      // Get activity data
      const activity = await UserActivity.findOne({
        guildId: process.env.GUILD_ID,
        userId: user.userId
      });
      
      if (activity) {
        userObj.totalTimeMs = activity.totalTimeMs;
        userObj.formattedTime = formatDuration(activity.totalTimeMs);
        userObj.totalSessions = activity.totalSessions;
        userObj.lastActive = activity.lastActive;
        userObj.isActive = !!activity.currentSession;
      }
      
      return userObj;
    }));
    
    res.json({
      users: enhancedUsers,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get user statistics by ID
exports.getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user level data
    const userLevel = await UserLevel.findOne({
      guildId: process.env.GUILD_ID,
      userId
    });
    
    if (!userLevel) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user activity data
    const userActivity = await UserActivity.findOne({
      guildId: process.env.GUILD_ID,
      userId
    });
    
    // Calculate XP for current and next level
    const guildSettings = await require('../../database/schemas/userLevel').getGuildLevelSettings(process.env.GUILD_ID);
    const nextLevelXp = require('../../database/schemas/userLevel').getXpRequiredForLevel(userLevel.level + 1, guildSettings);
    
    // Calculate activity by day for the last 7 days
    const activityByDay = {};
    const today = moment().startOf('day');
    
    // Initialize days
    for (let i = 6; i >= 0; i--) {
      const date = moment(today).subtract(i, 'days');
      activityByDay[date.format('MM/DD')] = 0;
    }
    
    // If we have activity data, calculate time spent on each day
    if (userActivity && userActivity.sessionHistory.length > 0) {
      userActivity.sessionHistory.forEach(session => {
        const sessionDate = moment(session.joinedAt).startOf('day');
        const dayDiff = today.diff(sessionDate, 'days');
        
        // Only count sessions from the last 7 days
        if (dayDiff >= 0 && dayDiff <= 6) {
          const dateKey = sessionDate.format('MM/DD');
          const durationMinutes = session.duration ? Math.floor(session.duration / (1000 * 60)) : 0;
          
          activityByDay[dateKey] = (activityByDay[dateKey] || 0) + durationMinutes;
        }
      });
    }
    
    // Format current session if active
    let currentSession = null;
    if (userActivity && userActivity.currentSession) {
      const now = new Date();
      const joinedAt = userActivity.currentSession.joinedAt;
      const durationMs = now.getTime() - joinedAt.getTime();
      
      currentSession = {
        channelId: userActivity.currentSession.channelId,
        channelName: userActivity.currentSession.channelName,
        joinedAt,
        duration: formatDuration(durationMs),
        isOwner: userActivity.currentSession.isOwner
      };
    }
    
    // Combine all data
    const userData = {
      userId: userLevel.userId,
      username: userLevel.username,
      displayName: userLevel.displayName,
      level: userLevel.level,
      xp: userLevel.xp,
      voiceXp: userLevel.voiceXp || 0,
      messageXp: userLevel.messageXp || 0,
      nextLevelXp,
      totalTimeMs: userActivity?.totalTimeMs || 0,
      formattedTime: formatDuration(userActivity?.totalTimeMs || 0),
      totalSessions: userActivity?.totalSessions || 0,
      firstSeen: userActivity?.firstSeen,
      lastActive: userActivity?.lastActive,
      activityByDay,
      currentSession
    };
    
    res.json(userData);
  } catch (err) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
};

// Update user XP (admin only)
exports.updateUserXp = async (req, res) => {
  try {
    const { userId } = req.params;
    const { xp, reason } = req.body;
    
    if (xp === undefined) {
      return res.status(400).json({ error: 'XP value is required' });
    }
    
    // Get user level data
    let userLevel = await UserLevel.findOne({
      guildId: process.env.GUILD_ID,
      userId
    });
    
    if (!userLevel) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Record old level for comparison
    const oldLevel = userLevel.level;
    
    // Update XP
    userLevel.xp = xp;
    
    // Recalculate level
    const guildSettings = await require('../../database/schemas/userLevel').getGuildLevelSettings(process.env.GUILD_ID);
    userLevel.level = require('../../database/schemas/userLevel').calculateLevelFromXp(xp, guildSettings);
    
    // Save changes
    await userLevel.save();
    
    // Check if level changed
    const levelChanged = oldLevel !== userLevel.level;
    
    res.json({
      userId,
      oldXp: userLevel.xp - xp,
      newXp: userLevel.xp,
      oldLevel,
      newLevel: userLevel.level,
      levelChanged,
      reason
    });
  } catch (err) {
    console.error('Error updating user XP:', err);
    res.status(500).json({ error: 'Failed to update user XP' });
  }
};

// Get user's active sessions and history
exports.getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const userActivity = await UserActivity.findOne({
      guildId: process.env.GUILD_ID,
      userId
    });
    
    if (!userActivity) {
      return res.status(404).json({ error: 'User activity data not found' });
    }
    
    // Format the current session if active
    let currentSession = null;
    if (userActivity.currentSession) {
      const now = new Date();
      const joinedAt = userActivity.currentSession.joinedAt;
      const durationMs = now.getTime() - joinedAt.getTime();
      
      currentSession = {
        ...userActivity.currentSession.toObject(),
        duration: formatDuration(durationMs)
      };
    }
    
    // Format recent session history (last 20 sessions)
    const sessionHistory = userActivity.sessionHistory
      .slice(-20)
      .map(session => ({
        ...session.toObject(),
        duration: formatDuration(session.duration)
      }))
      .reverse(); // Most recent first
    
    res.json({
      userId,
      username: userActivity.username,
      displayName: userActivity.displayName,
      totalTimeMs: userActivity.totalTimeMs,
      formattedTime: formatDuration(userActivity.totalTimeMs),
      totalSessions: userActivity.totalSessions,
      firstSeen: userActivity.firstSeen,
      lastActive: userActivity.lastActive,
      currentSession,
      sessionHistory
    });
  } catch (err) {
    console.error('Error fetching user activity:', err);
    res.status(500).json({ error: 'Failed to fetch user activity data' });
  }
};