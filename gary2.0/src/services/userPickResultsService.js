import { supabase } from '../supabaseClient.js';

export const userPickResultsService = {
  // processUserPickResults removed — dead code (zero callers; AdminResultsProcessor uses manualProcessResults)

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
  
  // getUserRecord removed — dead code (zero callers)

  /**
   * Manually trigger user pick results processing (for admin use)
   * @param {string} [filterDate] - Optional date to filter picks (YYYY-MM-DD format)
   * @returns {Promise<Object>} Results of the processing
   */
  async manualProcessResults(filterDate = null) {
    try {
      console.log('🎯 Starting manual user pick results processing...', filterDate ? `for date: ${filterDate}` : 'for all pending picks');
      
      const results = {
        processed: 0,
        updated: 0,
        errors: 0,
        details: [],
        filterDate: filterDate
      };
      
      // Step 1: Get user picks that don't have an outcome yet
      let userPicksQuery = supabase
        .from('user_picks')
        .select('*')
        .is('outcome', null);
      
      // Add date filter if provided
      if (filterDate) {
        const startDate = `${filterDate}T00:00:00`;
        const endDate = `${filterDate}T23:59:59`;
        userPicksQuery = userPicksQuery
          .gte('created_at', startDate)
          .lte('created_at', endDate);
      }
      
      const { data: pendingUserPicks, error: userPicksError } = await userPicksQuery;
      
      if (userPicksError) {
        throw new Error(`Error fetching user picks: ${userPicksError.message}`);
      }
      
      if (!pendingUserPicks || pendingUserPicks.length === 0) {
        console.log('📝 No pending user picks found' + (filterDate ? ` for date ${filterDate}` : ''));
        return {
          ...results,
          message: `No pending user picks found${filterDate ? ` for date ${filterDate}` : ''}`
        };
      }
      
      console.log(`📊 Found ${pendingUserPicks.length} pending user picks to process`);
      results.processed = pendingUserPicks.length;
      
      // Step 2: Instead of trying to match pick_ids directly (format mismatch),
      // get game results for the date range and match by other criteria
      console.log(`Found ${pendingUserPicks.length} pending user picks`);
      
      // Extract dates from user picks to query game results by date
      const userPickDates = new Set();
      pendingUserPicks.forEach(pick => {
        const createdDate = new Date(pick.created_at).toISOString().split('T')[0];
        userPickDates.add(createdDate);
      });
      
      console.log(`Looking for game results for dates: ${Array.from(userPickDates).join(', ')}`);
      
      // Get game results for all relevant dates
      const { data: gameResults, error: gameResultsError } = await supabase
        .from('game_results')
        .select('*')
        .in('game_date', Array.from(userPickDates))
        .not('result', 'is', null);
      
      if (gameResultsError) {
        console.error('Error fetching game results:', gameResultsError);
        throw gameResultsError;
      }
      
      if (!gameResults || gameResults.length === 0) {
        console.log('No game results found for pending user picks dates');
        return { ...results, message: 'No game results available yet for pending picks dates' };
      }
      
      console.log(`Found ${gameResults.length} game results to process`);
      
      // Step 3: Create a mapping strategy since pick_ids don't match format
      // For now, we'll use a simple approach: match by date and assume one main result per date
      // This is a temporary fix - ideally we'd have consistent pick_id formats
      const gameResultsByDate = {};
      gameResults.forEach(result => {
        const resultDate = result.game_date;
        if (!gameResultsByDate[resultDate]) {
          gameResultsByDate[resultDate] = [];
        }
        gameResultsByDate[resultDate].push(result);
      });
      
      // Step 4: Process each user pick and determine their outcome
      const userPickUpdates = [];
      const userStatsUpdates = {};
      
      for (const userPick of pendingUserPicks) {
        results.processed++;
        
        // Get the date for this user pick
        const pickDate = new Date(userPick.created_at).toISOString().split('T')[0];
        const dayResults = gameResultsByDate[pickDate];
        
        if (!dayResults || dayResults.length === 0) {
          console.log(`No game results found for user pick on date: ${pickDate}`);
          continue;
        }
        
        const garyResult = dayResults[0].result;
        
        // Extract sport/league info from user pick_id for better matching
        let matchedResult = null;
        if (userPick.pick_id.includes('MLB')) {
          matchedResult = dayResults.find(r => r.league === 'MLB');
        } else if (userPick.pick_id.includes('NBA')) {
          matchedResult = dayResults.find(r => r.league === 'NBA');
        } else if (userPick.pick_id.includes('NHL')) {
          matchedResult = dayResults.find(r => r.league === 'NHL');
        }
        
        const finalResult = matchedResult ? matchedResult.result : garyResult;
        
        console.log(`User pick: ${userPick.pick_id} (${userPick.decision}) matched to ${matchedResult ? matchedResult.league : 'first'} result: ${finalResult}`);
        
        // Calculate user outcome based on their decision and Gary's result
        let userOutcome;
        
        if (finalResult === 'push') {
          // If Gary's pick was a push, user gets a push regardless of bet/fade
          userOutcome = 'push';
        } else if (userPick.decision === 'bet') {
          // User bet WITH Gary
          userOutcome = finalResult === 'won' ? 'win' : 'loss';
        } else if (userPick.decision === 'fade') {
          // User bet AGAINST Gary (fade)
          userOutcome = finalResult === 'won' ? 'loss' : 'win';
        } else {
          console.error(`Unknown decision type: ${userPick.decision}`);
          results.errors++;
          continue;
        }
        
        console.log(`User ${userPick.user_id} ${userPick.decision} on pick ${userPick.pick_id}: Gary ${finalResult} → User ${userOutcome}`);
        
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
        if (userOutcome === 'win') {
          userStatsUpdates[userPick.user_id].wins++;
        } else if (userOutcome === 'loss') {
          userStatsUpdates[userPick.user_id].losses++;
        } else if (userOutcome === 'push') {
          userStatsUpdates[userPick.user_id].pushes++;
        }
        
        results.details.push({
          user_id: userPick.user_id,
          pick_id: userPick.pick_id,
          decision: userPick.decision,
          gary_result: finalResult,
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
      console.error('Error in manualProcessResults:', error);
      return {
        success: false,
        error: error.message,
        processed: 0,
        updated: 0,
        errors: 1
      };
    }
  }
};
