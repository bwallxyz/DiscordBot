// Audit log schema and model for tracking moderation actions and room events
const mongoose = require('mongoose');

// Audit log schema
const auditLogSchema = new mongoose.Schema({
  // Guild information
  guildId: {
    type: String,
    required: true,
    index: true
  },
  
  // Action information
  actionType: {
    type: String,
    required: true,
    enum: [
      // Room events
      'ROOM_CREATE',
      'ROOM_DELETE',
      'ROOM_RENAME',
      'ROOM_TRANSFER',
      'ROOM_SET_PERMANENT',
      'ROOM_SET_TEMPORARY',
      'ROOM_LIMIT_CHANGE',
      'ROOM_ADD_SUBMOD',
      'ROOM_REMOVE_SUBMOD',
      
      // Moderation actions
      'USER_MUTE',
      'USER_UNMUTE',
      'USER_KICK',
      'USER_BAN',
      'USER_UNBAN',
      'ROOM_LOCK',
      'ROOM_UNLOCK',
      'ROOM_SYNC_PERMISSIONS',
      'ROOM_SYNC_ALL_PERMISSIONS',
      
      // Chat moderation actions
      'CHAT_BAN',
      'CHAT_UNBAN'
    ],
    index: true
  },
  
  // User who performed the action
  performedBy: {
    userId: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    displayName: {
      type: String
    }
  },
  
  // Target user (if applicable)
  targetUser: {
    userId: {
      type: String
    },
    username: {
      type: String
    },
    displayName: {
      type: String
    }
  },
  
  // Room information
  room: {
    channelId: {
      type: String
    },
    name: {
      type: String
    }
  },
  
  // Additional data (for flexibility)
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Create indexes for faster queries
auditLogSchema.index({ guildId: 1, actionType: 1 });
auditLogSchema.index({ guildId: 1, 'performedBy.userId': 1 });
auditLogSchema.index({ guildId: 1, 'targetUser.userId': 1 });
auditLogSchema.index({ guildId: 1, 'room.channelId': 1 });

// Create the model
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/**
 * Log an audit entry to the database
 * @param {Object} entry - The audit log entry data
 * @returns {Promise<Object>} The created audit log entry
 */
async function logAuditEntry(entry) {
  try {
    const auditEntry = new AuditLog(entry);
    return await auditEntry.save();
  } catch (error) {
    throw error;
  }
}

/**
 * Get audit logs for a guild
 * @param {String} guildId - The Discord guild ID
 * @param {Object} filters - Optional filters (actionType, userId, etc.)
 * @param {Number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getAuditLogs(guildId, filters = {}, limit = 100) {
  const query = { guildId, ...filters };
  return await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Get audit logs for a specific room
 * @param {String} guildId - The Discord guild ID
 * @param {String} channelId - The room's channel ID
 * @param {Number} limit - Maximum number of entries to return
 * @returns {Promise<Array>} Array of audit log entries
 */
async function getRoomAuditLogs(guildId, channelId, limit = 50) {
  return await AuditLog.find({
    guildId,
    'room.channelId': channelId
  })
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Get active temporary chat bans
 * @param {String} guildId - The Discord guild ID
 * @returns {Promise<Array>} Array of temporary chat ban entries
 */
async function getActiveTemporaryChatBans(guildId) {
  const now = new Date();
  return await AuditLog.find({
    guildId,
    actionType: 'CHAT_BAN',
    'details.expiresAt': { $gt: now }
  }).sort({ 'details.expiresAt': 1 });
}

module.exports = {
  AuditLog,
  logAuditEntry,
  getAuditLogs,
  getRoomAuditLogs,
  getActiveTemporaryChatBans
};