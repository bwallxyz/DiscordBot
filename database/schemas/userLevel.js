// User experience and leveling schema
const mongoose = require('mongoose');

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

// User levels schema
const userLevelSchema = new mongoose.Schema({
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
  
  // Experience points
  xp: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 0
  },
  
  // Activity tracking
  voiceXp: {
    type: Number,
    default: 0
  },
  messageXp: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  lastMessageXpAwarded: {
    type: Date,
    default: null
  }
});

// Create compound index for faster lookups
userLevelSchema.index({ guildId: 1, userId: 1 }, { unique: true });

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
      default: 15,
      min: 1
    },
    // Message activity (XP per message)
    messageXpPerMessage: {
      type: Number,
      default: 5,
      min: 1
    },
    // Cooldown between message XP awards in seconds
    messageXpCooldown: {
      type: Number,
      default: 60,
      min: 10
    },
    // Base XP required for level 1
    baseXpRequired: {
      type: Number,
      default: 100,
      min: 10
    },
    // XP scaling factor (multiplier for each level)
    xpScalingFactor: {
      type: Number,
      default: 1.5,
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
const UserLevel = mongoose.model('UserLevel', userLevelSchema);
const GuildLevelSettings = mongoose.model('GuildLevelSettings', guildLevelSettingsSchema);

/**
 * Get user level data
 * @param {String} guildId - Guild ID
 * @param {String} userId - User ID
 */
async function getUserLevel(guildId, userId) {
  return await UserLevel.findOne({ guildId, userId });
}

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

/**
 * Get XP required for a specific level
 * @param {Number} level - The level to calculate XP for
 * @param {Object} settings - Guild level settings
 * @returns {Number} XP required for this level
 */
function getXpRequiredForLevel(level, settings) {
    const baseXp = settings.xpSettings.baseXpRequired;
    const scalingFactor = settings.xpSettings.xpScalingFactor;
    
    return Math.floor(baseXp * Math.pow(scalingFactor, level - 1));
  }

/**
 * Calculate the level for a given amount of XP
 * @param {Number} xp - Current XP
 * @param {Object} settings - Guild level settings
 * @returns {Number} Current level based on XP
 */
function calculateLevelFromXp(xp, settings) {
    const baseXp = settings.xpSettings.baseXpRequired;
    const scalingFactor = settings.xpSettings.xpScalingFactor;
    
    // Level 0 has 0 XP
    if (xp === 0) return 0;
    
    let level = 0;
    let totalXpForNextLevel = 0;
    
    // Keep increasing level until we find the correct one
    while (true) {
      const xpForNextLevel = Math.floor(baseXp * Math.pow(scalingFactor, level));
      totalXpForNextLevel += xpForNextLevel;
      
      if (xp < totalXpForNextLevel) {
        return level;
      }
      
      level++;
    }
  }

module.exports = {
  UserLevel,
  GuildLevelSettings,
  getUserLevel,
  getGuildLevelSettings,
  updateGuildLevelSettings,
  setRoleMultiplier,
  getXpRequiredForLevel,
  calculateLevelFromXp
};