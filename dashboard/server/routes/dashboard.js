// server/routes/dashboard.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(isAuthenticated, isAdmin);

// Get dashboard statistics
router.get('/stats', dashboardController.getStats);

// Get activity data for chart
router.get('/activity', dashboardController.getActivity);

// Get audit log entries
router.get('/audit-log', dashboardController.getAuditLogs);

// Get current server status
router.get('/status', dashboardController.getStatus);

module.exports = router;