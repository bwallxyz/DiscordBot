// Deploy commands to a specific guild for immediate updates
// Uses GUILD_ID from .env file
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Set up logging
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
  
  // Also append to log file
  fs.appendFileSync(
    path.join(__dirname, 'guild-command-deploy.log'),
    `[${new Date().toISOString()}] ${message}\n`
  );
};

// Get Guild ID from .env
const guildId = process.env.GUILD_ID || process.argv[2];
if (!guildId) {
  log('ERROR: No Guild ID found. Add GUILD_ID to your .env file or provide it as a command line argument.');
  log('Usage: node guild-deploy-commands.js [OPTIONAL_GUILD_ID]');
  process.exit(1);
}

// Check client ID and token
const clientId = process.env.CLIENT_ID;
const token = process.env.BOT_TOKEN;

if (!clientId) {
  log('ERROR: CLIENT_ID environment variable is missing!');
  process.exit(1);
}

if (!token) {
  log('ERROR: BOT_TOKEN environment variable is missing!');
  process.exit(1);
}

// Store command data
const commands = [];

// Walk directory to find all command files
function findCommandFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // Recursively search directories
      findCommandFiles(filePath);
    } else if (file.name.endsWith('.js') && !file.name.startsWith('index')) {
      try {
        // Clear require cache to ensure fresh data
        delete require.cache[require.resolve(filePath)];
        
        // Load the command file
        const command = require(filePath);
        
        // Check if it has the required 'data' property with name
        if (command.data && command.data.name) {
          log(`Found command '${command.data.name}' at ${filePath}`);
          commands.push(command.data.toJSON());
        } else {
          log(`Warning: File ${filePath} is not a valid command (missing data property)`);
        }
      } catch (error) {
        log(`Error loading command file ${filePath}: ${error.message}`);
      }
    }
  }
}

// Function to deploy commands to a specific guild
async function deployGuildCommands() {
  log(`Starting guild command deployment to Guild ID: ${guildId}`);
  log(`Using Client ID: ${clientId.substring(0, 5)}...`);
  
  // Clear commands array
  commands.length = 0;
  
  // Find command files
  log('Searching for command files...');
  findCommandFiles(path.join(__dirname, 'commands'));
  
  // Display commands found
  log(`Found ${commands.length} commands to register`);
  for (const cmd of commands) {
    log(`- ${cmd.name} (${cmd.description.substring(0, 30)}...)`);
  }
  
  if (commands.length === 0) {
    log('No commands found to register! Aborting.');
    return;
  }
  
  try {
    log('Creating REST instance and setting token...');
    const rest = new REST({ version: '10' }).setToken(token);
    
    log('Sending command registration request to Discord...');
    log(`PUT ${Routes.applicationGuildCommands(clientId, guildId)}`);
    
    const response = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    
    log(`Successfully registered ${response.length} commands to guild ${guildId}!`);
    
    // List registered commands
    for (const cmd of response) {
      log(`✅ Registered: ${cmd.name} (ID: ${cmd.id})`);
    }
    
    log('Guild command registration complete!');
  } catch (error) {
    log(`ERROR during command registration: ${error.message}`);
    log(error.stack);
  }
}

// Run the deployment
log('---------------------------------------------');
log(`STARTING GUILD COMMAND DEPLOYMENT TO ${guildId}`);
log('---------------------------------------------');

deployGuildCommands()
  .then(() => {
    log('Deployment process completed');
    process.exit(0);
  })
  .catch(error => {
    log(`Unhandled error in deployment process: ${error.message}`);
    log(error.stack);
    process.exit(1);
  });