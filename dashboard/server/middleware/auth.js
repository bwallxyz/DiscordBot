// server/middleware/auth.js
/**
 * Authentication middleware
 */

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
  };
  
  // Check if user is an admin
  const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
      return next();
    }
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  };
  
  module.exports = {
    isAuthenticated,
    isAdmin
  };