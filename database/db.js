// database/db.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connect to MongoDB - use only the environment variable
async function connectDatabase() {
  try {
    const uri = process.env.MONGODB_URI;
    
    // Check if URI is defined
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }
    
    console.log('Connecting to MongoDB with URI:', uri);
    
    // Connect to MongoDB
    await mongoose.connect(uri);
    
    logger.info('Connected to MongoDB Atlas');
    return mongoose.connection;
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase: async () => {
    try {
      await mongoose.disconnect();
      logger.info('Disconnected from MongoDB');
    } catch (error) {
      logger.error('MongoDB disconnection error:', error);
    }
  },
  connection: mongoose.connection
};