// Event handler & registry
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Load and register all events from the events directory
async function registerEvents(client) {
  const eventFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js') && file !== 'index.js');
  
  for (const file of eventFiles) {
    try {
      const filePath = path.join(__dirname, file);
      const event = require(filePath);
      
      // Get the event name from the file name (without extension)
      const eventName = file.split('.')[0];
      
      if (typeof event.execute !== 'function') {
        logger.warn(`Event ${eventName} missing execute function`);
        continue;
      }
      
      // Register the event handler
      if (event.once) {
        // For one-time events
        client.once(eventName, (...args) => event.execute(client, ...args));
      } else {
        // For regular events
        client.on(eventName, (...args) => event.execute(client, ...args));
      }
      
      logger.info(`Registered event: ${eventName}`);
    } catch (error) {
      logger.error(`Error loading event ${file}:`, error);
    }
  }
}

module.exports = {
  registerEvents
};