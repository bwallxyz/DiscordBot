// Guild configuration schema and model
const mongoose = require('mongoose');

// Guild configuration schema
const guildConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  creationChannelId: {
    type: String,
    required: true
  },
  roomCategoryId: {
    type: String,
    required: true
  },
  autoDeleteEmptyRooms: {
    type: Boolean,
    default: true
  },
  roomPrefix: {
    type: String,
    default: ""
  },
  maxRoomsPerUser: {
    type: Number,
    default: 1
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
guildConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create the model
const GuildConfig = mongoose.model('GuildConfig', guildConfigSchema);

/**
 * Get guild configuration
 */
async function getGuildConfig(guildId) {
  return await GuildConfig.findOne({ guildId });
}

/**
 * Set guild configuration
 */
async function setGuildConfig(guildId, config) {
  return await GuildConfig.findOneAndUpdate(
    { guildId },
    { ...config, guildId },
    { new: true, upsert: true }
  );
}

module.exports = {
  GuildConfig,
  getGuildConfig,
  setGuildConfig
};