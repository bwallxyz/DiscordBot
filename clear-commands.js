// Clear all commands (both global and guild-specific)
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Set up logging
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
  fs.appendFileSync(
    path.join(__dirname, 'command-clear.log'),
    `[${new Date().toISOString()}] ${message}\n`
  );
};

// Check environment variables
const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;
const guildId = process.env.GUILD_ID;

if (!clientId || !token) {
  log('ERROR: Required environment variables missing (CLIENT_ID, BOT_TOKEN)');
  process.exit(1);
}

// Function to clear all commands
async function clearCommands() {
  try {
    log('Creating REST instance and setting token...');
    const rest = new REST({ version: '10' }).setToken(token);
    
    // Clear global commands
    log('Clearing all global commands...');
    const globalResponse = await rest.put(
      Routes.applicationCommands(clientId),
      { body: [] }
    );
    log(`✅ Cleared global commands. Response: ${JSON.stringify(globalResponse)}`);
    
    // Clear guild commands if GUILD_ID is set
    if (guildId) {
      log(`Clearing guild commands for guild ${guildId}...`);
      const guildResponse = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      log(`✅ Cleared guild commands. Response: ${JSON.stringify(guildResponse)}`);
    } else {
      log('No GUILD_ID set, skipping guild command clearing');
    }
    
    log('Command clearing completed successfully!');
  } catch (error) {
    log(`ERROR during command clearing: ${error.message}`);
    log(error.stack);
  }
}

// Run the clearing process
log('---------------------------------------------');
log('STARTING COMMAND CLEARING PROCESS');
log('---------------------------------------------');

clearCommands()
  .then(() => {
    log('All commands have been cleared successfully');
    log('You can now run guild-deploy-commands.js to register your commands');
  })
  .catch(error => {
    log(`Unhandled error in clearing process: ${error.message}`);
    log(error.stack);
  });