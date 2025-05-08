import { supabase } from '../supabaseClient';

/**
 * Service to handle checking bet results against game outcomes
 */
export const BetResultsService = {
  /**
   * Get the outcome of a pick based on the game result
   * @param {string} gameId - The ID of the game
   * @returns {Promise<string|null>} - Returns 'win', 'loss', or null if not found
   */
  async getPickResult(gameId) {
    try {
      const { data, error } = await supabase
        .from('game_results')
        .select('*')
        .eq('id', gameId)
        .single();

      if (error) throw error;
      if (!data) return null;
      
      // Return the win/loss result based on the database structure
      return data.result?.toLowerCase() === 'win' ? 'win' : 'loss';
    } catch (error) {
      console.error('Error fetching pick result:', error);
      return null;
    }
  },

  /**
   * Get all user decisions that haven't been processed yet
   * @param {string} userId - The user's ID
   * @returns {Promise<Array>} - User decisions that need processing
   */
  async getPendingUserDecisions(userId) {
    try {
      const { data, error } = await supabase
        .from('user_decisions')
        .select('*')
        .eq('user_id', userId)
        .eq('processed', false);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending user decisions:', error);
      return [];
    }
  },

  /**
   * Process user decisions against game results
   * @param {string} userId - The user's ID
   * @returns {Promise<{wins: number, losses: number}>} - Count of new wins and losses
   */
  async processUserDecisions(userId) {
    try {
      // Get pending decisions
      const pendingDecisions = await this.getPendingUserDecisions(userId);
      
      let wins = 0;
      let losses = 0;

      // Process each decision
      for (const decision of pendingDecisions) {
        const { game_id, decision_type } = decision;
        
        // Get the game result
        const gameResult = await this.getPickResult(game_id);
        if (!gameResult) continue; // Skip if result not available yet
        
        // Determine if user decision was correct
        let isWin = false;
        
        // If user rode with Gary (bet), they win if Gary wins
        // If user faded Gary, they win if Gary loses
        if (decision_type === 'ride' && gameResult === 'win') {
          isWin = true;
        } else if (decision_type === 'fade' && gameResult === 'loss') {
          isWin = true;
        }
        
        // Update user stats
        await this.updateUserStats(userId, isWin);
        
        // Mark decision as processed
        await supabase
          .from('user_decisions')
          .update({ processed: true, result: isWin ? 'win' : 'loss' })
          .eq('id', decision.id);
        
        // Increment counters
        if (isWin) {
          wins++;
        } else {
          losses++;
        }
      }
      
      return { wins, losses };
    } catch (error) {
      console.error('Error processing user decisions:', error);
      return { wins: 0, losses: 0 };
    }
  },

  /**
   * Update user stats with a new result
   * @param {string} userId - The user's ID
   * @param {boolean} isWin - Whether the result is a win
   */
  async updateUserStats(userId, isWin) {
    try {
      // Get current stats
      const { data: currentStats, error: fetchError } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;

      // If no stats exist yet, create a default record
      if (!currentStats) {
        await this.createInitialUserStats(userId, isWin);
        return;
      }

      // Calculate new values
      const updates = { ...currentStats };
      
      // Update win/loss and streak
      if (isWin) {
        updates.win_count = (currentStats.win_count || 0) + 1;
        // If last result was also a win, increment streak, else start new streak
        if (currentStats.last_result === 'win') {
          updates.current_streak = (currentStats.current_streak || 0) + 1;
        } else {
          updates.current_streak = 1;
        }
        updates.longest_streak = Math.max(
          updates.current_streak,
          currentStats.longest_streak || 0
        );
        updates.last_result = 'win';
      } else {
        updates.loss_count = (currentStats.loss_count || 0) + 1;
        // If last result was also a loss, decrement streak, else start new losing streak
        if (currentStats.last_result === 'loss') {
          updates.current_streak = (currentStats.current_streak || 0) - 1;
        } else {
          updates.current_streak = -1;
        }
        updates.last_result = 'loss';
      }

      // Update recent results (keep last 6)
      updates.recent_results = [
        isWin ? 'W' : 'L',
        ...(currentStats.recent_results || [])
      ].slice(0, 6);

      // Update timestamp
      updates.updated_at = new Date().toISOString();

      // Update in Supabase
      const { error: updateError } = await supabase
        .from('user_stats')
        .update(updates)
        .eq('id', userId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating user stats:', error);
    }
  },

  /**
   * Create initial user stats record
   * @param {string} userId - The user's ID
   * @param {boolean} isWin - Whether the first result is a win
   */
  async createInitialUserStats(userId, isWin) {
    const newStats = {
      id: userId,
      total_picks: 1,
      ride_count: 0,
      fade_count: 0,
      win_count: isWin ? 1 : 0,
      loss_count: isWin ? 0 : 1,
      current_streak: isWin ? 1 : -1,
      longest_streak: isWin ? 1 : 0,
      recent_results: [isWin ? 'W' : 'L'],
      last_result: isWin ? 'win' : 'loss',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('user_stats')
      .insert([newStats]);
  },

  /**
   * Record a new user decision
   * @param {Object} decision - Decision details
   * @param {string} decision.userId - User's ID
   * @param {string} decision.gameId - Game's ID
   * @param {string} decision.decisionType - 'ride' or 'fade'
   */
  async recordUserDecision(decision) {
    try {
      const { userId, gameId, decisionType } = decision;
      
      // First check if the user already made a decision for this game
      const { data: existingDecision } = await supabase
        .from('user_decisions')
        .select('*')
        .eq('user_id', userId)
        .eq('game_id', gameId)
        .single();
      
      // If the user already made a decision, update it
      if (existingDecision) {
        await supabase
          .from('user_decisions')
          .update({ 
            decision_type: decisionType,
            processed: false, // Reset processed flag to ensure it gets processed again
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDecision.id);
      } else {
        // Otherwise, insert a new decision
        await supabase
          .from('user_decisions')
          .insert([{
            user_id: userId,
            game_id: gameId,
            decision_type: decisionType,
            processed: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
      }
      
      // Update the appropriate count in user_stats
      const countField = `${decisionType}_count`;
      
      // Get current stats
      const { data: currentStats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (currentStats) {
        // If stats exist, update the count
        await supabase
          .from('user_stats')
          .update({ 
            [countField]: (currentStats[countField] || 0) + 1,
            total_picks: (currentStats.total_picks || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error recording user decision:', error);
      return false;
    }
  }
};
