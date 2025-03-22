# Discord Room Bot Dashboard

An admin dashboard for the Discord Room Bot that allows server administrators to view and manage user data, rooms, and level settings.

## Features

- **Discord Authentication**: Secure login using Discord OAuth2
- **Admin-Only Access**: Only server administrators can access the dashboard
- **Dashboard Overview**: View key statistics about your Discord server
- **Room Management**: View and manage voice rooms created by users
- **User Management**: Track user levels, XP, and activity
- **Level System Configuration**: Customize XP settings and level roles

## Tech Stack

- **Frontend**: React, Material-UI, Chart.js
- **Backend**: Express, MongoDB, Passport.js
- **Authentication**: Discord OAuth2

## Installation

### Prerequisites

- Node.js 16.9.0 or higher
- MongoDB database

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/discord-room-bot-dashboard.git
   cd discord-room-bot-dashboard
   ```

2. Install dependencies:
   ```bash
   npm run install-all
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Client URL
   CLIENT_URL=http://localhost:3000

   # MongoDB
   MONGODB_URI=your_mongodb_connection_string

   # Discord OAuth
   CLIENT_ID=your_discord_client_id
   CLIENT_SECRET=your_discord_client_secret
   REDIRECT_URI=http://localhost:5000/api/auth/callback
   GUILD_ID=your_discord_server_id

   # Session
   SESSION_SECRET=your_session_secret
   ```

4. Set up your Discord application:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application (or use your existing bot application)
   - Under the "OAuth2" tab, add a redirect URL: `http://localhost:5000/api/auth/callback`
   - Copy the Client ID and Client Secret to your `.env` file

5. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Navigate to `http://localhost:3000` in your browser
2. Click "Login with Discord" and authorize the application
3. If you're an administrator in the Discord server, you'll be taken to the dashboard
4. Non-administrators will see an "Unauthorized" message

## Deployment

### Heroku

1. Create a new Heroku app
2. Set the environment variables in the Heroku dashboard
3. Deploy the app:
   ```bash
   heroku git:remote -a your-heroku-app-name
   git push heroku main
   ```

### Docker

A Dockerfile is included for containerized deployment. Build and run with:

```bash
docker build -t discord-dashboard .
docker run -p 5000:5000 --env-file .env discord-dashboard
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.