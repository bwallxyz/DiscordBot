// Script to deploy slash commands
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');

// Create a collection for commands
const commands = [];

// Load all commands recursively from the commands directory
function loadCommands(directory = path.join(__dirname, 'commands')) {
  const items = fs.readdirSync(directory, { withFileTypes: true });
  
  for (const item of items) {
    const itemPath = path.join(directory, item.name);
    
    // Skip index.js and hidden files
    if (item.name === 'index.js' || item.name.startsWith('.')) {
      continue;
    }
    
    if (item.isDirectory()) {
      // Recursively process directories
      loadCommands(itemPath);
    } else if (item.name.endsWith('.js')) {
      try {
        // Load the command module
        const command = require(itemPath);
        
        // Ensure it has required properties
        if (!command.data) {
          logger.warn(`Command at ${itemPath} is missing required data property`);
          continue;
        }
        
        // Add to commands array
        commands.push(command.data.toJSON());
        logger.info(`Loaded command for deployment: ${command.data.name}`);
      } catch (error) {
        logger.error(`Error loading command from ${itemPath}:`, error);
      }
    }
  }
}

// Deploy the commands
async function deployCommands() {
  try {
    // Load all commands
    loadCommands();
    
    // Create REST instance
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    
    logger.info('Started refreshing application (/) commands.');
    
    // The client ID is needed for command registration
    const clientId = process.env.CLIENT_ID;
    
    if (!clientId) {
      throw new Error('CLIENT_ID environment variable is missing');
    }
    
    // Register commands globally
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );
    
    logger.info(`Successfully reloaded ${data.length} application (/) commands.`);
    
    // List all registered commands
    data.forEach(cmd => {
      logger.info(`Registered command: ${cmd.name}`);
    });
    
  } catch (error) {
    logger.error('Error deploying commands:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  deployCommands().then(() => {
    logger.info('Command deployment completed');
    process.exit(0);
  }).catch(error => {
    logger.error('Command deployment failed:', error);
    process.exit(1);
  });
} else {
  // Export for use in other files
  module.exports = { deployCommands };
}