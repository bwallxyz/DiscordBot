// models/PaidCommandConfig.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Paid command configuration schema
const paidCommandConfigSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  commandName: {
    type: String,
    required: true,
  },
  enabled: {
    type: Boolean,
    default: true
  },
  cost: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    default: 'Paid command'
  },
  // Roles that can bypass payment
  bypassRoles: {
    type: [String],
    default: []
  },
  // Permissions that can bypass payment (in addition to Administrator)
  bypassPermissions: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for faster lookups
paidCommandConfigSchema.index({ guildId: 1, commandName: 1 }, { unique: true });

// Create the model
const PaidCommandConfig = mongoose.model('PaidCommandConfig', paidCommandConfigSchema);

/**
 * Register a command as a paid command
 * @param {Object} options - Command options
 * @returns {Promise<Object>} Created or updated command config
 */
async function registerPaidCommand(options) {
  const {
    guildId,
    commandName,
    cost = 0,
    description = 'Paid command',
    enabled = true,
    bypassRoles = [],
    bypassPermissions = []
  } = options;
  
  try {
    // Find or create command config
    const config = await PaidCommandConfig.findOneAndUpdate(
      { guildId, commandName },
      {
        cost,
        description,
        enabled,
        bypassRoles,
        bypassPermissions,
        updatedAt: new Date()
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    return config;
  } catch (error) {
    logger.error(`Error registering paid command:`, error);
    throw error;
  }
}

/**
 * Get a paid command configuration
 * @param {String} guildId - Guild ID
 * @param {String} commandName - Command name
 * @returns {Promise<Object>} Command config or null if not found
 */
async function getPaidCommandConfig(guildId, commandName) {
  try {
    return await PaidCommandConfig.findOne({ guildId, commandName });
  } catch (error) {
    logger.error(`Error getting paid command config:`, error);
    throw error;
  }
}

/**
 * Get all paid commands for a guild
 * @param {String} guildId - Guild ID
 * @returns {Promise<Array>} Array of command configs
 */
async function getAllPaidCommands(guildId) {
  try {
    return await PaidCommandConfig.find({ guildId });
  } catch (error) {
    logger.error(`Error getting all paid commands:`, error);
    throw error;
  }
}

/**
 * Update a paid command configuration
 * @param {Object} options - Command options
 * @returns {Promise<Object>} Updated command config
 */
async function updatePaidCommand(options) {
  const {
    guildId,
    commandName,
    cost,
    description,
    enabled,
    bypassRoles,
    bypassPermissions
  } = options;
  
  try {
    // Create update object with only defined fields
    const updateObj = {};
    if (cost !== undefined) updateObj.cost = cost;
    if (description !== undefined) updateObj.description = description;
    if (enabled !== undefined) updateObj.enabled = enabled;
    if (bypassRoles !== undefined) updateObj.bypassRoles = bypassRoles;
    if (bypassPermissions !== undefined) updateObj.bypassPermissions = bypassPermissions;
    updateObj.updatedAt = new Date();
    
    // Update the config
    return await PaidCommandConfig.findOneAndUpdate(
      { guildId, commandName },
      updateObj,
      { new: true }
    );
  } catch (error) {
    logger.error(`Error updating paid command:`, error);
    throw error;
  }
}

/**
 * Delete a paid command configuration
 * @param {String} guildId - Guild ID
 * @param {String} commandName - Command name
 * @returns {Promise<Boolean>} Whether the config was deleted
 */
async function deletePaidCommand(guildId, commandName) {
  try {
    const result = await PaidCommandConfig.deleteOne({ guildId, commandName });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error(`Error deleting paid command:`, error);
    throw error;
  }
}

/**
 * Check if a command is a paid command and get its config
 * @param {String} guildId - Guild ID
 * @param {String} commandName - Command name
 * @returns {Promise<Object>} Command info (isPaid, cost, etc.) or null if not found
 */
async function isPaidCommand(guildId, commandName) {
  try {
    const config = await getPaidCommandConfig(guildId, commandName);
    
    if (!config || !config.enabled || config.cost <= 0) {
      return {
        isPaid: false,
        commandName,
        enabled: config?.enabled ?? false
      };
    }
    
    return {
      isPaid: true,
      commandName,
      cost: config.cost,
      description: config.description,
      enabled: config.enabled,
      bypassRoles: config.bypassRoles,
      bypassPermissions: config.bypassPermissions
    };
  } catch (error) {
    logger.error(`Error checking if command is paid:`, error);
    throw error;
  }
}

module.exports = {
  PaidCommandConfig,
  registerPaidCommand,
  getPaidCommandConfig,
  getAllPaidCommands,
  updatePaidCommand,
  deletePaidCommand,
  isPaidCommand
};