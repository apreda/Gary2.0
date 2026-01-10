import { supabase } from '../supabaseClient';

export const userStatsService = {
  /**
   * Get user stats from Supabase
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} The user's stats
   */
  async getUserStats(userId) {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
  },

  /**
   * Initialize user stats in Supabase for a new user
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} The created user stats
   */
  async initializeUserStats(userId) {
    try {
      // Check if user stats already exist
      const { data: existingStats } = await supabase
        .from('user_stats')
        .select('id')
        .eq('id', userId)
        .single();

      if (existingStats) {
        console.log('User stats already exist for user', userId);
        return existingStats;
      }

      // Initialize new user stats
      const newStats = {
        id: userId,
        total_picks: 0,
        ride_count: 0,
        fade_count: 0,
        win_count: 0,
        loss_count: 0,
        current_streak: 0,
        longest_streak: 0,
        recent_results: [],
        last_result: null
      };

      const { data, error } = await supabase
        .from('user_stats')
        .insert([newStats])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error initializing user stats:', error);
      return null;
    }
  },

  /**
   * Record a bet or fade decision by the user
   * @param {string} userId - The user's ID
   * @param {string} decision - 'bet' or 'fade'
   * @param {Object} pick - The pick object
   * @returns {Promise<Object>} The updated user stats
   */
  async recordDecision(userId, decision, pick) {
    try {
      // Make sure user stats exist
      let stats = await this.getUserStats(userId);
      
      if (!stats) {
        stats = await this.initializeUserStats(userId);
        if (!stats) throw new Error('Failed to initialize user stats');
      }

      // Update stats based on decision
      const updates = {
        total_picks: stats.total_picks + 1,
      };

      if (decision === 'bet') {
        updates.ride_count = stats.ride_count + 1;
      } else if (decision === 'fade') {
        updates.fade_count = stats.fade_count + 1;
      }

      // Store the decision in recent_results
      const recentResult = {
        pick_id: pick.id,
        matchup: pick.matchup,
        decision: decision,
        timestamp: new Date().toISOString(),
        result_pending: true // Will be updated when results come in
      };

      // Append to recent_results (limited to last 10)
      let recentResults = stats.recent_results || [];
      recentResults = [recentResult, ...recentResults].slice(0, 10);
      updates.recent_results = recentResults;

      // Update user stats
      const { data, error } = await supabase
        .from('user_stats')
        .update(updates)
        .eq('id', userId)
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error recording user decision:', error);
      return null;
    }
  },

  /**
   * Update user stats when a pick result comes in
   * @param {string} userId - The user's ID
   * @param {string} pickId - The pick ID
   * @param {string} pickResult - 'win', 'loss', or 'push'
   * @returns {Promise<Object>} The updated user stats
   */
  async updatePickResult(userId, pickId, pickResult) {
    try {
      // Get current user stats
      const stats = await this.getUserStats(userId);
      if (!stats) throw new Error('User stats not found');

      // Find the pick in recent_results
      const recentResults = stats.recent_results || [];
      const pickIndex = recentResults.findIndex(r => r.pick_id === pickId);
      
      if (pickIndex === -1) return stats; // Pick not found in recent results

      // Determine if user was right based on their decision and the pick result
      const userDecision = recentResults[pickIndex].decision;
      const isUserCorrect = 
        (userDecision === 'bet' && pickResult === 'win') || 
        (userDecision === 'fade' && pickResult === 'loss');

      // Update recent_results entry
      recentResults[pickIndex] = {
        ...recentResults[pickIndex],
        result_pending: false,
        pick_result: pickResult,
        user_correct: isUserCorrect
      };

      // Calculate new stats
      const updates = {
        recent_results: recentResults,
        last_result: isUserCorrect ? 'win' : 'loss'
      };

      // Update win/loss counts
      if (isUserCorrect) {
        updates.win_count = stats.win_count + 1;
        updates.current_streak = Math.max(0, stats.current_streak) + 1;
        updates.longest_streak = Math.max(stats.longest_streak, updates.current_streak);
      } else {
        updates.loss_count = stats.loss_count + 1;
        updates.current_streak = Math.min(0, stats.current_streak) - 1;
      }

      // Update user stats
      const { data, error } = await supabase
        .from('user_stats')
        .update(updates)
        .eq('id', userId)
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error updating pick result:', error);
      return null;
    }
  },

  /**
   * Get leaderboard data
   * @param {number} limit - Maximum number of users to return
   * @returns {Promise<Array>} The leaderboard data
   */
  async getLeaderboard(limit = 10) {
    try {
      const { data, error } = await supabase
        .from('user_stats')
        .select('id, win_count, loss_count, current_streak, longest_streak')
        .order('win_count', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
};
