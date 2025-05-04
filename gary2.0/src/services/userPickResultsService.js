import { supabase } from '../supabaseClient';
import { userStatsService } from './userStatsService';

export const userPickResultsService = {
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
      
      // Get all game results
      const { data: gameResults, error: gameResultsError } = await supabase
        .from('game_results')
        .select('pick_id, result')
        .order('created_at', { ascending: false })
        .limit(50); // Only check recent results
      
      if (gameResultsError) throw gameResultsError;
      
      if (!gameResults || gameResults.length === 0) {
        console.log('No game results found to process');
        return results;
      }
      
      // Create a map of pick_id to result for faster lookup
      const resultsMap = {};
      gameResults.forEach(gr => {
        resultsMap[gr.pick_id] = gr.result;
      });
      
      // Get all user stats that have pending results
      const { data: userStats, error: userStatsError } = await supabase
        .from('user_stats')
        .select('id, recent_results');
      
      if (userStatsError) throw userStatsError;
      
      // Process each user's stats
      for (const stats of userStats) {
        results.processed++;
        
        try {
          const recentResults = stats.recent_results || [];
          let hasUpdates = false;
          
          // Check each pending result
          for (const result of recentResults) {
            // Only process pending results that have a matching game result
            if (result.result_pending && result.pick_id && resultsMap[result.pick_id]) {
              hasUpdates = true;
              
              // Update the user's stats with the result
              await userStatsService.updatePickResult(
                stats.id,
                result.pick_id,
                resultsMap[result.pick_id]
              );
              
              results.updated++;
            }
          }
        } catch (error) {
          console.error(`Error updating results for user ${stats.id}:`, error);
          results.errors++;
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error checking and updating results:', error);
      throw error;
    }
  },
  
  /**
   * Schedule regular updates of user pick results
   * @param {number} intervalMinutes - How often to check for updates (in minutes)
   */
  scheduleResultsUpdates(intervalMinutes = 30) {
    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Convert minutes to milliseconds
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Set up the interval
    this.updateInterval = setInterval(async () => {
      console.log('Running scheduled check for pick results...');
      try {
        const results = await this.checkAndUpdateResults();
        console.log('Results update complete:', results);
      } catch (error) {
        console.error('Error in scheduled results update:', error);
      }
    }, intervalMs);
    
    console.log(`Scheduled pick results updates every ${intervalMinutes} minutes`);
    
    // Run an initial check
    this.checkAndUpdateResults()
      .then(results => console.log('Initial results check complete:', results))
      .catch(error => console.error('Error in initial results check:', error));
  }
};
