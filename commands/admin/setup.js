// Setup command for room creation system
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, Colors } = require('discord.js');
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
    .addChannelOption(option => 
      option.setName('audit_channel')
        .setDescription('The text channel where moderation actions will be logged')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
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
      const auditChannel = interaction.options.getChannel('audit_channel');
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
      
      if (auditChannel && auditChannel.type !== ChannelType.GuildText) {
        return interaction.reply({ 
          content: 'Audit channel must be a text channel', 
          ephemeral: true 
        });
      }
      
      // Save config to database
      await setGuildConfig(interaction.guild.id, {
        creationChannelId: creationChannel.id,
        roomCategoryId: roomCategory.id,
        auditChannelId: auditChannel ? auditChannel.id : null,
        autoDeleteEmptyRooms: autoDelete,
        roomPrefix,
        maxRoomsPerUser: maxRooms
      });
      
      // Create information embed
      const setupEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('🔊 Room Creation System Setup')
        .setDescription('Your room creation system has been configured successfully!')
        .addFields(
          { name: 'Creation Channel', value: `${creationChannel}`, inline: true },
          { name: 'Rooms Category', value: `${roomCategory}`, inline: true },
          { name: 'Auto-delete Empty Rooms', value: autoDelete ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Room Prefix', value: roomPrefix ? `"${roomPrefix}"` : 'None', inline: true },
          { name: 'Max Rooms Per User', value: `${maxRooms}`, inline: true }
        )
        .setFooter({ text: `Setup by ${interaction.user.tag}` })
        .setTimestamp();
      
      // Add audit channel information if provided
      if (auditChannel) {
        setupEmbed.addFields({
          name: 'Audit Log Channel', 
          value: `${auditChannel}`,
          inline: true
        });
        
        // Send a test message to the audit channel
        try {
          const testEmbed = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('🔧 Audit Log Channel Setup')
            .setDescription('This channel has been configured as the audit log channel for the room creation system.')
            .addFields({
              name: 'Information',
              value: 'Moderation actions and room events will be logged here.'
            })
            .setFooter({ text: `Setup by ${interaction.user.tag}` })
            .setTimestamp();
          
          await auditChannel.send({ embeds: [testEmbed] });
        } catch (error) {
          logger.error(`Error sending test message to audit channel:`, error);
          setupEmbed.addFields({
            name: '⚠️ Warning',
            value: 'Could not send a test message to the audit channel. Please check bot permissions.',
            inline: false
          });
        }
      }
      
      // Respond to the interaction
      await interaction.reply({
        embeds: [setupEmbed],
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