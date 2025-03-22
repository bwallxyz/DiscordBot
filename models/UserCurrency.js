// models/UserCurrency.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Guild currency settings schema
const guildCurrencySettingsSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true
  },
  currencyName: {
    type: String,
    default: 'Coins'
  },
  currencySymbol: {
    type: String,
    default: '🪙'
  },
  // Reward rates
  rewardRates: {
    // Currency per minute in voice channels
    voiceActivityPerMinute: {
      type: Number,
      default: 0.5,
      min: 0.1
    },
    // Currency per message
    messageReward: {
      type: Number,
      default: 0.2,
      min: 0.1
    },
    // Cooldown for message rewards (seconds)
    messageRewardCooldown: {
      type: Number,
      default: 60,
      min: 10
    },
    // Daily bonus amount
    dailyBonus: {
      type: Number,
      default: 10,
      min: 1
    },
    // Level up reward (per level)
    levelUpReward: {
      type: Number,
      default: 5,
      min: 1
    }
  },
  // Command costs - Map of command name to cost
  paidCommands: {
    type: Map,
    of: Number,
    default: new Map([
      ['rename', 5],
      ['transfer', 10],
      ['permanent', 100],
      ['vip', 50]
    ])
  },
  // Excluded channels (no currency earned)
  excludedChannels: {
    type: [String],
    default: []
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Currency transaction schema (embedded document)
const transactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['EARN', 'SPEND', 'ADMIN', 'TRANSFER_IN', 'TRANSFER_OUT']
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String
  },
  // Optional reference fields for transfers
  fromUserId: String,
  toUserId: String
});

// User currency schema
const userCurrencySchema = new mongoose.Schema({
  // Identification
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
  
  // Currency balance
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Activity tracking
  lastActivityReward: {
    type: Date
  },
  
  // Transaction history
  transactions: {
    type: [transactionSchema],
    default: []
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save hook to update updatedAt timestamp
guildCurrencySettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create compound index for faster lookups
userCurrencySchema.index({ guildId: 1, userId: 1 }, { unique: true });

// Create models
const UserCurrency = mongoose.model('UserCurrency', userCurrencySchema);
const GuildCurrencySettings = mongoose.model('GuildCurrencySettings', guildCurrencySettingsSchema);

/**
 * Get user currency data
 * @param {String} guildId - Guild ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User currency data
 */
async function getUserCurrency(guildId, userId) {
  return await UserCurrency.findOne({ guildId, userId });
}

/**
 * Get guild currency settings
 * @param {String} guildId - Guild ID
 * @returns {Promise<Object>} Guild currency settings
 */
async function getGuildCurrencySettings(guildId) {
  return await GuildCurrencySettings.findOne({ guildId }) || 
    await GuildCurrencySettings.create({ guildId });
}

/**
 * Update guild currency settings
 * @param {String} guildId - Guild ID
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
async function updateGuildCurrencySettings(guildId, settings) {
  return await GuildCurrencySettings.findOneAndUpdate(
    { guildId },
    settings,
    { new: true, upsert: true }
  );
}

/**
 * Add currency to a user
 * @param {Object} options - Options
 * @returns {Promise<Object>} Updated user currency
 */
async function addCurrency(options) {
  const { 
    guildId, 
    userId, 
    amount, 
    type = 'EARN', 
    description = 'Currency earned', 
    username,
    displayName,
    fromUserId = null,
    toUserId = null
  } = options;
  
  // Validate amount
  if (!amount || amount <= 0) {
    return null;
  }
  
  try {
    // Find or create user currency
    let userCurrency = await UserCurrency.findOne({ guildId, userId });
    
    if (!userCurrency) {
      userCurrency = new UserCurrency({
        guildId,
        userId,
        username,
        displayName,
        balance: 0,
        transactions: []
      });
    }
    
    // Update username and displayName if provided
    if (username) userCurrency.username = username;
    if (displayName) userCurrency.displayName = displayName;
    
    // Add the transaction
    const transaction = {
      amount,
      type,
      timestamp: new Date(),
      description,
      fromUserId,
      toUserId
    };
    
    userCurrency.transactions.push(transaction);
    
    // Update balance
    userCurrency.balance += amount;
    userCurrency.updatedAt = new Date();
    
    // Save changes
    await userCurrency.save();
    
    return userCurrency;
  } catch (error) {
    logger.error(`Error adding currency:`, error);
    throw error;
  }
}

/**
 * Remove currency from a user
 * @param {Object} options - Options
 * @returns {Promise<Object>} Updated user currency or null if insufficient funds
 */
async function removeCurrency(options) {
  const { 
    guildId, 
    userId, 
    amount, 
    type = 'SPEND', 
    description = 'Currency spent',
    fromUserId = null,
    toUserId = null 
  } = options;
  
  // Validate amount
  if (!amount || amount <= 0) {
    return null;
  }
  
  try {
    // Find user currency
    const userCurrency = await UserCurrency.findOne({ guildId, userId });
    
    // If no currency or insufficient balance
    if (!userCurrency || userCurrency.balance < amount) {
      return null;
    }
    
    // Add the transaction
    const transaction = {
      amount: -amount, // Negative amount for spending
      type,
      timestamp: new Date(),
      description,
      fromUserId,
      toUserId
    };
    
    userCurrency.transactions.push(transaction);
    
    // Update balance
    userCurrency.balance -= amount;
    userCurrency.updatedAt = new Date();
    
    // Save changes
    await userCurrency.save();
    
    return userCurrency;
  } catch (error) {
    logger.error(`Error removing currency:`, error);
    throw error;
  }
}

/**
 * Transfer currency between users
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result of the transfer
 */
async function transferCurrency(options) {
  const { 
    guildId, 
    fromUserId, 
    toUserId, 
    amount,
    description = 'Currency transfer'
  } = options;
  
  try {
    // Get sender's currency
    const fromUser = await UserCurrency.findOne({ guildId, userId: fromUserId });
    
    // Check if sender has enough
    if (!fromUser || fromUser.balance < amount) {
      return { 
        success: false, 
        error: 'Insufficient funds',
        senderBalance: fromUser ? fromUser.balance : 0
      };
    }
    
    // Get recipient's currency
    let toUser = await UserCurrency.findOne({ guildId, userId: toUserId });
    
    if (!toUser) {
      // Create recipient if they don't exist
      toUser = new UserCurrency({
        guildId,
        userId: toUserId,
        balance: 0,
        transactions: []
      });
    }
    
    // Add transfer transaction to sender
    fromUser.transactions.push({
      amount: -amount,
      type: 'TRANSFER_OUT',
      description: `Transfer to ${toUser.username || toUserId}: ${description}`,
      toUserId
    });
    
    // Add transfer transaction to recipient
    toUser.transactions.push({
      amount,
      type: 'TRANSFER_IN',
      description: `Transfer from ${fromUser.username || fromUserId}: ${description}`,
      fromUserId
    });
    
    // Update balances
    fromUser.balance -= amount;
    toUser.balance += amount;
    
    // Update timestamps
    const now = new Date();
    fromUser.updatedAt = now;
    toUser.updatedAt = now;
    
    // Save both documents
    await Promise.all([fromUser.save(), toUser.save()]);
    
    return {
      success: true,
      fromUser,
      toUser,
      amount
    };
  } catch (error) {
    logger.error(`Error transferring currency:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a user can afford a command
 * @param {String} guildId - Guild ID
 * @param {String} userId - User ID
 * @param {String} commandName - Command name
 * @returns {Promise<Object>} Result of the check
 */
async function canAffordCommand(guildId, userId, commandName) {
  try {
    // Get guild settings
    const settings = await getGuildCurrencySettings(guildId);
    
    // Get command cost
    const cost = settings.paidCommands.get(commandName) || 0;
    
    // If free, no check needed
    if (cost <= 0) {
      return { 
        canAfford: true, 
        cost, 
        balance: 0,
        currencyName: settings.currencyName,
        currencySymbol: settings.currencySymbol
      };
    }
    
    // Get user currency
    const userCurrency = await getUserCurrency(guildId, userId);
    
    // Check if user has enough
    return {
      canAfford: userCurrency && userCurrency.balance >= cost,
      cost,
      balance: userCurrency ? userCurrency.balance : 0,
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol
    };
  } catch (error) {
    logger.error(`Error checking if user can afford command:`, error);
    throw error;
  }
}

/**
 * Charge a user for a command
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result of the charge
 */
async function chargeForCommand(options) {
  const { 
    guildId, 
    userId, 
    commandName,
    username,
    displayName
  } = options;
  
  try {
    // Check if user can afford
    const check = await canAffordCommand(guildId, userId, commandName);
    
    // If free, no charge needed
    if (check.cost <= 0) {
      return { 
        success: true, 
        charged: false,
        cost: 0,
        ...check
      };
    }
    
    // If can't afford, return failure
    if (!check.canAfford) {
      return {
        success: false,
        charged: false,
        error: 'Insufficient funds',
        ...check
      };
    }
    
    // Charge the user
    const result = await removeCurrency({
      guildId,
      userId,
      amount: check.cost,
      type: 'SPEND',
      description: `Command usage: /${commandName}`
    });
    
    return {
      success: true,
      charged: true,
      cost: check.cost,
      newBalance: result.balance,
      currencyName: check.currencyName,
      currencySymbol: check.currencySymbol
    };
  } catch (error) {
    logger.error(`Error charging for command:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get currency leaderboard
 * @param {String} guildId - Guild ID
 * @param {Number} limit - Maximum number of users to return
 * @returns {Promise<Array>} Leaderboard entries
 */
async function getCurrencyLeaderboard(guildId, limit = 10) {
  try {
    const users = await UserCurrency.find({ guildId })
      .sort({ balance: -1 })
      .limit(limit);
    
    return users.map(user => ({
      userId: user.userId,
      username: user.username || 'Unknown User',
      displayName: user.displayName || 'Unknown',
      balance: user.balance
    }));
  } catch (error) {
    logger.error(`Error getting currency leaderboard:`, error);
    throw error;
  }
}

module.exports = {
  UserCurrency,
  GuildCurrencySettings,
  getUserCurrency,
  getGuildCurrencySettings,
  updateGuildCurrencySettings,
  addCurrency,
  removeCurrency,
  transferCurrency,
  canAffordCommand,
  chargeForCommand,
  getCurrencyLeaderboard
};