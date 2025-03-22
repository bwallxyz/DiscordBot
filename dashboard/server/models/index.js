// server/models/index.js
const Room = require('./Room');
const UserActivity = require('./UserActivity');
const UserLevel = require('./UserLevel');
const AuditLog = require('./AuditLog');

// Re-export models
module.exports = {
  Room,
  UserActivity,
  UserLevel,
  AuditLog
};