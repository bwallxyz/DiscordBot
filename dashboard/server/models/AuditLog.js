// server/models/AuditLog.js
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  guildId: String,
  actionType: String,
  performedBy: {
    userId: String,
    username: String,
    displayName: String
  },
  targetUser: {
    userId: String,
    username: String,
    displayName: String
  },
  room: {
    channelId: String,
    name: String
  },
  details: mongoose.Schema.Types.Mixed,
  createdAt: Date
});

module.exports = mongoose.model('AuditLog', auditLogSchema);