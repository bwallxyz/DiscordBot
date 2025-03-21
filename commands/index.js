// Command handler & registry
const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const logger = require('../utils/logger');

// Command collection
const commands = new Collection();

// Load all commands recursively from the commands directory
function loadCommands(directory = path.join(__dirname)) {
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
        if (!command.data || !command.execute) {
          logger.warn(`Command at ${itemPath} is missing required properties`);
          continue;
        }
        
        // Add to command collection
        commands.set(command.data.name, command);
        logger.info(`Loaded command: ${command.data.name}`);
      } catch (error) {
        logger.error(`Error loading command from ${itemPath}:`, error);
      }
    }
  }
}

// Register commands with Discord
async function registerCommands(client) {
  // Load all commands first
  loadCommands();
  
  // Store commands on client for easy access
  client.commands = commands;
  
  // Register all commands globally
  if (commands.size > 0) {
    try {
      const commandData = Array.from(commands.values()).map(cmd => cmd.data);
      
      // Only attempt to register if the client is ready
      if (client.isReady()) {
        await client.application.commands.set(commandData);
        logger.info(`Registered ${commandData.length} global commands`);
      } else {
        // Store commandData to be registered on ready event
        client.pendingCommands = commandData;
      }
    } catch (error) {
      logger.error('Error registering global commands:', error);
    }
  }
}

module.exports = {
  commands,
  registerCommands,
  loadCommands
};