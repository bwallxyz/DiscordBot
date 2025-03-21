// Setup command for room creation system
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { setGuildConfig } = require('../../database/schemas/guildConfig');
const logger = require('../../utils/logger');

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup the room creation system')
    .addChannelOption(option => 
      option.setName('creation_channel')
        .setDescription('The voice channel users join to create rooms')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addChannelOption(option => 
      option.setName('rooms_category')
        .setDescription('The category where rooms will be created')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )
    .addBooleanOption(option => 
      option.setName('auto_delete')
        .setDescription('Automatically delete empty rooms')
        .setRequired(false)
    )
    .addStringOption(option => 
      option.setName('room_prefix')
        .setDescription('Prefix for room names (optional)')
        .setRequired(false)
    )
    .addIntegerOption(option => 
      option.setName('max_rooms')
        .setDescription('Maximum rooms per user (default: 1)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Extract options
      const creationChannel = interaction.options.getChannel('creation_channel');
      const roomCategory = interaction.options.getChannel('rooms_category');
      const autoDelete = interaction.options.getBoolean('auto_delete') ?? true;
      const roomPrefix = interaction.options.getString('room_prefix') ?? '';
      const maxRooms = interaction.options.getInteger('max_rooms') ?? 1;
      
      // Validate channel types (extra validation for security)
      if (creationChannel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ 
          content: 'Creation channel must be a voice channel', 
          ephemeral: true 
        });
      }
      
      if (roomCategory.type !== ChannelType.GuildCategory) {
        return interaction.reply({ 
          content: 'Rooms category must be a category', 
          ephemeral: true 
        });
      }
      
      // Save config to database
      await setGuildConfig(interaction.guild.id, {
        creationChannelId: creationChannel.id,
        roomCategoryId: roomCategory.id,
        autoDeleteEmptyRooms: autoDelete,
        roomPrefix,
        maxRoomsPerUser: maxRooms
      });
      
      // Respond to the interaction
      await interaction.reply({
        content: `Room creation system has been set up! Users can join ${creationChannel} to create their own rooms.
        
Configuration:
• Creation Channel: ${creationChannel}
• Rooms Category: ${roomCategory}
• Auto-delete Empty Rooms: ${autoDelete ? 'Yes' : 'No'}
• Room Prefix: ${roomPrefix ? `"${roomPrefix}"` : 'None'}
• Max Rooms Per User: ${maxRooms}`,
        ephemeral: true
      });
      
      logger.info(`Room creation system set up in guild ${interaction.guild.id} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error executing setup command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while setting up the room creation system.', 
        ephemeral: true 
      });
    }
  }
};