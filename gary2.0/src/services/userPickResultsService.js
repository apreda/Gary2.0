import { supabase } from '../supabaseClient';

export const userPickResultsService = {
  /**
   * Process user pick results based on Gary's game results
   * This function should be called manually or via a trigger when game results are updated
   * @returns {Promise<Object>} Results of the processing
   */
  async processUserPickResults() {
    try {
      console.log('🎯 Starting user pick results processing...');
      
      const results = {
        processed: 0,
        updated: 0,
        errors: 0,
        details: []
      };
      
      // Step 1: Get all user picks that don't have an outcome yet
      const { data: pendingUserPicks, error: userPicksError } = await supabase
        .from('user_picks')
        .select('*')
        .is('outcome', null);
      
      if (userPicksError) {
        console.error('Error fetching pending user picks:', userPicksError);
        throw userPicksError;
      }
      
      if (!pendingUserPicks || pendingUserPicks.length === 0) {
        console.log('No pending user picks found');
        return { ...results, message: 'No pending user picks to process' };
      }
      
      console.log(`Found ${pendingUserPicks.length} pending user picks`);
      
      // Step 2: Get all game results for the pick_ids that users have bet on
      const pickIds = [...new Set(pendingUserPicks.map(pick => pick.pick_id))];
      console.log(`Looking for game results for pick IDs: ${pickIds.slice(0, 5).join(', ')}${pickIds.length > 5 ? '...' : ''}`);
      
      const { data: gameResults, error: gameResultsError } = await supabase
        .from('game_results')
        .select('*')
        .in('pick_id', pickIds)
        .not('result', 'is', null);
      
      if (gameResultsError) {
        console.error('Error fetching game results:', gameResultsError);
        throw gameResultsError;
      }
      
      if (!gameResults || gameResults.length === 0) {
        console.log('No game results found for pending user picks');
        return { ...results, message: 'No game results available yet for pending picks' };
      }
      
      console.log(`Found ${gameResults.length} game results to process`);
      
      // Step 3: Create a map of pick_id to Gary's result for quick lookup
      const gameResultsMap = {};
      gameResults.forEach(result => {
        gameResultsMap[result.pick_id] = result.result; // 'won', 'lost', or 'push'
      });
      
      // Step 4: Process each user pick and determine their outcome
      const userPickUpdates = [];
      const userStatsUpdates = {};
      
      for (const userPick of pendingUserPicks) {
        results.processed++;
        
        const garyResult = gameResultsMap[userPick.pick_id];
        
        if (!garyResult) {
          console.log(`No game result yet for pick_id: ${userPick.pick_id}`);
          continue;
        }
        
        // Calculate user outcome based on their decision and Gary's result
        let userOutcome;
        
        if (garyResult === 'push') {
          // If Gary's pick was a push, user gets a push regardless of bet/fade
          userOutcome = 'push';
        } else if (userPick.decision === 'bet') {
          // User bet WITH Gary
          userOutcome = garyResult === 'won' ? 'won' : 'lost';
        } else if (userPick.decision === 'fade') {
          // User bet AGAINST Gary (fade)
          userOutcome = garyResult === 'won' ? 'lost' : 'won';
        } else {
          console.error(`Unknown decision type: ${userPick.decision}`);
          results.errors++;
          continue;
        }
        
        console.log(`User ${userPick.user_id} ${userPick.decision} on pick ${userPick.pick_id}: Gary ${garyResult} → User ${userOutcome}`);
        
        // Prepare user_picks update
        userPickUpdates.push({
          id: userPick.id,
          outcome: userOutcome
        });
        
        // Prepare user_stats updates (aggregate by user_id)
        if (!userStatsUpdates[userPick.user_id]) {
          userStatsUpdates[userPick.user_id] = {
            user_id: userPick.user_id,
            wins: 0,
            losses: 0,
            pushes: 0,
            total_picks: 0
          };
        }
        
        userStatsUpdates[userPick.user_id].total_picks++;
        if (userOutcome === 'won') {
          userStatsUpdates[userPick.user_id].wins++;
        } else if (userOutcome === 'lost') {
          userStatsUpdates[userPick.user_id].losses++;
        } else if (userOutcome === 'push') {
          userStatsUpdates[userPick.user_id].pushes++;
        }
        
        results.details.push({
          user_id: userPick.user_id,
          pick_id: userPick.pick_id,
          decision: userPick.decision,
          gary_result: garyResult,
          user_outcome: userOutcome
        });
      }
      
      // Step 5: Update user_picks with outcomes
      if (userPickUpdates.length > 0) {
        console.log(`Updating ${userPickUpdates.length} user picks with outcomes...`);
        
        for (const update of userPickUpdates) {
          const { error: updateError } = await supabase
            .from('user_picks')
            .update({ outcome: update.outcome })
            .eq('id', update.id);
          
          if (updateError) {
            console.error(`Error updating user pick ${update.id}:`, updateError);
            results.errors++;
          } else {
            results.updated++;
          }
        }
      }
      
      // Step 6: Update user_stats
      for (const [userId, stats] of Object.entries(userStatsUpdates)) {
        try {
          await this.updateUserStats(userId, stats);
        } catch (error) {
          console.error(`Error updating stats for user ${userId}:`, error);
          results.errors++;
        }
      }
      
      console.log(`✅ Processing complete: ${results.updated} picks updated, ${results.errors} errors`);
      
      return {
        ...results,
        message: `Successfully processed ${results.updated} user picks`
      };
      
    } catch (error) {
      console.error('Error in processUserPickResults:', error);
      return {
        success: false,
        error: error.message,
        processed: 0,
        updated: 0,
        errors: 1
      };
    }
  },
  
  /**
   * Update user stats based on new results
   * @param {string} userId - The user's ID
   * @param {Object} stats - Stats object with wins, losses, pushes, total_picks
   */
  async updateUserStats(userId, stats) {
    try {
      // First, get current user stats
      const { data: currentStats, error: fetchError } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw fetchError;
      }
      
      let updatedStats;
      
      if (currentStats) {
        // Update existing stats
        updatedStats = {
          total_picks: (currentStats.total_picks || 0) + stats.total_picks,
          win_count: (currentStats.win_count || 0) + stats.wins,
          loss_count: (currentStats.loss_count || 0) + stats.losses,
          push_count: (currentStats.push_count || 0) + stats.pushes,
          updated_at: new Date().toISOString()
        };
        
        // Calculate new streak
        if (stats.wins > 0 && stats.losses === 0) {
          // User had wins, extend or start win streak
          updatedStats.current_streak = currentStats.current_streak > 0 
            ? currentStats.current_streak + stats.wins 
            : stats.wins;
        } else if (stats.losses > 0 && stats.wins === 0) {
          // User had losses, extend or start loss streak
          updatedStats.current_streak = currentStats.current_streak < 0 
            ? currentStats.current_streak - stats.losses 
            : -stats.losses;
        } else if (stats.wins > 0 && stats.losses > 0) {
          // Mixed results, reset streak to the last result
          updatedStats.current_streak = stats.wins > stats.losses ? 1 : -1;
        }
        // If only pushes, keep current streak
        
        const { error: updateError } = await supabase
          .from('user_stats')
          .update(updatedStats)
          .eq('id', userId);
        
        if (updateError) throw updateError;
        
      } else {
        // Create new user stats
        updatedStats = {
          id: userId,
          total_picks: stats.total_picks,
          win_count: stats.wins,
          loss_count: stats.losses,
          push_count: stats.pushes,
          ride_count: 0, // Will be updated separately when we track bet vs fade
          fade_count: 0,
          current_streak: stats.wins > 0 ? stats.wins : (stats.losses > 0 ? -stats.losses : 0),
          longest_streak: stats.wins > 0 ? stats.wins : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { error: insertError } = await supabase
          .from('user_stats')
          .insert([updatedStats]);
        
        if (insertError) throw insertError;
      }
      
      console.log(`Updated stats for user ${userId}:`, updatedStats);
      
    } catch (error) {
      console.error(`Error updating user stats for ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Get user's current record and stats
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} User's stats and record
   */
  async getUserRecord(userId) {
    try {
      const { data: stats, error } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (!stats) {
        return {
          record: '0-0-0',
          win_rate: 0,
          total_picks: 0,
          current_streak: 0
        };
      }
      
      const wins = stats.win_count || 0;
      const losses = stats.loss_count || 0;
      const pushes = stats.push_count || 0;
      const total = wins + losses;
      
      return {
        record: `${wins}-${losses}-${pushes}`,
        win_rate: total > 0 ? ((wins / total) * 100).toFixed(1) : 0,
        total_picks: stats.total_picks || 0,
        current_streak: stats.current_streak || 0,
        longest_streak: stats.longest_streak || 0,
        ride_count: stats.ride_count || 0,
        fade_count: stats.fade_count || 0
      };
      
    } catch (error) {
      console.error('Error getting user record:', error);
      return {
        record: '0-0-0',
        win_rate: 0,
        total_picks: 0,
        current_streak: 0
      };
    }
  },
  
  /**
   * Manual trigger to process results - can be called from admin interface
   * @returns {Promise<Object>} Processing results
   */
  async manualProcessResults() {
    console.log('🔄 Manual processing of user pick results triggered');
    return await this.processUserPickResults();
  }
};
