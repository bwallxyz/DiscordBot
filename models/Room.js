// Room data model
const mongoose = require('mongoose');

// Room schema
const roomSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    unique: true
  },
  ownerId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  bannedUsers: {
    type: [String],
    default: []
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
roomSchema.index({ guildId: 1, ownerId: 1 });

// Update lastActivity on save
roomSchema.pre('save', function(next) {
  this.lastActivity = Date.now();
  next();
});

// Create the model
const Room = mongoose.model('Room', roomSchema);

// Export the model directly
module.exports = Room;