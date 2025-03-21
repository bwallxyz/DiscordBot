// services/VoteMuteService.js - New service for handling vote mute functionality
const { EmbedBuilder, Colors } = require('discord.js');
const logger = require('../utils/logger');
const PermissionService = require('./PermissionService');
const AuditLogService = require('./AuditLogService');
const { UserStateTrackerService } = require('./UserStateTrackerService');

class VoteMuteService {
  constructor(client) {
    this.client = client;
    this.permissionService = new PermissionService();
    this.auditLogService = new AuditLogService(client);
    this.stateTracker = new UserStateTrackerService();
    
    // Active vote sessions - Map<channelId, voteDetails>
    this.activeVotes = new Map();
  }
  
  /**
   * Check if a vote is already active in a channel
   * @param {String} channelId - The channel ID to check
   * @returns {Boolean} True if a vote is active, false otherwise
   */
  isVoteActive(channelId) {
    return this.activeVotes.has(channelId);
  }
  
  /**
   * Create a new vote mute session
   * @param {Object} options - Vote options
   * @returns {Promise<Object>} Vote session details
   */
  async createVoteSession(options) {
    const { 
      guild,
      channel, 
      targetUser, 
      initiator,
      reason,
      voteDuration = 60,
      isOwnerInitiated = false
    } = options;
    
    // Check if there's already an active vote
    if (this.isVoteActive(channel.id)) {
      throw new Error('There is already an active vote in this channel');
    }
    
    // Create the vote tracking object
    const voteSession = {
      yes: new Set([initiator.id]), // Initiator automatically votes yes
      no: new Set(),
      channelId: channel.id,
      targetUserId: targetUser.id,
      initiatorId: initiator.id,
      reason,
      isOwnerInitiated,
      created: Date.now(),
      endsAt: Date.now() + (voteDuration * 1000),
      totalMembers: channel.members.size
    };
    
    // Store in active votes
    this.activeVotes.set(channel.id, voteSession);
    
    // Create the vote embed
    const voteEmbed = this.createVoteEmbed({
      targetUser,
      initiator,
      reason,
      voteDuration,
      voteSession,
      channel
    });
    
    // Return the session with the embed
    return {
      session: voteSession,
      embed: voteEmbed
    };
  }
  
  /**
   * Record a vote
   * @param {String} channelId - Channel ID
   * @param {String} userId - User ID
   * @param {Boolean} voteYes - True for yes vote, false for no
   * @returns {Object} Updated vote status
   */
  recordVote(channelId, userId, voteYes) {
    const voteSession = this.activeVotes.get(channelId);
    
    if (!voteSession) {
      throw new Error('No active vote in this channel');
    }
    
    // Don't let the target vote
    if (userId === voteSession.targetUserId) {
      throw new Error('Target cannot vote in their own mute poll');
    }
    
    // Record the vote
    if (voteYes) {
      voteSession.yes.add(userId);
      voteSession.no.delete(userId); // Remove from no if changed
    } else {
      voteSession.no.add(userId);
      voteSession.yes.delete(userId); // Remove from yes if changed
    }
    
    return {
      yesCount: voteSession.yes.size,
      noCount: voteSession.no.size
    };
  }
  
  /**
   * End a vote and process the result
   * @param {String} channelId - Channel ID
   * @returns {Promise<Object>} Vote result
   */
  async endVoteSession(channelId) {
    const voteSession = this.activeVotes.get(channelId);
    
    if (!voteSession) {
      throw new Error('No active vote in this channel');
    }
    
    // Remove from active votes
    this.activeVotes.delete(channelId);
    
    // Get vote counts
    const yesCount = voteSession.yes.size;
    const noCount = voteSession.no.size;
    const totalVoters = voteSession.totalMembers - 1; // Exclude target
    const votingThreshold = Math.ceil(totalVoters / 2); // At least 50% must vote yes
    
    // Determine if vote passed
    const passed = yesCount >= votingThreshold;
    
    // Return the result
    return {
      passed,
      yesCount,
      noCount,
      votingThreshold,
      session: voteSession
    };
  }
  
  /**
   * Apply mute if vote passed
   * @param {Object} options - Options
   * @returns {Promise<Boolean>} Success status
   */
  async applyVoteResult(options) {
    logger.info(`VoteMute details being applied:
  Channel: ${options.channel?.name || 'Unknown'}
  Target: ${options.targetUser?.tag || 'Unknown'}
  Result: ${options.voteResult?.passed ? 'PASSED' : 'FAILED'}
  Yes Votes (${options.voteResult?.yesCount || 0}): ${Array.from(options.voteResult?.session?.yes || []).join(', ')}
  No Votes (${options.voteResult?.noCount || 0}): ${Array.from(options.voteResult?.session?.no || []).join(', ')}
  Required Threshold: ${options.voteResult?.votingThreshold || 0}`);
    const {
      guild,
      channel,
      targetUser,
      targetMember,
      voteResult,
      initiator
    } = options;
    
    try {
      // Only apply if vote passed
      if (!voteResult.passed) {
        return false;
      }
      
      // Get the session from the result
      const session = voteResult.session;
      
      // Track the muted state first
      await this.stateTracker.trackMutedUser({
        guildId: guild.id,
        userId: targetUser.id,
        roomId: channel.id,
        appliedBy: initiator.id,
        reason: `Vote mute (${voteResult.yesCount} yes, ${voteResult.noCount} no): ${session.reason}`
      });
      
      // Apply the permission changes
      await this.permissionService.muteUser(channel, targetUser.id);
      
      // Server mute if in channel
      if (targetMember && targetMember.voice.channelId === channel.id) {
        await targetMember.voice.setMute(true, `Vote mute: ${session.reason}`);
      }
      
      // Prepare detailed voting information for the log
      const votersYes = Array.from(session.yes).join(', ');
      const votersNo = Array.from(session.no).join(', ');
      
      // Log the action with detailed voter information
      await this.auditLogService.logUserMute(
        guild,
        initiator,
        targetMember || { id: targetUser.id, user: targetUser },
        {
          id: channel.id,
          name: channel.name,
          channelId: channel.id
        },
        `Vote mute (${voteResult.yesCount} yes, ${voteResult.noCount} no): ${session.reason}`,
        {
          voteDetails: {
            total: voteResult.yesCount + voteResult.noCount,
            threshold: voteResult.votingThreshold,
            votersYes: Array.from(session.yes),
            votersNo: Array.from(session.no)
          }
        }
      );
      
      // Try to notify the user
      try {
        await targetUser.send(
          `You have been muted in **${channel.name}** through a vote ` +
          `(${voteResult.yesCount} yes, ${voteResult.noCount} no). Reason: ${session.reason}`
        );
      } catch (error) {
        logger.warn(`Could not DM muted user ${targetUser.tag}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error applying vote mute:`, error);
      return false;
    }
  }
  
  /**
   * Create a vote embed
   * @param {Object} options - Embed options
   * @returns {EmbedBuilder} The vote embed
   */
  createVoteEmbed(options) {
    const {
      targetUser,
      initiator,
      reason,
      voteDuration,
      voteSession,
      channel
    } = options;
    
    const yesCount = voteSession.yes.size;
    const noCount = voteSession.no.size;
    const totalVoters = channel.members.size - 1; // Exclude target
    const votingThreshold = Math.ceil(totalVoters / 2); // At least 50% must vote yes
    
    return new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('📊 Vote to Mute User')
      .setDescription(`A vote has been started to mute ${targetUser} in this voice channel.`)
      .addFields(
        { name: 'Reason', value: reason },
        { name: 'Started by', value: `${initiator}` },
        { name: 'Duration', value: `This vote will last for ${voteDuration} seconds.` },
        { name: 'How to Vote', value: 'Click the buttons below to cast your vote!' },
        { name: 'Current Votes', value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}\n\nRequired: At least ${votingThreshold} yes votes to pass.` }
      )
      .setFooter({ text: `Vote ends in ${voteDuration} seconds` })
      .setTimestamp();
  }
  
  /**
   * Create a final result embed
   * @param {Object} options - Embed options
   * @returns {EmbedBuilder} The result embed
   */
  createResultEmbed(options) {
    const {
      targetUser,
      result,
      error = null
    } = options;
    
    const embed = new EmbedBuilder()
      .setColor(result.passed ? Colors.Green : Colors.Red)
      .setTitle('📊 Vote to Mute User - Ended')
      .setTimestamp()
      .setFooter({ text: 'Vote has ended' })
      .addFields(
        { name: 'Final Votes', value: `👍 Yes: ${result.yesCount}\n👎 No: ${result.noCount}` }
      );
    
    if (result.passed) {
      embed.addFields({ 
        name: 'Result', 
        value: `✅ The vote has passed! ${targetUser} has been muted.` 
      });
    } else {
      embed.addFields({ 
        name: 'Result', 
        value: `❌ The vote has failed. ${targetUser} will not be muted.` 
      });
    }
    
    if (error) {
      embed.addFields({
        name: 'Error',
        value: 'There was an error applying the mute. Please try again or use the regular /mute command.'
      });
    }
    
    return embed;
  }
}

module.exports = VoteMuteService;