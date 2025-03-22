// server/controllers/authController.js
/**
 * Authentication controller
 */

const passport = require('passport');

// Handle Discord OAuth2 login
exports.login = passport.authenticate('discord');

// Handle Discord callback
exports.callback = (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }
    
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      
      // Redirect to frontend
      return res.redirect(process.env.CLIENT_URL || 'http://localhost:3000');
    });
  })(req, res, next);
};

// Check authentication status
exports.status = (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      isAuthenticated: true,
      user: req.user
    });
  } else {
    res.json({
      isAuthenticated: false,
      user: null
    });
  }
};

// Logout
exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.json({ success: true });
  });
};