// server/routes/levels.js
const express = require('express');
const router = express.Router();
const levelsController = require('../controllers/levelsController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(isAuthenticated, isAdmin);

// Get level settings
router.get('/settings', levelsController.getSettings);

// Update level settings
router.put('/settings', levelsController.updateSettings);

// Get level roles
router.get('/roles', levelsController.getLevelRoles);

// Add level role
router.post('/roles', levelsController.addLevelRole);

// Delete level role
router.delete('/roles/:level', levelsController.deleteLevelRole);

// Get leaderboard
router.get('/leaderboard', levelsController.getLeaderboard);

module.exports = router;