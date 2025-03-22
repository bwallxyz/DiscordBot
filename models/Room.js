// MongoDB model for room data
const mongoose = require('mongoose');

// Room schema
const roomSchema = new mongoose.Schema({
  // Discord identifiers
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  ownerId: {
    type: String,
    required: true,
    index: true
  },
  
  // Room details
  name: {
    type: String,
    required: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isPermanent: {
    type: Boolean,
    default: false
  },
  
  // Limits
  userLimit: {
    type: Number,
    default: 0 // 0 means no limit
  },
  
  // Sub-moderators (users who can use mute/unmute)
  submoderators: {
    type: [String],
    default: []
  },
  
  // Activity tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook to update lastActivity timestamp
roomSchema.pre('save', function(next) {
  this.lastActivity = new Date();
  next();
});

// Create room model
const Room = mongoose.model('Room', roomSchema);

module.exports = Room;