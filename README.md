# Discord Room Creation Bot

A modular Discord bot that allows users to create and manage their own voice channels with advanced moderation capabilities.

## Features

- **Room Creation System**: Users join a designated channel to automatically get their own room
- **Room Owner Commands**:
  - `/mute` - Mute a user in your room
  - `/unmute` - Unmute a user in your room
  - `/kick` - Remove a user from your room
  - `/ban` - Ban a user from your room
  - `/unban` - Allow a banned user to join again
  - `/lock` - Prevent new users from joining the room
  - `/unlock` - Allow users to join the room again
  - `/rename` - Change the name of your room
- **Automatic Room Management**:
  - Auto-deletion of empty rooms
  - Configurable user limits
  - Room prefix customization
- **Modular Architecture**:
  - Easy to extend with new commands and features
  - Separation of concerns for better maintainability
  - Service-based design

## Project Structure

```
discord-room-bot/
│
├── config/                # Configuration files
│   ├── config.js          # Configuration loader
│   └── default.json       # Default configuration values
│
├── commands/              # Bot commands
│   ├── admin/             # Admin commands
│   ├── room/              # Room management commands
│   └── index.js           # Command handler & registry
│
├── events/                # Discord event handlers
│   ├── ready.js           # Bot ready event
│   ├── interactionCreate.js # Slash command handler
│   └── index.js           # Event handler & registry
│
├── services/              # Business logic services
│   ├── RoomService.js     # Room creation & management
│   └── PermissionService.js # Permission management
│
├── models/                # Data models
│   └── Room.js            # Room data model
│
├── utils/                 # Utility functions
│   ├── logger.js          # Logging utility
│   └── validators.js      # Input validation helpers
│
├── database/              # Database configuration
│   ├── db.js              # Database connection
│   └── schemas/           # Database schemas
│
├── index.js               # Main application entry point
└── package.json           # NPM package configuration
```

## Installation

1. **Prerequisites**:
   - Node.js 16.9.0 or higher
   - MongoDB

2. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/discord-room-bot.git
   cd discord-room-bot
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Configure environment variables**:
   - Copy `.env.example` to `.env`
   - Add your Discord bot token and MongoDB URI

5. **Start the bot**:
   ```bash
   npm start
   ```

## Setup

1. **Create a Discord Bot**:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application and add a bot
   - Enable all Privileged Gateway Intents (Server Members, Message Content, etc.)
   - Copy the bot token to your `.env` file

2. **Invite the Bot to Your Server**:
   - Generate an invite URL with appropriate permissions (Admin recommended)
   - Bot needs permissions to manage channels, move members, etc.

3. **Configure the Bot**:
   - Use the `/setup` command in your server
   - Specify a "creation" voice channel users will join to create rooms
   - Specify a category where rooms will be created

## Extending the Bot

The modular architecture makes it easy to add new features:

1. **Add a new command**:
   - Create a new file in the appropriate commands directory
   - Export a module with `data` and `execute` properties
   - The command will be automatically registered

2. **Add a new event handler**:
   - Create a new file in the events directory
   - Export a module with `execute` and optionally `once` properties
   - The event will be automatically registered

3. **Add a new service**:
   - Create a new file in the services directory
   - Export a class or object with your business logic

Understanding the Modular Architecture
The Discord bot is built with a highly modular architecture that separates concerns into distinct components. This approach makes the codebase easier to maintain and extend with new features. Let me explain the key architectural concepts:
Core Architecture Components
1. Event-Driven Design
The bot operates on an event-driven architecture where it responds to Discord events:

Event Handlers (events/ directory): These modules respond to Discord events like messages, voice state changes, etc.
Event Registration: The events/index.js file automatically discovers and registers all event handlers.

The event system works by:

Listening for Discord events (like a user joining a voice channel)
Processing the event data through appropriate handlers
Delegating business logic to services

For example, when a user joins the creation channel, the voiceStateUpdate event triggers, and the handler delegates to the RoomService to create a new room.
2. Service Layer
Services encapsulate business logic and provide a clean API for commands and event handlers:

RoomService: Handles room creation, deletion, and management
PermissionService: Manages Discord permission operations

Services keep your code DRY (Don't Repeat Yourself) by:

Centralizing related functionality
Providing reusable methods for common operations
Abstracting complex operations behind simple interfaces

For example, instead of writing permission code in every command, commands simply call methods like permissionService.muteUser().
3. Command Structure
Commands are organized in subdirectories based on function:

Command Modules: Each command is a self-contained module with data definition and execution logic
Auto-Discovery: The command handler automatically loads and registers all command modules

Adding a new command is as simple as creating a new file with the correct structure - no need to modify registration code.
How This Helps with Extensibility
This architecture allows you to:

Add new features without modifying existing code: Just add new modules
Isolate changes: Modifications to one feature don't affect others
Reuse code: Common functionality is shared through services
Separate concerns: Each component has a single responsibility

For example, if you wanted to add a feature that lets users create temporary rooms that expire after a set time:

Add a new method to RoomService for handling expirations
Create a new command for setting expiration time
Add a timer system to check for expired rooms

The existing room creation and management code would remain unchanged while you add this new capability.
This approach gives you a solid foundation that can be extended in nearly unlimited ways while maintaining a clean, organized codebase.

Inviting Your Discord Room Creation Bot
To invite your Discord bot to your server, you'll need to follow these steps:
1. Register Your Application
First, make sure your bot is registered in the Discord Developer Portal:

Go to the Discord Developer Portal
Sign in with your Discord account
Click "New Application" and give it a name
Navigate to the "Bot" tab and click "Add Bot"
Under the "Privileged Gateway Intents" section, enable:

Server Members Intent
Message Content Intent
Voice State Intent


Save your changes

2. Generate an Invite URL
Next, you need to generate an invite URL with the proper permissions:

In the Developer Portal, go to the "OAuth2" tab
In the "OAuth2 URL Generator" section, select the following scopes:

bot
applications.commands


Under "Bot Permissions", select:

Manage Channels
Move Members
Manage Roles
Connect
Speak
Mute Members
Deafen Members
Send Messages
Read Message History
View Channels
Use Slash Commands


You can also just select "Administrator" for full access (recommended for simplicity)
Copy the generated URL at the bottom of the page

3. Invite the Bot to Your Server

Paste the URL you copied into your web browser
Select the server you want to add the bot to
Click "Authorize"
Complete the CAPTCHA if prompted
The bot will now appear in your server's member list

4. Setup the Bot in Your Server
After the bot joins your server:

Make sure your bot is running (using npm start)
Use the /setup command in your server
Select a voice channel users will join to create rooms
Select a category where new rooms will be created

The bot should now be fully operational, and users can create rooms by joining the designated creation channel.


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.