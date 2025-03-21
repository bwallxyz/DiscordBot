// Command interaction handler
const logger = require('../utils/logger');

module.exports = {
  async execute(client, interaction) {
    // Handle only command interactions
    if (!interaction.isCommand()) return;
    
    // Get the command from the collection
    const command = client.commands.get(interaction.commandName);
    
    // If command doesn't exist, ignore
    if (!command) return;
    
    try {
      // Execute the command
      await command.execute(client, interaction);
    } catch (error) {
      logger.error(`Error executing command ${interaction.commandName}:`, error);
      
      // Reply with error if interaction hasn't been replied to
      const errorReply = { 
        content: 'There was an error executing this command!', 
        ephemeral: true 
      };
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply).catch(() => {});
      } else {
        await interaction.reply(errorReply).catch(() => {});
      }
    }
  }
};