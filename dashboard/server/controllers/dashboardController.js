// server/controllers/dashboardController.js
/**
 * Dashboard controller
 */

const moment = require('moment');
const { Room, UserActivity, UserLevel, AuditLog } = require('../models');

// Get dashboard statistics
exports.getStats = async (req, res) => {
  try {
    // Get total users with level data
    const totalUsers = await UserLevel.countDocuments({ guildId: process.env.GUILD_ID });
    
    // Get active rooms count
    const activeRooms = await Room.countDocuments({ guildId: process.env.GUILD_ID });
    
    // Get highest level user
    const topLevelUser = await UserLevel.findOne({ guildId: process.env.GUILD_ID })
      .sort({ level: -1, xp: -1 })
      .limit(1);
    
    // Get total commands from audit log
    const totalCommands = await AuditLog.countDocuments({ 
      guildId: process.env.GUILD_ID,
      actionType: { 
        $in: [
          'USER_MUTE', 'USER_UNMUTE', 'USER_KICK', 
          'USER_BAN', 'USER_UNBAN', 'ROOM_LOCK', 'ROOM_UNLOCK'
        ] 
      }
    });

    // Get recent rooms
    const recentRooms = await Room.find({ guildId: process.env.GUILD_ID })
      .sort({ createdAt: -1 })
      .limit(5);

    // Format recent rooms data
    const formattedRecentRooms = await Promise.all(recentRooms.map(async (room) => {
      // Try to get the owner's username
      const ownerData = await UserLevel.findOne({ 
        guildId: process.env.GUILD_ID, 
        userId: room.ownerId 
      });

      return {
        id: room._id,
        name: room.name,
        owner: ownerData ? ownerData.username : room.ownerId,
        createdAt: moment(room.createdAt).fromNow(),
        isLocked: room.isLocked
      };
    }));

    // Get top users by activity
    const topUsers = await UserActivity.find({ guildId: process.env.GUILD_ID })
      .sort({ totalTimeMs: -1 })
      .limit(5);

    // Format top users data
    const formattedTopUsers = await Promise.all(topUsers.map(async (user) => {
      // Get level data for this user
      const levelData = await UserLevel.findOne({ 
        guildId: process.env.GUILD_ID, 
        userId: user.userId 
      });

      return {
        id: user._id,
        userId: user.userId,
        username: user.username || levelData?.username || user.userId,
        level: levelData?.level || 0,
        totalTime: moment.duration(user.totalTimeMs).humanize(),
      };
    }));

    // Send statistics
    res.json({
      totalUsers,
      activeRooms,
      topLevel: topLevelUser?.level || 0,
      totalCommands,
      recentRooms: formattedRecentRooms,
      topUsers: formattedTopUsers
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

// Get activity data for chart
exports.getActivity = async (req, res) => {
  try {
    // Get data for the last 14 days
    const startDate = moment().subtract(13, 'days').startOf('day').toDate();
    const endDate = moment().endOf('day').toDate();
    
    // Prepare date labels for the last 14 days
    const dates = [];
    for (let i = 13; i >= 0; i--) {
      dates.push(moment().subtract(i, 'days').format('MMM DD'));
    }
    
    // Initialize data arrays
    const roomsCreated = new Array(14).fill(0);
    const activeUsers = new Array(14).fill(0);
    
    // Get rooms created per day
    const roomsData = await Room.aggregate([
      { 
        $match: { 
          guildId: process.env.GUILD_ID,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { 
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get active users per day (from UserActivity history)
    const usersData = await UserActivity.aggregate([
      { 
        $match: { 
          guildId: process.env.GUILD_ID,
          'sessionHistory.joinedAt': { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$sessionHistory' },
      {
        $match: {
          'sessionHistory.joinedAt': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$sessionHistory.joinedAt' } },
            userId: '$userId'
          }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Populate data arrays
    roomsData.forEach(data => {
      const date = moment(data._id, 'YYYY-MM-DD');
      const index = 13 - moment().diff(date, 'days');
      if (index >= 0 && index < 14) {
        roomsCreated[index] = data.count;
      }
    });
    
    usersData.forEach(data => {
      const date = moment(data._id, 'YYYY-MM-DD');
      const index = 13 - moment().diff(date, 'days');
      if (index >= 0 && index < 14) {
        activeUsers[index] = data.count;
      }
    });
    
    res.json({
      dates,
      roomsCreated,
      activeUsers
    });
  } catch (err) {
    console.error('Error fetching activity data:', err);
    res.status(500).json({ error: 'Failed to fetch activity data' });
  }
};

// Get audit log entries
exports.getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const actionType = req.query.actionType || null;
    
    // Build query
    const query = { guildId: process.env.GUILD_ID };
    
    // Add action type filter if provided
    if (actionType && actionType !== 'ALL') {
      query.actionType = actionType;
    }
    
    // Get total count for pagination
    const total = await AuditLog.countDocuments(query);
    
    // Get logs with pagination
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);
    
    // Format logs for client
    const formattedLogs = logs.map(log => ({
      id: log._id,
      actionType: log.actionType,
      performedBy: {
        userId: log.performedBy.userId,
        username: log.performedBy.username
      },
      targetUser: log.targetUser ? {
        userId: log.targetUser.userId,
        username: log.targetUser.username
      } : null,
      room: log.room ? {
        id: log.room.channelId,
        name: log.room.name
      } : null,
      details: log.details || {},
      createdAt: log.createdAt
    }));
    
    res.json({
      logs: formattedLogs,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

// Get server status
exports.getStatus = async (req, res) => {
  try {
    // Get Discord client if available
    const client = req.app.get('discordClient');
    
    if (!client || !client.isReady()) {
      return res.json({
        status: 'offline',
        message: 'Discord bot is offline'
      });
    }
    
    // Get guild
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    
    if (!guild) {
      return res.json({
        status: 'error',
        message: 'Bot is not in the specified guild'
      });
    }
    
    // Get active voice channels
    const voiceChannels = guild.channels.cache.filter(channel => 
      channel.type === 2 && channel.members.size > 0
    );
    
    // Count users in voice
    let usersInVoice = 0;
    voiceChannels.forEach(channel => {
      usersInVoice += channel.members.size;
    });
    
    // Return status information
    res.json({
      status: 'online',
      guild: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        iconURL: guild.iconURL()
      },
      activeVoiceChannels: voiceChannels.size,
      usersInVoice,
      botUptime: client.uptime
    });
  } catch (err) {
    console.error('Error fetching server status:', err);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch server status' 
    });
  }
};