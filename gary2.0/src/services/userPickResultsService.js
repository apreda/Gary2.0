import { supabase } from '../supabaseClient';
import { userStatsService } from './userStatsService';

export const userPickResultsService = {
  // Initialize the updateInterval property to null
  updateInterval: null,
  /**
   * Check and update user pick results
   * This should be run periodically to update user stats when pick results come in
   * @returns {Promise<Object>} Results of the update
   */
  async checkAndUpdateResults() {
    try {
      const results = {
        processed: 0,
        updated: 0,
        errors: 0
      };
      
      // Get all recent game results with their pick_id
      const { data: gameResults, error: gameResultsError } = await supabase
        .from('game_results')
        .select('id, pick_id, result, final_score, matchup')
        .order('created_at', { ascending: false })
        .limit(100); // Increased to check more recent results
      
      if (gameResultsError) throw gameResultsError;
      
      if (!gameResults || gameResults.length === 0) {
        console.log('No game results found to process');
        return results;
      }
      
      console.log(`Found ${gameResults.length} game results to process`);
      
      // Create a map of pick_id to result for faster lookup
      const resultsMap = {};
      gameResults.forEach(gr => {
        resultsMap[gr.pick_id] = gr.result;
      });
      
      // Get all user picks for these game results
      const pickIds = gameResults.map(gr => gr.pick_id);
      console.log(`Looking for user picks with these pick_ids: ${pickIds.slice(0, 5).join(', ')}${pickIds.length > 5 ? '...' : ''}`);
      
      const { data: userPicks, error: userPicksError } = await supabase
        .from('user_picks')
        .select('*')
        .in('pick_id', pickIds)
        .is('outcome', null); // Only get picks without an outcome yet
      
      if (userPicksError) {
        console.error('Error fetching user picks:', userPicksError);
        throw userPicksError;
      }
      
      console.log(`Found ${userPicks?.length || 0} user picks to update`);
      
      // Process user picks and update outcomes
      for (const userPick of (userPicks || [])) {
        results.processed++;
        
        try {
          const gameResult = resultsMap[userPick.pick_id];
          if (!gameResult) continue;
          
          // Determine if user won based on their decision and the game result
          // If user bet and game was won, or user faded and game was lost, user wins
          const userWon = 
            (userPick.decision === 'bet' && gameResult === 'won') || 
            (userPick.decision === 'fade' && gameResult === 'lost');
          
          const outcome = userWon ? 'win' : 'loss';
          
          // Update the user pick with the outcome
          const { error: updateError } = await supabase
            .from('user_picks')
            .update({ 
              outcome: outcome,
              updated_at: new Date().toISOString()
            })
            .eq('id', userPick.id);
          
          if (updateError) {
            console.error(`Error updating user pick ${userPick.id}:`, updateError);
            results.errors++;
            continue;
          }
          
          // Update user stats
          await updateUserStats(userPick.user_id, outcome, userPick.decision);
          
          results.updated++;
          console.log(`Updated user pick ${userPick.id} with outcome: ${outcome}`);
        } catch (error) {
          console.error(`Error processing user pick ${userPick.id}:`, error);
          results.errors++;
        }
      }
      
      // Also check user_stats for any pending results in the recent_results array
      try {
        const { data: userStats, error: userStatsError } = await supabase
          .from('user_stats')
          .select('id, recent_results');
        
        if (userStatsError) throw userStatsError;
        
        let additionalUpdates = 0;
        
        // Process each user's stats for legacy data
        for (const stats of (userStats || [])) {
          const recentResults = stats.recent_results || [];
          let updatedResults = false;
          
          // Check each pending result
          for (let i = 0; i < recentResults.length; i++) {
            const result = recentResults[i];
            // Only process pending results that have a matching game result
            if (result.result_pending && result.pick_id && resultsMap[result.pick_id]) {
              const gameResult = resultsMap[result.pick_id];
              
              // Determine if user won
              const userWon = 
                (result.decision === 'bet' && gameResult === 'won') || 
                (result.decision === 'fade' && gameResult === 'lost');
              
              // Update this result
              recentResults[i] = {
                ...result,
                result_pending: false,
                pick_result: gameResult,
                user_correct: userWon
              };
              
              updatedResults = true;
              additionalUpdates++;
            }
          }
          
          // If we updated any results, save back to user_stats
          if (updatedResults) {
            const { error: updateError } = await supabase
              .from('user_stats')
              .update({ recent_results: recentResults })
              .eq('id', stats.id);
              
            if (updateError) {
              console.error(`Error updating user stats for ${stats.id}:`, updateError);
              results.errors++;
            }
          }
        }
        
        if (additionalUpdates > 0) {
          console.log(`Updated ${additionalUpdates} results in user_stats recent_results arrays`);
          results.updated += additionalUpdates;
        }
      } catch (error) {
        console.error('Error processing user_stats recent_results:', error);
        results.errors++;
      }
      
      return results;
    } catch (error) {
      console.error('Error checking and updating results:', error);
      throw error;
    }
  },
  
  /**
   * Update a user's stats based on a pick outcome
   * @param {string} userId - The user's ID
   * @param {string} outcome - 'win' or 'loss'
   * @param {string} decision - 'bet' or 'fade'
   * @returns {Promise<Object>} The updated user stats
   * @private
   */
  async updateUserStats(userId, outcome, decision) {
    try {
      // Get current user stats
      const { data: stats, error } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        // If user stats don't exist, initialize them
        if (error.code === 'PGRST116') {
          return this.initializeUserStatsWithOutcome(userId, outcome, decision);
        }
        throw error;
      }
      
      // Calculate updates
      const updates = {};
      
      // Update win or loss count
      if (outcome === 'win') {
        updates.win_count = (stats.win_count || 0) + 1;
        updates.current_streak = Math.max(0, (stats.current_streak || 0)) + 1;
        updates.longest_streak = Math.max((stats.longest_streak || 0), updates.current_streak);
        updates.last_result = 'win';
      } else if (outcome === 'loss') {
        updates.loss_count = (stats.loss_count || 0) + 1;
        updates.current_streak = Math.min(0, (stats.current_streak || 0)) - 1;
        updates.last_result = 'loss';
      }
      
      // Update the user stats
      const { data: updatedStats, error: updateError } = await supabase
        .from('user_stats')
        .update(updates)
        .eq('id', userId)
        .select();
      
      if (updateError) throw updateError;
      return updatedStats[0];
    } catch (error) {
      console.error(`Error updating stats for user ${userId}:`, error);
      return null;
    }
  },
  
  /**
   * Initialize user stats with an initial outcome
   * @param {string} userId - The user's ID
   * @param {string} outcome - 'win' or 'loss'
   * @param {string} decision - 'bet' or 'fade'
   * @returns {Promise<Object>} The created user stats
   * @private
   */
  async initializeUserStatsWithOutcome(userId, outcome, decision) {
    try {
      // Set initial values based on the outcome
      const newStats = {
        id: userId,
        total_picks: 1,
        ride_count: decision === 'bet' ? 1 : 0,
        fade_count: decision === 'fade' ? 1 : 0,
        win_count: outcome === 'win' ? 1 : 0,
        loss_count: outcome === 'loss' ? 1 : 0,
        current_streak: outcome === 'win' ? 1 : -1,
        longest_streak: outcome === 'win' ? 1 : 0,
        recent_results: [],
        last_result: outcome
      };
      
      const { data, error } = await supabase
        .from('user_stats')
        .insert([newStats])
        .select();
      
      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error(`Error initializing stats for user ${userId}:`, error);
      return null;
    }
  },
  
  /**
   * Schedule regular updates of user pick results - DISABLED
   * @param {number} intervalMinutes - How often to check for updates (in minutes)
   */
  scheduleResultsUpdates(intervalMinutes = 30) {
    // Function disabled as requested by user
    // Results are manually processed via the admin interface
    
    console.log('Automatic results checking is disabled - use admin interface instead');
    
    // Clear any existing interval (just in case)
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
};
