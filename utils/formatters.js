// Formatting utilities
const moment = require('moment');

/**
 * Format milliseconds into a human-readable duration
 * @param {Number} ms - Duration in milliseconds
 * @returns {String} Formatted duration string
 */
function formatDuration(ms) {
  if (!ms) return '0 seconds';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  const parts = [];
  
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  
  // For very short durations
  if (parts.length === 0) {
    return 'less than a second';
  }
  
  return parts.join(', ');
}

/**
 * Format a date to a human-readable date and time
 * @param {Date} date - Date object to format
 * @returns {String} Formatted date string
 */
function formatDateTime(date) {
  if (!date) return 'Never';
  return moment(date).format('MMM D, YYYY [at] h:mm A');
}

/**
 * Format a relative time (e.g., "2 hours ago")
 * @param {Date} date - Date object to format
 * @returns {String} Relative time string
 */
function formatRelativeTime(date) {
  if (!date) return 'Never';
  return moment(date).fromNow();
}

module.exports = {
  formatDuration,
  formatDateTime,
  formatRelativeTime
};