// database/schemas/userLevel.js
const mongoose = require('mongoose');
const logger = require('../../utils/logger');

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

// Create the model
const UserLevel = mongoose.model('UserLevel', userLevelSchema);

/**
 * Get user level data
 * @param {String} guildId - Guild ID
 * @param {String} userId - User ID
 */
async function getUserLevel(guildId, userId) {
  return await UserLevel.findOne({ guildId, userId });
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
  const baseMultiplier = settings?.xpSettings?.baseMultiplier || 8;
  const scalingPower = settings?.xpSettings?.scalingPower || 2;
  const scalingMultiplier = settings?.xpSettings?.scalingMultiplier || 1.5;
  
  // Formula optimized for 1 XP = 1 minute of voice activity or ~5 messages
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
  getUserLevel,
  getXpRequiredForLevel,
  calculateLevelFromXp,
  getTotalXpForLevel
};