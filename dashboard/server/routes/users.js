// server/routes/users.js
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(isAuthenticated, isAdmin);

// Get all users with pagination and search
router.get('/', usersController.getUsers);

// Get user statistics by ID
router.get('/:userId/stats', usersController.getUserStats);

// Update user XP (admin only)
router.patch('/:userId/xp', usersController.updateUserXp);

// Get user's active sessions and history
router.get('/:userId/activity', usersController.getUserActivity);

module.exports = router;