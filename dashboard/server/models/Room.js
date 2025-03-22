// server/models/Room.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  ownerId: String,
  name: String,
  bannedUsers: [String],
  isLocked: Boolean,
  createdAt: Date,
  lastActivity: Date
});

module.exports = mongoose.model('Room', roomSchema);