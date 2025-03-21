// User activity tracking schema and model
const mongoose = require('mongoose');

// Activity session schema (embedded document)
const activitySessionSchema = new mongoose.Schema({
  // Channel information
  channelId: {
    type: String,
    required: true
  },
  channelName: {
    type: String,
    required: true
  },
  // Session timing
  joinedAt: {
    type: Date,
    required: true
  },
  leftAt: {
    type: Date
  },
  // Duration in milliseconds (calculated when session ends)
  duration: {
    type: Number
  },
  // If true, this was a room owned by this user
  isOwner: {
    type: Boolean,
    default: false
  },
  lastUpdate: {
    type: Date
  }
});

// User activity schema
const userActivitySchema = new mongoose.Schema({
  // User identification
  guildId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  username: {
    type: String
  },
  displayName: {
    type: String
  },
  
  // Activity statistics (updated on session end)
  totalSessions: {
    type: Number,
    default: 0
  },
  totalTimeMs: {
    type: Number,
    default: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  firstSeen: {
    type: Date,
    default: Date.now
  },
  
  // Current active session (if any)
  currentSession: {
    type: activitySessionSchema
  },
  
  // History of previous sessions
  sessionHistory: {
    type: [activitySessionSchema],
    default: []
  }
});

// Create compound index for faster user lookups
userActivitySchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Create the model
const UserActivity = mongoose.model('UserActivity', userActivitySchema);

/**
 * Start a new activity session for a user
 * @param {Object} options - Session options
 * @returns {Promise<Object>} Updated user activity record
 */
async function startUserSession(options) {
  try {
    const {
      guildId,
      userId,
      username,
      displayName,
      channelId,
      channelName,
      isOwner = false
    } = options;
    
    const now = new Date();
    
    // Find or create user activity record
    const userActivity = await UserActivity.findOneAndUpdate(
      { guildId, userId },
      {
        $setOnInsert: {
          guildId,
          userId,
          firstSeen: now
        }
      },
      { upsert: true, new: true }
    );
    
    // Update user info
    userActivity.username = username;
    userActivity.displayName = displayName;
    userActivity.lastActive = now;
    
    // Create new session
    userActivity.currentSession = {
      channelId,
      channelName,
      joinedAt: now,
      isOwner
    };
    
    await userActivity.save();
    return userActivity;
  } catch (error) {
    throw error;
  }
}

/**
 * End a user's current activity session
 * @param {Object} options - Session end options
 * @returns {Promise<Object>} Updated user activity record
 */
async function endUserSession(options) {
  try {
    const { guildId, userId } = options;
    const now = new Date();
    
    // Find user activity record
    const userActivity = await UserActivity.findOne({ guildId, userId });
    
    // If no record or no current session, return
    if (!userActivity || !userActivity.currentSession) {
      return null;
    }
    
    // Calculate session duration
    const session = userActivity.currentSession;
    session.leftAt = now;
    session.duration = now.getTime() - session.joinedAt.getTime();
    
    // Update statistics
    userActivity.totalSessions += 1;
    userActivity.totalTimeMs += session.duration;
    userActivity.lastActive = now;
    
    // Move current session to history
    userActivity.sessionHistory.push(session);
    userActivity.currentSession = null;
    
    await userActivity.save();
    return userActivity;
  } catch (error) {
    throw error;
  }
}

/**
 * Get a user's activity information
 * @param {String} guildId - Discord guild ID
 * @param {String} userId - Discord user ID
 * @returns {Promise<Object>} User activity record
 */
async function getUserActivity(guildId, userId) {
  return await UserActivity.findOne({ guildId, userId });
}

/**
 * Get total time spent by a user
 * @param {String} guildId - Discord guild ID
 * @param {String} userId - Discord user ID
 * @returns {Promise<Object>} Time statistics
 */
async function getUserTimeStatistics(guildId, userId) {
  const activity = await UserActivity.findOne({ guildId, userId });
  
  if (!activity) {
    return {
      totalTimeMs: 0,
      totalSessions: 0,
      firstSeen: null,
      lastActive: null
    };
  }
  
  // Calculate current session time if user is active
  let currentSessionTime = 0;
  if (activity.currentSession) {
    const now = new Date();
    currentSessionTime = now.getTime() - activity.currentSession.joinedAt.getTime();
  }
  
  return {
    totalTimeMs: activity.totalTimeMs + currentSessionTime,
    totalSessions: activity.totalSessions + (activity.currentSession ? 1 : 0),
    firstSeen: activity.firstSeen,
    lastActive: activity.lastActive
  };
}

/**
 * Get top users by time spent
 * @param {String} guildId - Discord guild ID
 * @param {Number} limit - Maximum number of users to return
 * @returns {Promise<Array>} Array of user activity records
 */
async function getTopUsersByTime(guildId, limit = 10) {
  return await UserActivity.find({ guildId })
    .sort({ totalTimeMs: -1 })
    .limit(limit);
}

async function getUserActivity(guildId, userId) {
  return await UserActivity.findOne({ guildId, userId });
}

module.exports = {
  UserActivity,
  startUserSession,
  endUserSession,
  getUserActivity,
  getUserTimeStatistics,
  getTopUsersByTime
};