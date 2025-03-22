// commands/room/votemute.js - Duration controls mute length, not vote time
const { SlashCommandBuilder, EmbedBuilder, Colors, ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const AuditLogService = require('../../services/AuditLogService');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService');
const { isInVoiceChannel } = require('../../utils/validators');

// Store votes by unique ID
const activeVotes = new Map();

// Fixed vote duration (always 60 seconds)
const VOTE_DURATION = 60;

// Store active mute timers
const activeMuteTimers = new Map();

module.exports = {
  // Command definition
  data: new SlashCommandBuilder()
    .setName('votemute')
    .setDescription('Start a vote to mute a user in your room')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('The user to potentially mute')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the mute vote')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration of the mute in minutes (default: 5)')
        .setMinValue(1)
        .setMaxValue(60)
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const muteDuration = (interaction.options.getInteger('duration') || 5) * 60 * 1000; // Convert to milliseconds
      
      // Check if the command user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      const voiceChannel = interaction.member.voice.channel;
      
      // Check if this specific user is already being voted on in this channel
      const existingVoteForUser = Array.from(activeVotes.values()).find(vote => 
        vote.channelId === voiceChannel.id && vote.targetUserId === targetUser.id
      );
      
      if (existingVoteForUser) {
        return interaction.reply({
          content: `There's already an active vote to mute ${targetUser} in this channel.`,
          ephemeral: true
        });
      }
      
      // Check if the user is trying to vote-mute themselves
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: 'You cannot start a vote to mute yourself.',
          ephemeral: true
        });
      }
      
      // Check if the target is in the same voice channel
      if (!targetMember || targetMember.voice.channelId !== voiceChannel.id) {
        return interaction.reply({
          content: 'The target user must be in the same voice channel to start a vote.',
          ephemeral: true
        });
      }
      
      // Initialize services
      const roomService = new RoomService(client);
      const permissionService = new PermissionService();
      const auditLogService = new AuditLogService(client);
      const stateTracker = new UserStateTrackerService();
      
      // Check if user is already muted
      const isMuted = await stateTracker.hasUserState({
        guildId: interaction.guild.id,
        userId: targetUser.id,
        roomId: voiceChannel.id,
        state: 'MUTED'
      });
      
      if (isMuted) {
        return interaction.reply({
          content: `${targetUser} is already muted in this room.`,
          ephemeral: true
        });
      }
      
      // Check if the initiator is the room owner
      const isOwner = await roomService.isRoomOwner(voiceChannel.id, interaction.user.id);
      
      // Generate a unique vote ID
      const voteId = `vote_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Count eligible voters (excluding the target)
      const eligibleVoters = voiceChannel.members.filter(m => m.id !== targetUser.id);
      const totalVoters = eligibleVoters.size;
      
      // Calculate threshold - fixed for rooms with 3+ people
      let voteThreshold;
      if (totalVoters >= 3 || (voiceChannel.members.size >= 3 && totalVoters >= 2)) {
        voteThreshold = Math.max(2, Math.ceil(totalVoters / 2));
      } else {
        // For smaller rooms, at least 50% must vote yes
        voteThreshold = Math.max(1, Math.ceil(totalVoters / 2));
      }
      
      // Format duration for display
      const minutes = Math.floor(muteDuration / (60 * 1000));
      const durationText = minutes === 1 ? '1 minute' : `${minutes} minutes`;
      
      // Create the vote embed
      const voteEmbed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle(`📊 Vote to Mute ${targetUser.username}`)
        .setDescription(`A vote has been started to mute ${targetUser} for ${durationText}.`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Started by', value: `${interaction.user}` },
          { name: 'Vote Duration', value: `This vote will last for up to ${VOTE_DURATION} seconds, or until enough votes are cast.` },
          { name: 'How to Vote', value: 'Click the buttons below to cast your vote! You can change your vote at any time.' },
          { name: 'Current Votes', value: '👍 Yes: 0\n👎 No: 0\n\nRequired: At least ' + voteThreshold + ' yes vote(s) to pass.' }
        )
        .setFooter({ text: `Vote ID: ${voteId.slice(0, 10)} • Mute duration: ${durationText}` })
        .setTimestamp();
      
      // Add buttons for voting
      const voteRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`yes_${voteId}`)
            .setLabel('Yes, Mute Them')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('👍'),
          new ButtonBuilder()
            .setCustomId(`no_${voteId}`)
            .setLabel('No, Don\'t Mute')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👎')
        );
      
      // Send the vote message
      await interaction.deferReply();
      const voteMessage = await interaction.followUp({ 
        embeds: [voteEmbed],
        components: [voteRow]
      });
      
      // Initialize vote tracking - do NOT automatically count initiator's vote
      const votes = {
        voteId: voteId,
        yes: new Set(), // No automatic votes
        no: new Set(),
        channelId: voiceChannel.id,
        targetUserId: targetUser.id,
        initiatorId: interaction.user.id,
        reason: reason,
        isOwnerInitiated: isOwner,
        messageId: voteMessage.id,
        guildId: interaction.guild.id,
        threshold: voteThreshold,
        muteDuration: muteDuration
      };
      
      // Store in activeVotes using the vote ID
      activeVotes.set(voteId, votes);
      
      // Function to update the vote embed
      const updateVoteEmbed = async () => {
        try {
          const yesCount = votes.yes.size;
          const noCount = votes.no.size;
          
          // Update the vote count field
          voteEmbed.spliceFields(4, 1, {
            name: 'Current Votes',
            value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}\n\nRequired: At least ${voteThreshold} yes vote(s) to pass.`
          });
          
          await voteMessage.edit({ embeds: [voteEmbed], components: [voteRow] });
        } catch (err) {
          logger.error(`Error updating vote embed: ${err.message}`);
        }
      };
      
      // Update the vote count initially
      await updateVoteEmbed();
      
      // Create a button interaction collector for this vote
      const filter = i => 
        (i.customId === `yes_${voteId}` || i.customId === `no_${voteId}`) && 
        i.member.voice?.channelId === voiceChannel.id;
      
      const collector = interaction.channel.createMessageComponentCollector({
        filter,
        time: VOTE_DURATION * 1000
      });
      
      // Function to check if vote has passed
      const checkVoteCompletion = () => {
        const yesCount = votes.yes.size;
        const noCount = votes.no.size;
        const remainingVoters = totalVoters - yesCount - noCount;
        
        // Check if enough yes votes
        if (yesCount >= voteThreshold) {
          return { shouldComplete: true, reason: 'vote_passed' };
        }
        
        // Check if impossible to reach threshold
        if (yesCount + remainingVoters < voteThreshold) {
          return { shouldComplete: true, reason: 'vote_failed' };
        }
        
        // Check if all have voted
        if (yesCount + noCount >= totalVoters) {
          return { shouldComplete: true, reason: yesCount >= voteThreshold ? 'vote_passed' : 'vote_failed' };
        }
        
        return { shouldComplete: false };
      };
      
      // Handle vote interactions
      collector.on('collect', async i => {
        try {
          // Don't let target vote
          if (i.user.id === targetUser.id) {
            await i.reply({
              content: 'You cannot vote in a mute poll targeting yourself!',
              ephemeral: true
            });
            return;
          }
          
          // Record the vote
          if (i.customId === `yes_${voteId}`) {
            // If already voted yes, toggle to no vote
            if (votes.yes.has(i.user.id)) {
              votes.yes.delete(i.user.id);
              // Let user know they removed their vote
              await i.reply({ content: 'Your YES vote has been removed.', ephemeral: true });
            } else {
              // Add yes vote, remove no vote if exists
              votes.yes.add(i.user.id);
              votes.no.delete(i.user.id);
              await i.reply({ content: 'You voted YES to mute.', ephemeral: true });
            }
          } else if (i.customId === `no_${voteId}`) {
            // If already voted no, toggle to yes vote
            if (votes.no.has(i.user.id)) {
              votes.no.delete(i.user.id);
              // Let user know they removed their vote
              await i.reply({ content: 'Your NO vote has been removed.', ephemeral: true });
            } else {
              // Add no vote, remove yes vote if exists
              votes.no.add(i.user.id);
              votes.yes.delete(i.user.id);
              await i.reply({ content: 'You voted NO to muting.', ephemeral: true });
            }
          }
          
          // Update the vote count
          await updateVoteEmbed();
          
          // Check if vote should complete
          const completion = checkVoteCompletion();
          if (completion.shouldComplete) {
            collector.stop(completion.reason);
          }
        } catch (err) {
          logger.error(`Error handling vote interaction: ${err.message}`);
          try {
            if (!i.replied) {
              await i.reply({ content: 'There was an error processing your vote.', ephemeral: true });
            }
          } catch (_) {}
        }
      });
      
      // Handle vote completion
      collector.on('end', async (collected, reason) => {
        try {
          // Remove from active votes
          activeVotes.delete(voteId);
          
          // Get vote counts
          const yesCount = votes.yes.size;
          const noCount = votes.no.size;
          
          // Create disabled buttons
          const disabledRow = new ActionRowBuilder()
            .addComponents(
              ButtonBuilder.from(voteRow.components[0]).setDisabled(true),
              ButtonBuilder.from(voteRow.components[1]).setDisabled(true)
            );
          
          // Determine if vote passed based on threshold
          const passed = yesCount >= voteThreshold;
          
          // Update embed with results
          voteEmbed.setColor(passed ? Colors.Green : Colors.Red);
          voteEmbed.setTitle(`📊 Vote to Mute ${targetUser.username} - ${passed ? 'Passed' : 'Failed'}`);
          voteEmbed.setFooter({ text: `Vote ended: ${reason}` });
          
          // Remove instructions
          voteEmbed.spliceFields(3, 2);
          
          // Add result fields
          voteEmbed.addFields(
            { name: 'Final Votes', value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}\n(Threshold was ${voteThreshold})` },
            { name: 'Result', value: passed 
              ? `✅ The vote has passed! ${targetUser} has been muted for ${durationText}.` 
              : `❌ The vote has failed. ${targetUser} will not be muted.` 
            }
          );
          
          // Apply mute if passed
          if (passed) {
            try {
              // Track muted state
              await stateTracker.trackMutedUser({
                guildId: interaction.guild.id,
                userId: targetUser.id,
                roomId: voiceChannel.id,
                appliedBy: interaction.user.id,
                reason: `Vote mute (${durationText}): ${reason}`
              });
              
              // Apply permission changes
              await permissionService.muteUser(voiceChannel, targetUser.id);
              
              // Server mute if in channel
              if (targetMember?.voice?.channelId === voiceChannel.id) {
                await targetMember.voice.setMute(true, `Vote mute: ${reason}`);
              }
              
              // Log action
              await auditLogService.logUserMute(
                interaction.guild,
                { id: interaction.user.id, tag: interaction.user.tag },
                targetMember || { id: targetUser.id, user: targetUser },
                {
                  id: voiceChannel.id,
                  name: voiceChannel.name,
                  channelId: voiceChannel.id
                },
                `Vote mute (${durationText}) (${yesCount} yes, ${noCount} no): ${reason}`
              );
              
              // Set timer to unmute after the specified duration
              const timerKey = `${interaction.guild.id}_${targetUser.id}_${voiceChannel.id}`;
              
              // Clear any existing timer
              if (activeMuteTimers.has(timerKey)) {
                clearTimeout(activeMuteTimers.get(timerKey));
              }
              
              // Set new timer
              const timer = setTimeout(async () => {
                try {
                  // Check if still muted
                  const stillMuted = await stateTracker.hasUserState({
                    guildId: interaction.guild.id,
                    userId: targetUser.id,
                    roomId: voiceChannel.id,
                    state: 'MUTED'
                  });
                  
                  if (stillMuted) {
                    // Unmute the user
                    await permissionService.unmuteUser(voiceChannel, targetUser.id);
                    
                    // Remove muted state
                    await stateTracker.removeUserState({
                      guildId: interaction.guild.id,
                      userId: targetUser.id,
                      roomId: voiceChannel.id,
                      state: 'MUTED'
                    });
                    
                    // Get current member and unmute if in channel
                    const currentMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (currentMember?.voice?.channelId === voiceChannel.id && currentMember.voice.serverMute) {
                      await currentMember.voice.setMute(false, `Vote mute duration expired`);
                    }
                    
                    // Log the auto-unmute
                    await auditLogService.logUserUnmute(
                      interaction.guild,
                      { id: client.user.id, tag: client.user.tag },
                      { id: targetUser.id, user: targetUser },
                      {
                        id: voiceChannel.id,
                        name: voiceChannel.name,
                        channelId: voiceChannel.id
                      },
                      `Vote mute duration (${durationText}) expired`
                    );
                    
                    // Send notification to channel
                    voiceChannel.send(`${targetUser} has been automatically unmuted (mute duration of ${durationText} expired).`)
                      .catch(() => logger.warn(`Could not send unmute notification to channel`));
                  }
                  
                  // Remove from active timers
                  activeMuteTimers.delete(timerKey);
                } catch (error) {
                  logger.error(`Error in auto-unmute timer: ${error.message}`);
                }
              }, muteDuration);
              
              // Store the timer
              activeMuteTimers.set(timerKey, timer);
              
              // Notify user
              targetUser.send(`You have been muted in **${voiceChannel.name}** for ${durationText} through a vote (${yesCount} yes, ${noCount} no). Reason: ${reason}`)
                .catch(() => logger.warn(`Could not DM muted user ${targetUser.tag}`));
            } catch (muteError) {
              logger.error(`Error applying vote mute: ${muteError.message}`);
              voteEmbed.addFields({
                name: 'Error',
                value: 'There was an error applying the mute. Please try again or use /mute directly.'
              });
            }
          }
          
          // Update message with final results
          await voteMessage.edit({ 
            embeds: [voteEmbed],
            components: [disabledRow]
          }).catch(err => logger.error(`Error updating final vote: ${err.message}`));
          
        } catch (error) {
          logger.error(`Error handling vote end: ${error.message}`);
        }
      });
    } catch (error) {
      logger.error(`Error executing votemute command: ${error.message}`);
      try {
        if (interaction.deferred) {
          await interaction.followUp({ content: 'An error occurred with the vote command.', ephemeral: true });
        } else {
          await interaction.reply({ content: 'An error occurred with the vote command.', ephemeral: true });
        }
      } catch (_) {}
    }
  }
};