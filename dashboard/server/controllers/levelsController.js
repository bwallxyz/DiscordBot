// server/controllers/levelsController.js
/**
 * Levels controller
 */

const { UserLevel, GuildLevelSettings } = require('../models');
const { 
  getGuildLevelSettings,
  updateGuildLevelSettings
} = require('../../../database/schemas/guildLevelSettings');

// Get level settings
exports.getSettings = async (req, res) => {
  try {
    // Get guild settings
    const settings = await getGuildLevelSettings(process.env.GUILD_ID);
    
    // Get server roles and channels (requires Discord API)
    const client = req.app.get('discordClient');
    let serverRoles = { roles: [], channels: [] };
    
    // If we have a Discord client connection
    if (client && client.guilds) {
      try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        
        // Get roles
        const roles = Array.from(guild.roles.cache.values())
          .filter(role => !role.managed && role.id !== guild.id) // Filter out managed roles and @everyone
          .map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor
          }));
        
        // Get text channels for notifications
        const channels = Array.from(guild.channels.cache.values())
          .filter(channel => channel.type === 0) // 0 = text channels
          .map(channel => ({
            id: channel.id,
            name: channel.name
          }));
        
        serverRoles = { roles, channels };
      } catch (discordErr) {
        console.error('Error fetching Discord guild data:', discordErr);
      }
    }
    
    // Format level roles
    const levelRoles = [];
    if (settings.levelRoles && settings.levelRoles.size > 0) {
      // Convert Map to array for easier client-side handling
      for (const [level, roleId] of settings.levelRoles.entries()) {
        // Try to get role name from server roles
        const role = serverRoles.roles.find(r => r.id === roleId);
        
        levelRoles.push({
          level: parseInt(level, 10),
          roleId,
          roleName: role ? role.name : roleId
        });
      }
      
      // Sort by level
      levelRoles.sort((a, b) => a.level - b.level);
    }
    
    // Try to get notification channel name
    let notificationChannelName = null;
    if (settings.notifications.channelId) {
      const channel = serverRoles.channels.find(c => c.id === settings.notifications.channelId);
      if (channel) {
        notificationChannelName = channel.name;
      }
    }
    
    res.json({
      settings: {
        ...settings.toObject(),
        notificationChannelName
      },
      levelRoles,
      serverRoles
    });
  } catch (err) {
    console.error('Error fetching level settings:', err);
    res.status(500).json({ error: 'Failed to fetch level settings' });
  }
};

// Update level settings
exports.updateSettings = async (req, res) => {
  try {
    const {
      voiceXpPerMinute,
      messageXpPerMessage,
      messageXpCooldown,
      notificationChannelId,
      dmNotifications,
      channelNotifications
    } = req.body;
    
    // Create updates object
    const updates = {};
    
    // Update XP settings if provided
    if (voiceXpPerMinute !== undefined) {
      updates['xpSettings.voiceXpPerMinute'] = parseFloat(voiceXpPerMinute);
    }
    
    if (messageXpPerMessage !== undefined) {
      updates['xpSettings.messageXpPerMessage'] = parseFloat(messageXpPerMessage);
    }
    
    if (messageXpCooldown !== undefined) {
      updates['xpSettings.messageXpCooldown'] = parseInt(messageXpCooldown, 10);
    }
    
    // Update notification settings if provided
    if (notificationChannelId !== undefined) {
      updates['notifications.channelId'] = notificationChannelId;
    }
    
    if (dmNotifications !== undefined) {
      updates['notifications.dmUser'] = dmNotifications;
    }
    
    if (channelNotifications !== undefined) {
      updates['notifications.announceInChannel'] = channelNotifications;
    }
    
    // Enable notifications if any notification setting is true
    if (notificationChannelId || dmNotifications || channelNotifications) {
      updates['notifications.enabled'] = true;
    } else {
      updates['notifications.enabled'] = false;
    }
    
    // Update settings
    const updatedSettings = await updateGuildLevelSettings(process.env.GUILD_ID, updates);
    
    res.json({ success: true, settings: updatedSettings });
  } catch (err) {
    console.error('Error updating level settings:', err);
    res.status(500).json({ error: 'Failed to update level settings' });
  }
};

// Get level roles
exports.getLevelRoles = async (req, res) => {
  try {
    const settings = await getGuildLevelSettings(process.env.GUILD_ID);
    
    // Format level roles
    const levelRoles = [];
    if (settings.levelRoles && settings.levelRoles.size > 0) {
      for (const [level, roleId] of settings.levelRoles.entries()) {
        levelRoles.push({
          level: parseInt(level, 10),
          roleId
        });
      }
      
      // Sort by level
      levelRoles.sort((a, b) => a.level - b.level);
    }
    
    res.json({ levelRoles });
  } catch (err) {
    console.error('Error fetching level roles:', err);
    res.status(500).json({ error: 'Failed to fetch level roles' });
  }
};

// Add level role
exports.addLevelRole = async (req, res) => {
  try {
    const { level, roleId } = req.body;
    
    if (!level || !roleId) {
      return res.status(400).json({ error: 'Level and roleId are required' });
    }
    
    // Get guild settings
    const settings = await getGuildLevelSettings(process.env.GUILD_ID);
    
    // Add the level role
    if (!settings.levelRoles) {
      settings.levelRoles = new Map();
    }
    
    settings.levelRoles.set(level.toString(), roleId);
    await settings.save();
    
    res.json({ 
      success: true, 
      message: `Role set for level ${level}`,
      levelRoles: Array.from(settings.levelRoles.entries()).map(([level, roleId]) => ({
        level: parseInt(level, 10),
        roleId
      }))
    });
  } catch (err) {
    console.error('Error adding level role:', err);
    res.status(500).json({ error: 'Failed to add level role' });
  }
};

// Delete level role
exports.deleteLevelRole = async (req, res) => {
  try {
    const { level } = req.params;
    
    // Get guild settings
    const settings = await getGuildLevelSettings(process.env.GUILD_ID);
    
    // Remove the level role
    if (settings.levelRoles && settings.levelRoles.has(level.toString())) {
      settings.levelRoles.delete(level.toString());
      await settings.save();
      
      res.json({ 
        success: true, 
        message: `Role removed for level ${level}`
      });
    } else {
      res.status(404).json({ error: `No role found for level ${level}` });
    }
  } catch (err) {
    console.error('Error deleting level role:', err);
    res.status(500).json({ error: 'Failed to delete level role' });
  }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Get top users by XP
    const topUsers = await UserLevel.find({
      guildId: process.env.GUILD_ID
    })
    .sort({ xp: -1 })
    .limit(limit);
    
    // Format leaderboard
    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      level: user.level,
      xp: user.xp
    }));
    
    res.json({ leaderboard });
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
};

module.exports = exports;