// server/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');

// Start Discord OAuth2 flow
router.get('/discord', authController.login);

// Handle Discord callback
router.get('/callback', authController.callback);

// Check authentication status
router.get('/status', authController.status);

// Logout route
router.get('/logout', authController.logout);

module.exports = router;