// server/routes/rooms.js
const express = require('express');
const router = express.Router();
const roomsController = require('../controllers/roomsController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(isAuthenticated, isAdmin);

// Get all rooms with pagination and search
router.get('/', roomsController.getRooms);

// Get a specific room
router.get('/:id', roomsController.getRoom);

// Update a room
router.patch('/:id', roomsController.updateRoom);

// Delete a room
router.delete('/:id', roomsController.deleteRoom);

// Get room user states (muted/banned users)
router.get('/:id/states', roomsController.getRoomStates);

module.exports = router;