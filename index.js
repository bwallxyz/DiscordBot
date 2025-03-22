// Improved main application entry point with better error handling and reminder service
const { Client, GatewayIntentBits, Events } = require('discord.js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const { connectDatabase, disconnectDatabase } = require('./database/db');
const commandHandler = require('./commands');
const eventHandler = require('./events');
const LevelingService = require('./services/LevelingService');
const ReminderService = require('./services/ReminderService');

// Load environment variables
dotenv.config();

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  // Add these options for more reliable connection
  allowedMentions: { parse: ['users', 'roles'], repliedUser: true },
  failIfNotExists: false,
  // Improve reliability with these settings
  restRequestTimeout: 30000, // 30 seconds
  retryLimit: 5
});

// Attach global error handlers
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  // Attempt graceful shutdown on critical errors
  gracefulShutdown(1);
});

// Graceful shutdown function
async function gracefulShutdown(code = 0) {
  logger.info('Shutting down gracefully...');
  
  try {
    // Stop reminder service if running
    if (client.reminderService) {
      client.reminderService.stop();
    }
    
    // Destroy the Discord client connection
    if (client && client.isReady()) {
      logger.info('Logging out of Discord...');
      await client.destroy();
    }
    
    // Disconnect from database
    logger.info('Closing database connection...');
    await disconnectDatabase();
    
    logger.info('Shutdown complete');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
  
  // Exit the process
  process.exit(code);
}

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown());
process.on('SIGTERM', () => gracefulShutdown());

// Add Discord client error handling
client.on(Events.Error, (error) => {
  logger.error('Discord client error:', error);
});

client.on(Events.ShardError, (error) => {
  logger.error('Discord websocket error:', error);
});

client.on(Events.Warn, (message) => {
  logger.warn('Discord warning:', message);
});

// Initialize the application
async function init() {
  try {
    // Debug environment variables
    const envVars = {
      MONGODB_URI: process.env.MONGODB_URI ? 'Defined' : 'Not defined',
      BOT_TOKEN: process.env.BOT_TOKEN ? 'Defined' : 'Not defined',
      CLIENT_ID: process.env.CLIENT_ID ? 'Defined' : 'Not defined',
      GUILD_ID: process.env.GUILD_ID ? 'Defined' : 'Not defined',
      NODE_ENV: process.env.NODE_ENV || 'Not defined',
      LOG_LEVEL: process.env.LOG_LEVEL || 'Not defined'
    };
    
    logger.info('Environment variables loaded:', envVars);

    // Connect to database with retry
    let dbConnected = false;
    let dbRetries = 0;
    const maxRetries = 5;
    
    while (!dbConnected && dbRetries < maxRetries) {
      try {
        await connectDatabase();
        logger.info('Database connected successfully');
        dbConnected = true;
      } catch (dbError) {
        dbRetries++;
        logger.error(`Database connection attempt ${dbRetries}/${maxRetries} failed:`, dbError);
        
        if (dbRetries >= maxRetries) {
          throw new Error('Failed to connect to database after multiple attempts');
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, dbRetries), 30000);
        logger.info(`Retrying database connection in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Register commands
    try {
      await commandHandler.registerCommands(client);
      logger.info('Commands loaded and ready for registration');
    } catch (commandError) {
      logger.error('Error registering commands:', commandError);
      // Continue despite command errors - they can be fixed later
    }

    // Register event listeners
    try {
      await eventHandler.registerEvents(client);
      logger.info('Events registered successfully');
    } catch (eventError) {
      logger.error('Error registering events:', eventError);
      // Continue despite event errors
    }

    // Login to Discord with retry
    let loginRetries = 0;
    const maxLoginRetries = 5;
    
    while (loginRetries < maxLoginRetries) {
      try {
        logger.info('Attempting to log in to Discord...');
        await client.login(process.env.BOT_TOKEN);
        logger.info(`Logged in as ${client.user.tag}`);
        break;
      } catch (loginError) {
        loginRetries++;
        logger.error(`Login attempt ${loginRetries}/${maxLoginRetries} failed:`, loginError);
        
        if (loginRetries >= maxLoginRetries) {
          throw new Error('Failed to log in to Discord after multiple attempts');
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, loginRetries), 30000);
        logger.info(`Retrying login in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Initialize the leveling service for voice XP updates
    const levelingService = new LevelingService(client);
    setInterval(() => {
      levelingService.updateActiveVoiceXp().catch(error => {
        logger.error('Error in voice XP update interval:', error);
      });
    }, 5 * 60 * 1000); // 5 minutes

    // Initialize and start the reminder service
    client.reminderService = new ReminderService(client);
    client.reminderService.start();
    logger.info('Room reminder service initialized and started');

    logger.info('Bot initialization complete, now listening for events');
  } catch (error) {
    logger.error('Critical initialization error:', error);
    gracefulShutdown(1);
  }
}

// Start the application
init();