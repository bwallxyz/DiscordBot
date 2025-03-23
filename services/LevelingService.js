// User leveling service
const { EmbedBuilder, Colors } = require('discord.js');
const logger = require('../utils/logger');
const { 
  UserLevel, 
  getUserLevel,
  getXpRequiredForLevel,
  calculateLevelFromXp,
  getTotalXpForLevel
} = require('../database/schemas/userLevel');
const { GuildLevelSettings, getGuildLevelSettings } = require('../database/schemas/guildLevelSettings');

// Add import for getUserActivity
const { 
  getUserActivity 
} = require('../database/schemas/userActivity');

class LevelingService {
  constructor(client) {
    this.client = client;
  }
  
  /**
   * Award XP to a user for voice activity
   * @param {Object} options - Voice XP options
   * @returns {Promise<Object>} Updated user level data and level up info
   */
  async awardVoiceXp(options) {
    const { 
      guildId, 
      userId, 
      username, 
      displayName, 
      minutesActive, 
      channelId 
    } = options;
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(guildId);
      
      // Check if channel is excluded
      if (guildSettings.excludedChannels.includes(channelId)) {
        return { success: false, reason: 'excluded_channel' };
      }
      
      // Calculate base XP from voice activity
      const baseXpGain = Math.floor(
        minutesActive * guildSettings.xpSettings.voiceXpPerMinute
      );
      
      // Get user's current level data
      let userLevel = await getUserLevel(guildId, userId);
      
      // If no user level data exists, create it
      if (!userLevel) {
        userLevel = new UserLevel({
          guildId,
          userId,
          username,
          displayName,
          xp: 0,
          level: 0,
          voiceXp: 0,
          messageXp: 0
        });
      }
      
      // Update username and displayName in case they changed
      userLevel.username = username || userLevel.username;
      userLevel.displayName = displayName || userLevel.displayName;
      
      // Get the member to check roles for multipliers
      const guild = this.client.guilds.cache.get(guildId);
      let xpMultiplier = 1.0;
      
      if (guild) {
        try {
          const member = await guild.members.fetch(userId);
          if (member) {
            // Get the highest multiplier from the member's roles
            const memberRoleIds = Array.from(member.roles.cache.keys());
            const roleMultipliers = guildSettings.roleMultipliers.filter(
              rm => memberRoleIds.includes(rm.roleId)
            );
            
            if (roleMultipliers.length > 0) {
              // Apply the highest multiplier only
              xpMultiplier = Math.max(...roleMultipliers.map(rm => rm.multiplier));
            }
          }
        } catch (error) {
          logger.error(`Error fetching member for role multipliers: ${error}`);
        }
      }
      
      // Apply multiplier to XP gain
      const totalXpGain = Math.floor(baseXpGain * xpMultiplier);
      
      // Record previous level
      const oldLevel = userLevel.level;
      
      // Update XP
      userLevel.voiceXp += totalXpGain;
      userLevel.xp += totalXpGain;
      userLevel.lastUpdated = new Date();
      
      // Calculate new level
      userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
      
      // Check for level up
      const leveledUp = userLevel.level > oldLevel;
      let levelUpInfo = null;
      
      if (leveledUp) {
        logger.info(`User ${userLevel.username} (${userId}) leveled up to ${userLevel.level} in guild ${guildId}`);
        
        levelUpInfo = {
          oldLevel,
          newLevel: userLevel.level,
          currentXp: userLevel.xp,
          nextLevelXp: getXpRequiredForLevel(userLevel.level + 1, guildSettings)
        };
        
        // Check for level roles to award
        if (guild && guildSettings.levelRoles.size > 0) {
          try {
            await this.checkAndAwardLevelRoles(guild, userId, userLevel.level, guildSettings);
          } catch (error) {
            logger.error(`Error awarding level roles: ${error}`);
          }
        }
      }
      
      // Save the updated user level
      await userLevel.save();
      
      return { 
        success: true, 
        userLevel, 
        xpGained: totalXpGain, 
        xpMultiplier, 
        leveledUp, 
        levelUpInfo 
      };
    } catch (error) {
      logger.error(`Error awarding voice XP:`, error);
      return { success: false, error: error.message };
    }
  }
  
  async awardMessageXp(options) {
    const { 
      guildId, 
      userId, 
      username, 
      displayName, 
      channelId 
    } = options;
    
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(guildId);
      
      // Check if channel is excluded
      if (guildSettings.excludedChannels && guildSettings.excludedChannels.includes(channelId)) {
        return { success: false, reason: 'excluded_channel' };
      }
      
      // Get user's current level data
      let userLevel = await getUserLevel(guildId, userId);
      
      // If no user level data exists, create it
      if (!userLevel) {
        userLevel = new UserLevel({
          guildId,
          userId,
          username,
          displayName,
          xp: 0,
          level: 0,
          voiceXp: 0,
          messageXp: 0
        });
      }
      
      // Update username and displayName in case they changed
      userLevel.username = username || userLevel.username;
      userLevel.displayName = displayName || userLevel.displayName;
      
      // Check for message XP cooldown - strict 1 minute cooldown
      const now = new Date();
      const cooldownMs = guildSettings.xpSettings.messageXpCooldown * 1000;
      
      if (userLevel.lastMessageXpAwarded && 
          now.getTime() - userLevel.lastMessageXpAwarded.getTime() < cooldownMs) {
        return { success: false, reason: 'cooldown' };
      }
      
      // Award 1 XP per message (or custom amount from settings)
      const xpGain = guildSettings.xpSettings.messageXpPerMessage;
      const guild = this.client.guilds.cache.get(guildId);
      
      // Check for role multipliers
      let xpMultiplier = 1.0;
      if (guild) {
        try {
          const member = await guild.members.fetch(userId);
          if (member) {
            // Get the highest multiplier from the member's roles
            const memberRoleIds = Array.from(member.roles.cache.keys());
            const roleMultipliers = guildSettings.roleMultipliers.filter(
              rm => memberRoleIds.includes(rm.roleId)
            );
            
            if (roleMultipliers.length > 0) {
              // Apply the highest multiplier only
              xpMultiplier = Math.max(...roleMultipliers.map(rm => rm.multiplier));
            }
          }
        } catch (error) {
          logger.error(`Error fetching member for role multipliers: ${error}`);
        }
      }
      
      // Apply multiplier to XP gain
      const totalXpGain = Math.floor(xpGain * xpMultiplier);
      
      // Record previous level
      const oldLevel = userLevel.level;
    
      // Update XP
      userLevel.messageXp += totalXpGain;
      userLevel.xp += totalXpGain;
      userLevel.lastUpdated = now;
      userLevel.lastMessageXpAwarded = now;
    
      // Calculate new level
      userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
      
      // Check for level up
      const leveledUp = userLevel.level > oldLevel;
      let levelUpInfo = null;
      
      if (leveledUp) {
        logger.info(`User ${userLevel.username} (${userId}) leveled up to ${userLevel.level} in guild ${guildId}`);
        
        levelUpInfo = {
          oldLevel,
          newLevel: userLevel.level,
          currentXp: userLevel.xp,
          nextLevelXp: getXpRequiredForLevel(userLevel.level + 1, guildSettings)
        };
        
        // Check for level roles to award
        if (guild && guildSettings.levelRoles.size > 0) {
          try {
            await this.checkAndAwardLevelRoles(guild, userId, userLevel.level, guildSettings);
          } catch (error) {
            logger.error(`Error awarding level roles: ${error}`);
          }
        }
      }
      
      // Save the updated user level
      await userLevel.save();
      
      return { 
        success: true, 
        userLevel, 
        xpGained: totalXpGain, 
        xpMultiplier, 
        leveledUp, 
        levelUpInfo 
      };
    } catch (error) {
      logger.error(`Error awarding message XP:`, error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Check and award level roles to a user
   * @param {Object} guild - Discord guild
   * @param {String} userId - User ID
   * @param {Number} currentLevel - User's current level
   * @param {Object} guildSettings - Guild level settings
   */
  async checkAndAwardLevelRoles(guild, userId, currentLevel, guildSettings) {
    try {
      // Get the member
      const member = await guild.members.fetch(userId);
      if (!member) return;
      
      // Roles eligible for this level
      const eligibleRoles = [];
      
      // Check which level roles the user qualifies for
      for (const [levelStr, roleId] of guildSettings.levelRoles.entries()) {
        const level = parseInt(levelStr, 10);
        
        if (currentLevel >= level) {
          eligibleRoles.push(roleId);
        }
      }
      
      // Get roles the member doesn't have yet
      const newRoles = eligibleRoles.filter(roleId => !member.roles.cache.has(roleId));
      
      // Award new roles
      for (const roleId of newRoles) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          await member.roles.add(role, `Level ${currentLevel} reward`);
          logger.info(`Awarded level role ${role.name} to ${member.user.tag} for reaching level ${currentLevel}`);
        }
      }
    } catch (error) {
      logger.error(`Error in checkAndAwardLevelRoles:`, error);
      throw error;
    }
  }
  
  /**
   * Send a level up notification
   * @param {Object} options - Notification options
   */
  async sendLevelUpNotification(options) {
    const {
      guild,
      member,
      channel,
      oldLevel,
      newLevel,
      currentXp,
      nextLevelXp,
      settings
    } = options;
    
    try {
      // Create level up embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setTitle('🎉 Level Up!')
        .setDescription(`Congratulations ${member}! You've reached level **${newLevel}**!`)
        .addFields(
          { name: 'Level Progress', value: `Level ${oldLevel} → ${newLevel}`, inline: true },
          { name: 'XP Required', value: `${currentXp}/${nextLevelXp} XP`, inline: true }
        )
        .setFooter({ text: `Tip: Gain XP by being active in voice and text channels!` })
        .setTimestamp();
      
      // Add thumbnail if user has avatar
      if (member.user.displayAvatarURL()) {
        embed.setThumbnail(member.user.displayAvatarURL());
      }
      
      // Send notification based on guild settings
      if (settings.notifications.enabled) {
        // Send in specific notification channel if configured
        if (settings.notifications.channelId) {
          const notifChannel = guild.channels.cache.get(settings.notifications.channelId);
          if (notifChannel) {
            await notifChannel.send({ embeds: [embed] });
          }
        }
        
        // Send in the current channel if enabled
        if (settings.notifications.announceInChannel && channel) {
          await channel.send({ embeds: [embed] });
        }
        
        // DM the user if enabled
        if (settings.notifications.dmUser) {
          try {
            await member.send({ embeds: [embed] });
          } catch (error) {
            logger.warn(`Could not DM level up notification to ${member.user.tag}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error sending level up notification:`, error);
    }
  }
  
  /**
 * Get user level info
 * @param {String} guildId - Guild ID
 * @param {String} userId - User ID
 * @returns {Promise<Object>} User level info
 */
  async getUserLevelInfo(guildId, userId) {
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(guildId);
      
      // Get user level
      const userLevel = await getUserLevel(guildId, userId);
      
      if (!userLevel) {
        // For new users with no data
        const xpForLevel1 = getXpRequiredForLevel(1, guildSettings);
        return {
          userId,
          username: 'Unknown',
          displayName: 'Unknown',
          level: 0,
          xp: 0,
          voiceXp: 0,
          messageXp: 0,
          rank: null,
          nextLevelXp: xpForLevel1,
          xpProgress: 0,
          progressPercentage: 0
        };
      }
      
      // Calculate XP for current and next level
      const currentLevelTotalXp = getTotalXpForLevel(userLevel.level, guildSettings);
      const nextLevelTotalXp = getTotalXpForLevel(userLevel.level + 1, guildSettings);
      const xpForNextLevel = nextLevelTotalXp - currentLevelTotalXp;
      
      // Calculate progress within current level
      const xpProgress = userLevel.xp - currentLevelTotalXp;
      const progressPercentage = Math.floor((xpProgress / xpForNextLevel) * 100);
      
      // Get user rank
      const rank = await this.getUserRank(guildId, userId);
      
      return {
        userId,
        username: userLevel.username,
        displayName: userLevel.displayName,
        level: userLevel.level,
        xp: userLevel.xp,
        voiceXp: userLevel.voiceXp || 0,
        messageXp: userLevel.messageXp || 0,
        rank,
        nextLevelXp: xpForNextLevel,
        xpProgress: xpProgress,
        progressPercentage: progressPercentage,
        lastUpdated: userLevel.lastUpdated
      };
    } catch (error) {
      logger.error(`Error getting user level info:`, error);
      throw error;
    }
  }
  
  
  /**
   * Get user rank
   * @param {String} guildId - Guild ID
   * @param {String} userId - User ID
   * @returns {Promise<Number>} User rank (position) or null if not found
   */
  async getUserRank(guildId, userId) {
    try {
      // Get all users sorted by XP
      const allUsers = await UserLevel.find({ guildId })
        .sort({ xp: -1 })
        .lean();
      
      // Find user's position
      const position = allUsers.findIndex(user => user.userId === userId);
      
      return position >= 0 ? position + 1 : null;
    } catch (error) {
      logger.error(`Error getting user rank:`, error);
      return null;
    }
  }
  
  /**
   * Get level leaderboard
   * @param {String} guildId - Guild ID
   * @param {Number} limit - Maximum number of users to return
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getLevelLeaderboard(guildId, limit = 10) {
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(guildId);
      
      // Get top users by XP
      const topUsers = await UserLevel.find({ guildId })
        .sort({ xp: -1 })
        .limit(limit);
      
      return topUsers.map((user, index) => {
        const nextLevelXp = getXpRequiredForLevel(user.level + 1, guildSettings);
        return {
          rank: index + 1,
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          level: user.level,
          xp: user.xp,
          nextLevelXp,
          progress: Math.floor((user.xp / nextLevelXp) * 100)
        };
      });
    } catch (error) {
      logger.error(`Error getting level leaderboard:`, error);
      throw error;
    }
  }
  
  /**
   * Process voice activity for XP
   * @param {Object} activity - Voice activity data
   * @returns {Promise<Object>} XP reward result
   */
  async processVoiceActivity(activity) {
    try {
      // Calculate minutes active from milliseconds
      const minutesActive = activity.duration / (1000 * 60);
      
      // Only award XP if at least 1 minute active
      if (minutesActive < 1) {
        return { success: false, reason: 'too_short' };
      }
      
      return await this.awardVoiceXp({
        guildId: activity.guildId,
        userId: activity.userId,
        username: activity.username,
        displayName: activity.displayName,
        minutesActive,
        channelId: activity.channelId
      });
    } catch (error) {
      logger.error(`Error processing voice activity for XP:`, error);
      return { success: false, error: error.message };
    }
  }


  async recalculateUserLevel(guildId, userId) {
    try {
      // Get guild settings
      const guildSettings = await getGuildLevelSettings(guildId);
      
      // Get user level
      const userLevel = await getUserLevel(guildId, userId);
      
      if (!userLevel) {
        return { success: false, reason: 'user_not_found' };
      }
      
      // Record old level
      const oldLevel = userLevel.level;
      
      // Recalculate level based on XP
      userLevel.level = calculateLevelFromXp(userLevel.xp, guildSettings);
      
      // Save changes
      await userLevel.save();
      
      return {
        success: true,
        oldLevel,
        newLevel: userLevel.level,
        xp: userLevel.xp
      };
    } catch (error) {
      logger.error(`Error recalculating user level:`, error);
      return { success: false, error: error.message };
    }
  }



      /**
   * Award XP to users currently in voice channels
   * @returns {Promise<void>}
   */
  async updateActiveVoiceXp() {
    try {
      // Get all guilds
      for (const [guildId, guild] of this.client.guilds.cache) {
        // Skip if no voice channels or no members in voice
        if (!guild.channels.cache.some(channel => channel.type === 2 && channel.members.size > 0)) continue;
        
        // Get guild settings
        const guildSettings = await getGuildLevelSettings(guildId);
        
        // Process each voice channel
        for (const [channelId, channel] of guild.channels.cache.filter(c => c.type === 2 && c.members.size > 0)) {
          // Skip excluded channels
          if (guildSettings.excludedChannels.includes(channelId)) continue;
          
          // Process each member in the voice channel
          for (const [memberId, member] of channel.members) {
            // Skip bot users
            if (member.user.bot) continue;
            
            // Skip users who are muted and deafened (likely AFK)
            if (member.voice.selfMute && member.voice.selfDeaf) continue;
            
            // Get user's activity
            const activity = await getUserActivity(guildId, memberId);
            
            // Skip if no active session
            if (!activity || !activity.currentSession) continue;
            
            // Calculate minutes since last update
            const now = new Date();
            const lastUpdate = activity.lastUpdate || activity.currentSession.joinedAt;
            const minutesSinceLastUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
            
            // Only update if enough time has passed (avoid too frequent updates)
            if (minutesSinceLastUpdate < 1) continue;
            
            // Award XP for this time period
            await this.awardVoiceXp({
              guildId,
              userId: memberId,
              username: member.user.tag,
              displayName: member.displayName,
              minutesActive: minutesSinceLastUpdate,
              channelId
            });
            
            // Update the last update timestamp
            activity.lastUpdate = now;
            await activity.save();
            
            logger.debug(`Updated voice XP for ${member.user.tag} in ${channel.name} (${minutesSinceLastUpdate.toFixed(2)} minutes)`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error in periodic voice XP update:`, error);
    }
  }   
}

module.exports = LevelingService;