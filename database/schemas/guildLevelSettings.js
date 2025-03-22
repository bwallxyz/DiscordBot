// database/schemas/guildLevelSettings.js
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

// XP multiplier schema (embedded document)
const xpMultiplierSchema = new mongoose.Schema({
  roleId: {
    type: String,
    required: true
  },
  multiplier: {
    type: Number,
    required: true,
    default: 1.0,
    min: 0.1,
    max: 10.0
  },
  description: {
    type: String
  }
});

// Guild level settings schema
const guildLevelSettingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  
  // XP rate configuration
  xpSettings: {
    // Voice activity (XP per minute)
    voiceXpPerMinute: {
      type: Number,
      default: 1,  
      min: 0.1     // Allow fractional XP for flexibility
    },
    // Message activity (XP per message)
    messageXpPerMessage: {
      type: Number,
      default: 1,  
      min: 0.1
    },
    // Cooldown between message XP awards in seconds
    messageXpCooldown: {
      type: Number,
      default: 60, // 1 minute cooldown between messages
      min: 10
    },
    // Formula customization parameters
    baseMultiplier: {
      type: Number,
      default: 8,
      min: 1
    },
    scalingMultiplier: {
      type: Number,
      default: 1.5,
      min: 0.1
    },
    scalingPower: {
      type: Number,
      default: 2,
      min: 1.1
    }
  },
  
  // Role multipliers
  roleMultipliers: {
    type: [xpMultiplierSchema],
    default: []
  },
  
  // Level-up notification
  notifications: {
    enabled: {
      type: Boolean,
      default: true
    },
    channelId: {
      type: String,
      default: null
    },
    dmUser: {
      type: Boolean,
      default: true
    },
    // If true, shows level-up message in the channel where it happened
    announceInChannel: {
      type: Boolean,
      default: false
    }
  },
  
  // Level-up roles (roles granted at specific levels)
  levelRoles: {
    type: Map,
    of: String,
    default: new Map()
  },
  
  // Excluded channels (no XP earned)
  excludedChannels: {
    type: [String],
    default: []
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
guildLevelSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create models
const GuildLevelSettings = mongoose.model('GuildLevelSettings', guildLevelSettingsSchema);

/**
 * Get guild level settings
 * @param {String} guildId - Guild ID
 */
async function getGuildLevelSettings(guildId) {
  return await GuildLevelSettings.findOne({ guildId }) || 
    await GuildLevelSettings.create({ guildId });
}

/**
 * Update guild level settings
 * @param {String} guildId - Guild ID
 * @param {Object} settings - Settings to update
 */
async function updateGuildLevelSettings(guildId, settings) {
  return await GuildLevelSettings.findOneAndUpdate(
    { guildId },
    settings,
    { new: true, upsert: true }
  );
}

/**
 * Set an XP multiplier for a role
 * @param {String} guildId - Guild ID
 * @param {String} roleId - Role ID
 * @param {Number} multiplier - XP multiplier value
 * @param {String} description - Optional description
 */
async function setRoleMultiplier(guildId, roleId, multiplier, description = "") {
  const settings = await getGuildLevelSettings(guildId);
  
  // Find existing multiplier or create new one
  const existingIndex = settings.roleMultipliers.findIndex(rm => rm.roleId === roleId);
  
  if (existingIndex >= 0) {
    // Update existing
    settings.roleMultipliers[existingIndex].multiplier = multiplier;
    settings.roleMultipliers[existingIndex].description = description;
  } else {
    // Add new
    settings.roleMultipliers.push({
      roleId,
      multiplier,
      description
    });
  }
  
  await settings.save();
  return settings;
}

module.exports = {
  GuildLevelSettings,
  getGuildLevelSettings,
  updateGuildLevelSettings,
  setRoleMultiplier
};