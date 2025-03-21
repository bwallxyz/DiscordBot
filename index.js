

// Main application entry point
const { Client, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const { connectDatabase } = require('./database/db');
const commandHandler = require('./commands');
const eventHandler = require('./events');
const LevelingService = require('./services/LevelingService');

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
  ]
});

// Attach global error handlers
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

// Initialize the application
async function init() {
  try {

    // Debug environment variables
    console.log('Environment variables loaded:');
    console.log('- MONGODB_URI:', process.env.MONGODB_URI ? 'Defined' : 'Not defined');
    console.log('- BOT_TOKEN:', process.env.BOT_TOKEN ? 'Defined' : 'Not defined');

    // Connect to database
    await connectDatabase();
    logger.info('Database connected');

    // Register commands
    await commandHandler.registerCommands(client);
    logger.info('Commands registered');

    // Register event listeners
    await eventHandler.registerEvents(client);
    logger.info('Events registered');

    // Login to Discord
    await client.login(process.env.BOT_TOKEN);
    logger.info(`Logged in as ${client.user.tag}`);
  } catch (error) {
    logger.error('Initialization error:', error);
    process.exit(1);
  }

  const levelingService = new LevelingService(client);
setInterval(() => {
  levelingService.updateActiveVoiceXp().catch(error => {
    logger.error('Error in voice XP update interval:', error);
  });
}, 5 * 60 * 1000);

}

// Start the application
init();