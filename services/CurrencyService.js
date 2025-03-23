// Currency service for managing user currency
const logger = require('../utils/logger');
const { 
  getUserCurrency, 
  getGuildCurrencySettings,
  addCurrency, 
  removeCurrency,
  transferCurrency,
  getCurrencyLeaderboard,
  canAffordCommand,
  chargeForCommand
} = require('../database/schemas/userCurrency');

class CurrencyService {
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Add currency to a user
   * @param {Object} options - Options
   * @returns {Promise<Object>} Updated user currency
   */
  async addCurrency(options) {
    try {
      return await addCurrency(options);
    } catch (error) {
      logger.error(`Error in CurrencyService.addCurrency:`, error);
      throw error;
    }
  }
  
  /**
   * Award currency for voice activity
   * @param {Object} options - Voice activity options
   * @returns {Promise<Object>} Updated user currency data
   */
  async awardVoiceCurrency(options) {
    try {
      const { 
        guildId, 
        userId, 
        username, 
        displayName, 
        minutesActive,
        channelId 
      } = options;
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // Check if channel is excluded (reusing XP exclusion settings)
      if (guildSettings.excludedChannels && guildSettings.excludedChannels.includes(channelId)) {
        return { success: false, reason: 'excluded_channel' };
      }
      
      // Calculate base currency from voice activity
      const currencyGain = Math.floor(
        minutesActive * guildSettings.rewardRates.voiceActivityPerMinute * 10
      ) / 10; // Round to 1 decimal place
      
      if (currencyGain <= 0) {
        return { success: false, reason: 'no_currency_earned' };
      }
      
      // Award the currency
      const result = await this.addCurrency({
        guildId,
        userId,
        amount: currencyGain,
        type: 'EARN',
        description: `Voice activity (${Math.round(minutesActive)} minutes)`,
        username,
        displayName
      });
      
      return {
        success: true,
        currency: result,
        earned: currencyGain,
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error awarding voice currency:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Award currency for messages
   * @param {Object} options - Message options
   * @returns {Promise<Object>} Updated user currency data
   */
  async awardMessageCurrency(options) {
    try {
      const { 
        guildId, 
        userId, 
        username, 
        displayName, 
        channelId 
      } = options;
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // Check if channel is excluded (reusing XP exclusion settings)
      if (guildSettings.excludedChannels && guildSettings.excludedChannels.includes(channelId)) {
        return { success: false, reason: 'excluded_channel' };
      }
      
      // Get user currency to check cooldown
      const userCurrency = await getUserCurrency(guildId, userId);
      
      // Check for message currency cooldown
      const now = new Date();
      const cooldownMs = guildSettings.rewardRates.messageRewardCooldown * 1000;
      
      if (userCurrency?.lastActivityReward && 
          now.getTime() - userCurrency.lastActivityReward.getTime() < cooldownMs) {
        return { success: false, reason: 'cooldown' };
      }
      
      // Award the currency
      const currencyGain = guildSettings.rewardRates.messageReward;
      
      const result = await this.addCurrency({
        guildId,
        userId,
        amount: currencyGain,
        type: 'EARN',
        description: 'Message activity',
        username,
        displayName
      });
      
      // Update the last reward timestamp
      result.lastActivityReward = now;
      await result.save();
      
      return {
        success: true,
        currency: result,
        earned: currencyGain,
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error awarding message currency:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Award currency for level up
   * @param {Object} options - Level up options
   * @returns {Promise<Object>} Updated user currency data
   */
  async awardLevelUpCurrency(options) {
    try {
      const { 
        guildId, 
        userId, 
        username, 
        displayName, 
        oldLevel,
        newLevel
      } = options;
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // Calculate currency based on level difference
      const levelDiff = newLevel - oldLevel;
      const currencyGain = levelDiff * guildSettings.rewardRates.levelUpReward;
      
      if (currencyGain <= 0) {
        return { success: false, reason: 'no_currency_earned' };
      }
      
      // Award the currency
      const result = await this.addCurrency({
        guildId,
        userId,
        amount: currencyGain,
        type: 'EARN',
        description: `Level up reward (Level ${oldLevel} → ${newLevel})`,
        username,
        displayName
      });
      
      return {
        success: true,
        currency: result,
        earned: currencyGain,
        levelFrom: oldLevel,
        levelTo: newLevel,
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error awarding level up currency:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Award daily bonus currency
   * @param {Object} options - Daily bonus options
   * @returns {Promise<Object>} Updated user currency data
   */
  async awardDailyBonus(options) {
    try {
      const { 
        guildId, 
        userId, 
        username, 
        displayName 
      } = options;
      
      // Get user currency to check last daily claim
      const userCurrency = await getUserCurrency(guildId, userId);
      
      // Check if already claimed today
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      
      if (userCurrency?.lastActivityReward && 
          userCurrency.lastActivityReward >= startOfDay) {
        return { 
          success: false, 
          reason: 'already_claimed', 
          nextReset: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
        };
      }
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // TODO: Implement streak system later
      const currencyGain = guildSettings.rewardRates.dailyBonus;
      
      // Award the currency
      const result = await this.addCurrency({
        guildId,
        userId,
        amount: currencyGain,
        type: 'EARN',
        description: 'Daily bonus',
        username,
        displayName
      });
      
      // Update the last reward timestamp
      result.lastActivityReward = now;
      await result.save();
      
      return {
        success: true,
        currency: result,
        earned: currencyGain,
        nextReset: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error awarding daily bonus:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Transfer currency between users
   * @param {Object} options - Transfer options
   * @returns {Promise<Object>} Result of the transfer
   */
  async transferCurrency(options) {
    try {
      return await transferCurrency(options);
    } catch (error) {
      logger.error(`Error transferring currency:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get formatted currency balance
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Formatted currency data
   */
  async getFormattedBalance(guildId, userId) {
    try {
      // Get user currency
      const userCurrency = await getUserCurrency(guildId, userId);
      
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      return {
        userId,
        username: userCurrency?.username || 'Unknown User',
        displayName: userCurrency?.displayName || 'Unknown',
        balance: userCurrency?.balance || 0,
        formattedBalance: `${guildSettings.currencySymbol} ${userCurrency?.balance || 0}`,
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error getting formatted balance:`, error);
      throw error;
    }
  }
  
  /**
   * Process a paid command
   * @param {Object} options - Command options
   * @returns {Promise<Object>} Result of the command
   */
  async processPaidCommand(options) {
    try {
      const {
        guildId,
        userId,
        commandName,
        username,
        displayName
      } = options;
      
      // Check if command is paid and if user can afford it
      const chargeResult = await chargeForCommand({
        guildId,
        userId,
        commandName,
        username,
        displayName
      });
      
      return chargeResult;
    } catch (error) {
      logger.error(`Error processing paid command:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get currency leaderboard
   * @param {String} guildId - Guild ID
   * @param {Number} limit - Maximum number of users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getCurrencyLeaderboard(guildId, limit = 10) {
    try {
      const leaderboard = await getCurrencyLeaderboard(guildId, limit);
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // Format the leaderboard with currency symbol
      return {
        entries: leaderboard.map(entry => ({
          ...entry,
          formattedBalance: `${guildSettings.currencySymbol} ${entry.balance}`
        })),
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol
      };
    } catch (error) {
      logger.error(`Error getting currency leaderboard:`, error);
      throw error;
    }
  }
  
  /**
   * Process voice activity for currency rewards
   * This should be called from the ActivityTrackerService
   */
  async processVoiceActivityForCurrency(member, minutesActive, channelId) {
    try {
      // Award currency for voice time
      return await this.awardVoiceCurrency({
        guildId: member.guild.id,
        userId: member.id,
        username: member.user.tag,
        displayName: member.displayName,
        minutesActive,
        channelId
      });
    } catch (error) {
      logger.error(`Error processing voice activity for currency:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get command cost information
   * @param {String} guildId - Guild ID
   * @param {String} commandName - Command name
   * @returns {Promise<Object>} Command cost info
   */
  async getCommandCost(guildId, commandName) {
    try {
      // Get guild settings
      const guildSettings = await getGuildCurrencySettings(guildId);
      
      // Get command cost
      const cost = guildSettings.paidCommands.get(commandName) || 0;
      
      return {
        commandName,
        cost,
        isPaid: cost > 0,
        currencyName: guildSettings.currencyName,
        currencySymbol: guildSettings.currencySymbol,
        formattedCost: `${guildSettings.currencySymbol} ${cost}`
      };
    } catch (error) {
      logger.error(`Error getting command cost:`, error);
      throw error;
    }
  }
}

module.exports = CurrencyService;