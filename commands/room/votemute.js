// Room votemute command - allows room members to vote on muting a user
const { SlashCommandBuilder, EmbedBuilder, Colors, ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger');
const RoomService = require('../../services/RoomService');
const PermissionService = require('../../services/PermissionService');
const AuditLogService = require('../../services/AuditLogService');
const { UserStateTrackerService } = require('../../services/UserStateTrackerService');
const { isInVoiceChannel } = require('../../utils/validators');

// Active vote sessions
const activeVotes = new Map();

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
        .setDescription('Vote duration in seconds (default: 60)')
        .setMinValue(15)
        .setMaxValue(300)
        .setRequired(false)
    ),
  
  // Command execution
  async execute(client, interaction) {
    try {
      // Get the target user
      const targetUser = interaction.options.getUser('user');
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const voteDuration = interaction.options.getInteger('duration') || 60;
      
      // Check if the command user is in a voice channel
      if (!isInVoiceChannel(interaction.member)) {
        return interaction.reply({ 
          content: 'You must be in a voice channel to use this command.',
          ephemeral: true 
        });
      }
      
      const voiceChannel = interaction.member.voice.channel;
      
      // Check if there's an active vote in this channel
      if (activeVotes.has(voiceChannel.id)) {
        return interaction.reply({
          content: 'There is already an active vote in this channel. Please wait for it to finish.',
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
      
      // Create the vote embed
      const voteEmbed = new EmbedBuilder()
        .setColor(Colors.Orange)
        .setTitle('📊 Vote to Mute User')
        .setDescription(`A vote has been started to mute ${targetUser} in this voice channel.`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Started by', value: `${interaction.user}` },
          { name: 'Duration', value: `This vote will last for ${voteDuration} seconds.` },
          { name: 'How to Vote', value: 'Click the buttons below to cast your vote!' },
          { name: 'Current Votes', value: '👍 Yes: 0\n👎 No: 0\n\nRequired: At least 50% of channel members must vote yes.' }
        )
        .setFooter({ text: `Vote ends in ${voteDuration} seconds` })
        .setTimestamp();
      
      // Add buttons for voting
      const voteRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('vote_yes')
            .setLabel('Yes, Mute Them')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('👍'),
          new ButtonBuilder()
            .setCustomId('vote_no')
            .setLabel('No, Don\'t Mute')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👎')
        );
      
      // Send the vote embed with components
      const voteMessage = await interaction.reply({ 
        embeds: [voteEmbed],
        components: [voteRow],
        fetchReply: true
      });
      
      // Initialize vote tracking
      const votes = {
        yes: new Set([interaction.user.id]), // Initiator automatically votes yes
        no: new Set(),
        channelId: voiceChannel.id,
        targetUserId: targetUser.id,
        initiatorId: interaction.user.id,
        reason: reason,
        isOwnerInitiated: isOwner
      };
      
      activeVotes.set(voiceChannel.id, votes);
      
      // Update the vote count in the embed
      await updateVoteEmbed(voteMessage, voteEmbed, votes, voiceChannel);
      
      // Create collector for the buttons
      const collector = voteMessage.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        time: voteDuration * 1000 
      });
      
      // Handle votes
      collector.on('collect', async (i) => {
        // Only accept votes from users in the same voice channel
        if (!i.member.voice.channelId || i.member.voice.channelId !== voiceChannel.id) {
          await i.reply({ 
            content: 'You must be in the voice channel to vote!', 
            ephemeral: true 
          });
          return;
        }
        
        // Don't let the target vote
        if (i.user.id === targetUser.id) {
          await i.reply({
            content: 'You cannot vote in a mute poll targeting yourself!',
            ephemeral: true
          });
          return;
        }
        
        // Record the vote
        if (i.customId === 'vote_yes') {
          votes.yes.add(i.user.id);
          votes.no.delete(i.user.id); // Remove from no if they changed their vote
        } else if (i.customId === 'vote_no') {
          votes.no.add(i.user.id);
          votes.yes.delete(i.user.id); // Remove from yes if they changed their vote
        }
        
        // Update the vote count in the embed
        await updateVoteEmbed(voteMessage, voteEmbed, votes, voiceChannel);
        
        await i.reply({ 
          content: `Your vote has been recorded!`, 
          ephemeral: true 
        });
      });
      
      // Handle vote end
      collector.on('end', async () => {
        // Remove from active votes
        activeVotes.delete(voiceChannel.id);
        
        // Count votes
        const yesCount = votes.yes.size;
        const noCount = votes.no.size;
        const totalVoters = voiceChannel.members.size - 1; // Exclude the target
        const votingThreshold = Math.ceil(totalVoters / 2); // At least 50% must vote yes
        
        // Log the vote details (only in server logs, not in chat)
        logger.info(`VoteMute results in ${voiceChannel.name} for ${targetUser.tag}:
  Yes Voters (${yesCount}): ${Array.from(votes.yes).join(', ')}
  No Voters (${noCount}): ${Array.from(votes.no).join(', ')}
  Threshold to pass: ${votingThreshold}`);
        
        // Update the embed one last time
        voteEmbed.setColor(Colors.Grey);
        voteEmbed.setTitle('📊 Vote to Mute User - Ended');
        voteEmbed.setFooter({ text: `Vote has ended` });
        
        // Remove the fields we'll update
        voteEmbed.spliceFields(3, 2); 
        
        // Determine vote result
        let result;
        if (yesCount >= votingThreshold) {
          result = 'PASSED';
          voteEmbed.addFields(
            { name: 'Final Votes', value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}` },
            { name: 'Result', value: `✅ The vote has passed! ${targetUser} has been muted.` }
          );
          
          // Apply the mute if vote passed
          try {
            // Track the muted state first
            await stateTracker.trackMutedUser({
              guildId: interaction.guild.id,
              userId: targetUser.id,
              roomId: voiceChannel.id,
              appliedBy: interaction.user.id, // The vote initiator is recorded
              reason: `Vote mute: ${reason}`
            });
            
            // Then apply the permission changes
            await permissionService.muteUser(voiceChannel, targetUser.id);
            
            // Also server mute if they're still in the channel
            if (targetMember && targetMember.voice.channelId === voiceChannel.id) {
              await targetMember.voice.setMute(true, `Vote mute: ${reason}`);
            }
            
            // Prepare detailed voting information for logging
            const voterDetails = {
              voteDetails: {
                total: yesCount + noCount,
                threshold: votingThreshold,
                votersYes: Array.from(votes.yes),
                votersNo: Array.from(votes.no)
              }
            };
            
            // Log the mute action with vote details
            await auditLogService.logUserMute(
              interaction.guild,
              { 
                id: interaction.user.id, 
                user: interaction.user,
                tag: interaction.user.tag
              }, // Recorded as the vote initiator
              targetMember || { id: targetUser.id, user: targetUser },
              {
                id: voiceChannel.id,
                name: voiceChannel.name,
                channelId: voiceChannel.id
              },
              `Vote mute (${yesCount} yes, ${noCount} no): ${reason}`,
              voterDetails
            );
            
            // Try to notify the user
            try {
              await targetUser.send(`You have been muted in **${voiceChannel.name}** through a vote (${yesCount} yes, ${noCount} no). Reason: ${reason}`);
            } catch (dmError) {
              logger.warn(`Could not DM muted user ${targetUser.tag}`);
            }
          } catch (muteError) {
            logger.error(`Error applying vote mute:`, muteError);
            voteEmbed.addFields({
              name: 'Error',
              value: 'There was an error applying the mute. Please try again or use the regular /mute command.'
            });
          }
        } else {
          result = 'FAILED';
          voteEmbed.addFields(
            { name: 'Final Votes', value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}` },
            { name: 'Result', value: `❌ The vote has failed. ${targetUser} will not be muted.` }
          );
        }
        
        // Update the message with the final result
        await voteMessage.edit({ 
          embeds: [voteEmbed],
          components: [] // Remove the buttons
        }).catch(err => logger.error('Error updating final vote message:', err));
        
        logger.info(`Vote mute for ${targetUser.tag} ${result} with ${yesCount} yes votes and ${noCount} no votes`);
      });
      
    } catch (error) {
      logger.error(`Error executing votemute command:`, error);
      await interaction.reply({ 
        content: 'An error occurred while creating the vote.', 
        ephemeral: true 
      });
    }
  }
};

// Helper function to update the vote embed
async function updateVoteEmbed(message, embed, votes, voiceChannel) {
  const yesCount = votes.yes.size;
  const noCount = votes.no.size;
  const totalVoters = voiceChannel.members.size - 1; // Exclude the target user
  const votingThreshold = Math.ceil(totalVoters / 2); // At least 50% must vote yes
  
  // Update the vote count field (index 4)
  embed.spliceFields(4, 1, {
    name: 'Current Votes',
    value: `👍 Yes: ${yesCount}\n👎 No: ${noCount}\n\nRequired: At least ${votingThreshold} yes votes to pass.`
  });
  
  // Update the message
  await message.edit({ embeds: [embed] }).catch(err => logger.error('Error updating vote embed:', err));
}