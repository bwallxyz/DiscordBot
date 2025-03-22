// dashboard/services/RoomService.js
/**
 * Service for managing Discord voice rooms
 */
class RoomService {
  constructor(discordClient) {
    this.client = discordClient;
  }

  /**
   * Delete a room
   * @param {Object} room - Room document from database
   * @returns {Promise<boolean>} - Success status
   */
  async deleteRoom(room) {
    try {
      // Delete the room from the database
      await room.deleteOne();
      
      // If we have a Discord client connection, try to delete the channel
      if (this.client && this.client.isReady()) {
        try {
          const guild = await this.client.guilds.fetch(room.guildId);
          const channel = await guild.channels.fetch(room.channelId).catch(() => null);
          
          if (channel) {
            await channel.delete('Room deleted via admin dashboard');
          }
        } catch (discordErr) {
          console.error('Error deleting Discord channel:', discordErr);
          // We still consider it a success if the DB entry was deleted
        }
      }
      
      return true;
    } catch (err) {
      console.error('Error in RoomService.deleteRoom:', err);
      throw err;
    }
  }
}

module.exports = RoomService;