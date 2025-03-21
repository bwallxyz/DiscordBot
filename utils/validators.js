// Input validation helpers
const { ChannelType } = require('discord.js');
const Room = require('../models/Room');

/**
 * Validate if a string meets the requirements for a room name
 */
function isValidRoomName(name) {
  // Room name should be 1-100 characters
  return typeof name === 'string' && name.length >= 1 && name.length <= 100;
}

/**
 * Check if a channel is a voice channel
 */
function isVoiceChannel(channel) {
  return channel && channel.type === ChannelType.GuildVoice;
}

/**
 * Check if a channel is a category
 */
function isCategory(channel) {
  return channel && channel.type === ChannelType.GuildCategory;
}

/**
 * Check if a user is in a voice channel
 */
function isInVoiceChannel(member) {
  return member && member.voice && member.voice.channel;
}

/**
 * Check if a user is the owner of the current voice channel
 */
async function isRoomOwner(member) {
  if (!isInVoiceChannel(member)) {
    return false;
  }
  
  const channelId = member.voice.channel.id;
  const room = await Room.findOne({ channelId });
  
  return room && room.ownerId === member.id;
}

/**
 * Check if a member has admin permissions
 */
function isAdmin(member) {
  return member && member.permissions.has('ADMINISTRATOR');
}

module.exports = {
  isValidRoomName,
  isVoiceChannel,
  isCategory,
  isInVoiceChannel,
  isRoomOwner,
  isAdmin
};