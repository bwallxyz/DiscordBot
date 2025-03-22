// server/config/passport.js
/**
 * Passport.js configuration
 */

const passport = require('passport');
const { Strategy } = require('passport-discord');

// Configure Discord strategy
module.exports = function configurePassport() {
  passport.use(new Strategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI || 'http://localhost:5000/api/auth/callback',
    scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user has access to the specific guild (your Discord server)
      const guild = profile.guilds.find(g => g.id === process.env.GUILD_ID);
      
      // Create user object with admin status
      const user = {
        id: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        accessToken, // Store for Discord API requests
        isAdmin: guild ? (guild.permissions & 0x8) === 0x8 : false // Check for ADMINISTRATOR permission (0x8)
      };
      
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));

  // Serialize and deserialize user
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
};

// server/config/database.js
/**
 * Database connection configuration
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connect to MongoDB
const connectDatabase = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    
    // Check if URI is defined
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    console.log('Connecting to MongoDB...');
    
    // Connect with mongoose
    await mongoose.connect(uri);
    
    console.log('Connected to MongoDB successfully');
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = {
  connectDatabase
};