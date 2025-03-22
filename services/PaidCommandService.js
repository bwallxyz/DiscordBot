// services/PaidCommandService.js
const logger = require('../utils/logger');
const {
  registerPaidCommand,
  getPaidCommandConfig,
  getAllPaidCommands,
  updatePaidCommand,
  deletePaidCommand,
  isPaidCommand
} = require('../models/PaidCommandConfig');
const CurrencyService = require('./CurrencyService');

class PaidCommandService {
  constructor(client) {
    this.client = client;
    this.currencyService = new CurrencyService(client);
  }
  
  /**
   * Register a command as a paid command
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Created or updated command config
   */
  async registerCommand(options) {
    try {
      return await registerPaidCommand(options);
    } catch (error) {
      logger.error(`Error in PaidCommandService.registerCommand:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a member can bypass payment for a command
   * @param {Object} member - Discord guild member
   * @param {Object} commandConfig - Paid command config
   * @returns {Boolean} Whether the member can bypass payment
   */
  canBypassPayment(member, commandConfig) {
    // Admin always bypasses
    if (member.permissions.has('Administrator')) {
      return true;
    }
    
    // Check bypass roles
    if (commandConfig.bypassRoles && commandConfig.bypassRoles.length > 0) {
      if (member.roles.cache.some(role => 
        commandConfig.bypassRoles.includes(role.id) || 
        commandConfig.bypassRoles.includes(role.name)
      )) {
        return true;
      }
    }
    
    // Check bypass permissions
    if (commandConfig.bypassPermissions && commandConfig.bypassPermissions.length > 0) {
      if (commandConfig.bypassPermissions.some(perm => member.permissions.has(perm))) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Process a paid command execution
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Result of the command processing
   */
  async processCommand(options) {
    const {
      guildId,
      commandName,
      member,
      user
    } = options;
    
    try {
      // Check if this is a paid command
      const commandInfo = await isPaidCommand(guildId, commandName);
      
      // If not a paid command or disabled, allow execution
      if (!commandInfo.isPaid || !commandInfo.enabled) {
        return {
          success: true,
          isPaid: false,
          message: "Command is not configured as paid"
        };
      }
      
      // Check if member can bypass payment
      if (this.canBypassPayment(member, commandInfo)) {
        return {
          success: true,
          isPaid: true,
          bypassedPayment: true,
          cost: commandInfo.cost,
          message: "Payment bypassed due to role or permission"
        };
      }
      
      // Process the payment
      const chargeResult = await this.currencyService.processPaidCommand({
        guildId,
        userId: user.id,
        commandName,
        username: user.tag,
        displayName: member.displayName
      });
      
      if (!chargeResult.success) {
        return {
          success: false,
          isPaid: true,
          cost: commandInfo.cost,
          balance: chargeResult.balance,
          message: chargeResult.error || "Insufficient funds",
          currencyName: chargeResult.currencyName,
          currencySymbol: chargeResult.currencySymbol
        };
      }
      
      return {
        success: true,
        isPaid: true,
        charged: chargeResult.charged,
        cost: chargeResult.cost,
        newBalance: chargeResult.newBalance,
        message: `Successfully charged ${chargeResult.cost} ${chargeResult.currencyName}`,
        currencyName: chargeResult.currencyName,
        currencySymbol: chargeResult.currencySymbol
      };
    } catch (error) {
      logger.error(`Error in PaidCommandService.processCommand:`, error);
      return {
        success: false,
        error: error.message,
        message: "Error processing command payment"
      };
    }
  }
  
  /**
   * Get all paid commands for a guild
   * @param {String} guildId - Guild ID
   * @returns {Promise<Array>} Array of paid command configs
   */
  async getAllPaidCommands(guildId) {
    try {
      return await getAllPaidCommands(guildId);
    } catch (error) {
      logger.error(`Error in PaidCommandService.getAllPaidCommands:`, error);
      throw error;
    }
  }
  
  /**
   * Update a paid command configuration
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Updated command config
   */
  async updateCommandConfig(options) {
    try {
      return await updatePaidCommand(options);
    } catch (error) {
      logger.error(`Error in PaidCommandService.updateCommandConfig:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a paid command configuration
   * @param {String} guildId - Guild ID
   * @param {String} commandName - Command name
   * @returns {Promise<Boolean>} Whether the config was deleted
   */
  async deleteCommandConfig(guildId, commandName) {
    try {
      return await deletePaidCommand(guildId, commandName);
    } catch (error) {
      logger.error(`Error in PaidCommandService.deleteCommandConfig:`, error);
      throw error;
    }
  }
  
  /**
   * Get detailed information about a paid command
   * @param {String} guildId - Guild ID
   * @param {String} commandName - Command name
   * @returns {Promise<Object>} Detailed command info
   */
  async getCommandDetails(guildId, commandName) {
    try {
      const config = await getPaidCommandConfig(guildId, commandName);
      
      if (!config) {
        return {
          exists: false,
          commandName
        };
      }
      
      // Get currency info from guild settings
      const { currencyName, currencySymbol } = await this.currencyService.getFormattedBalance(guildId, '0');
      
      return {
        exists: true,
        commandName: config.commandName,
        cost: config.cost,
        formattedCost: `${currencySymbol} ${config.cost}`,
        description: config.description,
        enabled: config.enabled,
        isPaid: config.enabled && config.cost > 0,
        bypassRoles: config.bypassRoles,
        bypassPermissions: config.bypassPermissions,
        currencyName,
        currencySymbol
      };
    } catch (error) {
      logger.error(`Error in PaidCommandService.getCommandDetails:`, error);
      throw error;
    }
  }
}

module.exports = PaidCommandService;