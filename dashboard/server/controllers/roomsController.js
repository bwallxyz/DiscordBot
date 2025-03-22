// server/controllers/roomsController.js
/**
 * Rooms controller
 */

const { Room, UserLevel, AuditLog } = require('../models');
const RoomService = require('../../../services/RoomService');

// Get all rooms with pagination and search
exports.getRooms = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    
    // Build query
    const query = { guildId: process.env.GUILD_ID };
    
    // Add search filter if provided
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    // Get total count for pagination
    const total = await Room.countDocuments(query);
    
    // Get rooms with pagination
    const rooms = await Room.find(query)
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);
    
    // Enhance room data with owner information
    const enhancedRooms = await Promise.all(rooms.map(async (room) => {
      const roomObj = room.toObject();
      
      // Try to get owner's username
      const owner = await UserLevel.findOne({
        guildId: process.env.GUILD_ID,
        userId: room.ownerId
      });
      
      if (owner) {
        roomObj.ownerUsername = owner.username;
      }
      
      return roomObj;
    }));
    
    res.json({
      rooms: enhancedRooms,
      total,
      page,
      limit
    });
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

// Get a specific room
exports.getRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get room owner information
    const owner = await UserLevel.findOne({
      guildId: process.env.GUILD_ID,
      userId: room.ownerId
    });
    
    // Get room activity
    const roomActivity = await AuditLog.find({
      guildId: process.env.GUILD_ID,
      'room.channelId': room.channelId
    })
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Format response
    const roomData = room.toObject();
    roomData.owner = owner ? {
      userId: owner.userId,
      username: owner.username,
      displayName: owner.displayName,
      level: owner.level
    } : null;
    
    roomData.activity = roomActivity.map(log => ({
      id: log._id,
      actionType: log.actionType,
      performedBy: log.performedBy.username,
      targetUser: log.targetUser?.username,
      createdAt: log.createdAt,
      reason: log.details?.reason
    }));
    
    res.json(roomData);
  } catch (err) {
    console.error('Error fetching room details:', err);
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
};

// Update a room
exports.updateRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    const { isLocked, name } = req.body;
    
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Update fields if provided
    if (isLocked !== undefined) {
      room.isLocked = isLocked;
    }
    
    if (name) {
      room.name = name;
    }
    
    await room.save();
    
    // Return updated room
    res.json(room);
  } catch (err) {
    console.error('Error updating room:', err);
    res.status(500).json({ error: 'Failed to update room' });
  }
};

// Delete a room
exports.deleteRoom = async (req, res) => {
  try {
    const roomId = req.params.id;
    
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Create RoomService instance to delete the room
    const roomService = new RoomService(req.app.get('discordClient'));
    
    // Delete the room using the service (which handles state cleanup)
    await roomService.deleteRoom(room);
    
    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    console.error('Error deleting room:', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

// Get room user states (muted/banned users)
exports.getRoomStates = async (req, res) => {
  try {
    const { id } = req.params;
    
    const room = await Room.findById(id);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get state tracker and client
    const { UserStateTrackerService } = require('../../../services/UserStateTrackerService');
    const stateTracker = new UserStateTrackerService();
    
    // Get states for this room
    const stats = await stateTracker.getRoomModerationStats(
      process.env.GUILD_ID,
      room.channelId
    );
    
    // Format response
    res.json({
      roomId: room._id,
      channelId: room.channelId,
      moderationStats: stats
    });
  } catch (err) {
    console.error('Error getting room states:', err);
    res.status(500).json({ error: 'Failed to get room states' });
  }
};