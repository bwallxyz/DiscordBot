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
  // XP rate configuration
xpSettings: {
    // Voice activity (XP per minute)
    voiceXpPerMinute: {
      type: Number,
      default: 1,  // Changed from 15 to 1
      min: 0.1     // Allow fractional XP for flexibility
    },
    // Message activity (XP per message)
    messageXpPerMessage: {
      type: Number,
      default: 1,  // Changed from 5 to 1
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
    if (level <= 0) return 0;
    
    // Allow customization via settings, but provide sensible defaults
    // Since 1 XP = 1 minute, we need to scale our formula accordingly
    const baseMultiplier = settings?.xpSettings?.baseMultiplier || 8;  // Base level multiplier 
    const scalingPower = settings?.xpSettings?.scalingPower || 2;      // Power for the scaling curve
    const scalingMultiplier = settings?.xpSettings?.scalingMultiplier || 1.5; // Multiplier for the curve
    
    // New formula adjusted for 1 XP = 1 minute scaling
    return Math.floor(baseMultiplier * level + scalingMultiplier * Math.pow(level, scalingPower));
  }
  
  /**
   * Calculate the level for a given amount of XP
   * @param {Number} xp - Current XP
   * @param {Object} settings - Guild level settings
   * @returns {Number} Current level based on XP
   */
  function calculateLevelFromXp(xp, settings) {
    if (xp === 0) return 0;
    
    let level = 0;
    let totalXp = 0;
    
    while (true) {
      level++;
      const levelXp = getXpRequiredForLevel(level, settings);
      
      if (totalXp + levelXp > xp) {
        return level - 1;
      }
      
      totalXp += levelXp;
    }
  }
  
  /**
   * Get total XP needed to reach a level
   * @param {Number} level - The level to calculate total XP for
   * @param {Object} settings - Guild level settings
   * @returns {Number} Total XP needed to reach this level
   */
  function getTotalXpForLevel(level, settings) {
    let totalXp = 0;
    for (let i = 1; i <= level; i++) {
      totalXp += getXpRequiredForLevel(i, settings);
    }
    return totalXp;
  }

  module.exports = {
    UserLevel,
    GuildLevelSettings,
    getUserLevel,
    getGuildLevelSettings,
    updateGuildLevelSettings,
    setRoleMultiplier,
    getXpRequiredForLevel,
    calculateLevelFromXp,
    getTotalXpForLevel
  };