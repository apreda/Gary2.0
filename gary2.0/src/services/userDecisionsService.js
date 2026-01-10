/**
 * Service for handling user decisions (Bet/Fade) and tracking results
 */
import { supabase } from '../supabaseClient.js';

export const userDecisionsService = {
  /**
   * Record a user's decision for a pick
   * @param {string} userId - The user's ID
   * @param {string} pickId - The pick ID
   * @param {string} decision - 'bet' or 'fade'
   * @returns {Promise} - Promise that resolves when the decision is recorded
   */
  recordDecision: async (userId, pickId, decision) => {
    try {
      const { error } = await supabase
        .from('user_picks')
        .insert([
          {
            user_id: userId,
            pick_id: pickId,
            decision: decision.toLowerCase(),
            outcome: null // Will be set when results come in
          }
        ]);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error recording user decision:', error);
      throw error;
    }
  },

  /**
   * Update user's pick outcome based on game results
   * @param {string} pickId - The pick ID
   * @param {string} result - The game result
   * @returns {Promise} - Promise that resolves when outcomes are updated
   */
  updateOutcomes: async (pickId, result) => {
    try {
      // Get all user picks for this game
      const { data: userPicks, error: picksError } = await supabase
        .from('user_picks')
        .select('id, user_id, decision')
        .eq('pick_id', pickId);

      if (picksError) throw picksError;

      // Check if Gary's pick was correct
      const isGaryCorrect = await this.checkGaryPickCorrectness(pickId, result);

      // Update each user's outcome
      const updates = userPicks.map(pick => {
        const isUserCorrect = 
          (isGaryCorrect && pick.decision === 'bet') ||
          (!isGaryCorrect && pick.decision === 'fade');

        return {
          id: pick.id,
          outcome: isUserCorrect ? 'correct' : 'incorrect'
        };
      });

      // Update all outcomes at once
      const { error: updateError } = await supabase
        .from('user_picks')
        .update(updates)
        .in('id', updates.map(u => u.id));

      if (updateError) throw updateError;

      // Update user stats
      await Promise.all(updates.map(update => 
        this.updateUserStats(update.id, update.outcome === 'correct')
      ));

      return true;
    } catch (error) {
      console.error('Error updating outcomes:', error);
      throw error;
    }
  },

  /**
   * Check if Gary's pick was correct
   * @param {string} pickId - The pick ID
   * @param {string} result - The game result
   * @returns {Promise<boolean>} - Whether Gary's pick was correct
   */
  checkGaryPickCorrectness: async (pickId, result) => {
    try {
      // Get Gary's pick from daily_picks
      const { data: pick, error: pickError } = await supabase
        .from('daily_picks')
        .select('pick, spread, moneyline')
        .eq('id', pickId)
        .single();

      if (pickError) throw pickError;

      // Determine if Gary's pick was correct based on the result
      // This logic will depend on the type of bet (spread/moneyline)
      const isCorrect = await this.evaluatePickAgainstResult(pick, result);
      return isCorrect;
    } catch (error) {
      console.error('Error checking Gary pick correctness:', error);
      throw error;
    }
  },

  /**
   * Evaluate if Gary's pick was correct against the actual result
   * @param {Object} pick - Gary's pick data
   * @param {string} result - The game result
   * @returns {Promise<boolean>} - Whether the pick was correct
   */
  evaluatePickAgainstResult: async (pick, result) => {
    try {
      // Parse the result (this will depend on your result format)
      const [homeScore, awayScore] = result.split('-').map(Number);
      
      // Evaluate based on bet type
      if (pick.spread) {
        const spread = Number(pick.spread);
        const homeTeam = homeScore > awayScore;
        const covered = Math.abs(homeScore - awayScore) > Math.abs(spread);
        
        // If positive spread, home team must win by more than spread
        // If negative spread, away team must win or lose by less than spread
        return spread > 0 
          ? (homeTeam && covered) 
          : (!homeTeam || !covered);
      } else if (pick.moneyline) {
        // Moneyline bets are simpler - just check who won
        return (pick.pick === 'home' && homeScore > awayScore) ||
               (pick.pick === 'away' && awayScore > homeScore);
      }
      
      return false;
    } catch (error) {
      console.error('Error evaluating pick:', error);
      throw error;
    }
  },

  /**
   * Update user's stats based on their pick outcome
   * @param {string} userId - The user's ID
   * @param {boolean} isCorrect - Whether the user was correct
   * @returns {Promise} - Promise that resolves when stats are updated
   */
  updateUserStats: async (userId, isCorrect) => {
    try {
      // Get current stats
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('stats')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Initialize stats if they don't exist
      const stats = user.stats || {
        total_picks: 0,
        correct: 0,
        incorrect: 0,
        win_rate: 0
      };

      // Update stats
      stats.total_picks++;
      if (isCorrect) {
        stats.correct++;
      } else {
        stats.incorrect++;
      }
      stats.win_rate = (stats.correct / stats.total_picks * 100).toFixed(2);

      // Update user record
      const { error: updateError } = await supabase
        .from('users')
        .update({ stats })
        .eq('id', userId);

      if (updateError) throw updateError;

      return true;
    } catch (error) {
      console.error('Error updating user stats:', error);
      throw error;
    }
  },

  /**
   * Get a user's stats
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} - User's statistics
   */
  getUserStats: async (userId) => {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('stats')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return user.stats || {
        total_picks: 0,
        correct: 0,
        incorrect: 0,
        win_rate: 0
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }
};
