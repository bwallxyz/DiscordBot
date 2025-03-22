// server/models/UserActivity.js
const mongoose = require('mongoose');

const activitySessionSchema = new mongoose.Schema({
  channelId: String,
  channelName: String,
  joinedAt: Date,
  leftAt: Date,
  duration: Number,
  isOwner: Boolean
});

const userActivitySchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  username: String,
  displayName: String,
  totalSessions: Number,
  totalTimeMs: Number,
  lastActive: Date,
  firstSeen: Date,
  currentSession: activitySessionSchema,
  sessionHistory: [activitySessionSchema]
});

module.exports = mongoose.model('UserActivity', userActivitySchema);