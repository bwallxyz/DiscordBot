// Bot ready event handler
const logger = require('../utils/logger');

module.exports = {
  // Execute once when the client becomes ready
  once: true,
  
  async execute(client) {
    logger.info(`Ready! Logged in as ${client.user.tag}`);
    
    // Register any pending commands that couldn't be registered before login
    if (client.pendingCommands && client.pendingCommands.length > 0) {
      try {
        await client.application.commands.set(client.pendingCommands);
        logger.info(`Registered ${client.pendingCommands.length} global commands after ready`);
        client.pendingCommands = null;
      } catch (error) {
        logger.error('Error registering global commands after ready:', error);
      }
    }
  }
};