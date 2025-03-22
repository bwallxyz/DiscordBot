// server/models/UserLevel.js
const mongoose = require('mongoose');

const userLevelSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  username: String,
  displayName: String,
  xp: Number,
  level: Number,
  voiceXp: Number,
  messageXp: Number,
  lastUpdated: Date
});

module.exports = mongoose.model('UserLevel', userLevelSchema);