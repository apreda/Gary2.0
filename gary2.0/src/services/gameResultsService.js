import { supabase } from '../supabaseClient';
import { oddsService } from './oddsService';
import { userDecisionsService } from './userDecisionsService';

/**
 * Service for handling game results and user decisions
 */
const gameResultsService = {
  /**
   * Insert a new game result
   * @param {Object} result - Game result data
   * @returns {Promise<Object>} - Inserted game result
   */
  insertGameResult: async (result) => {
    try {
      const { data, error } = await supabase
        .from('game_results')
        .insert({
          pick_id: result.pick_id,
          game_date: result.game_date,
          league: result.league,
          result: result.result,
          final_score: result.final_score
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error inserting game result:', error);
      return { success: false, error };
    }
  },

  /**
   * Get all game results
   * @param {Object} filters - Optional filters (date range, league, etc)
   * @returns {Promise<Array>} - List of game results
   */
  getGameResults: async (filters = {}) => {
    try {
      let query = supabase
        .from('game_results')
        .select('*');

      // Apply filters
      if (filters.startDate) {
        query = query.gte('game_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('game_date', filters.endDate);
      }
      if (filters.league) {
        query = query.eq('league', filters.league);
      }
      if (filters.result) {
        query = query.eq('result', filters.result);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching game results:', error);
      return { success: false, error };
    }
  },

  /**
   * Get game results summary (win/loss record, etc)
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} - Summary statistics
   */
  getResultsSummary: async (filters = {}) => {
    try {
      const { data: results, error } = await gameResultsService.getGameResults(filters);
      
      if (error) throw error;

      const summary = {
        total: results.length,
        wins: results.filter(r => r.result === 'won').length,
        losses: results.filter(r => r.result === 'lost').length,
        pushes: results.filter(r => r.result === 'push').length,
        pending: results.filter(r => !r.result).length
      };

      // Calculate win rate
      const settledBets = summary.total - summary.pending - summary.pushes;
      summary.winRate = settledBets > 0 ? 
        Math.round((summary.wins / settledBets) * 100) : 0;

      return { success: true, data: summary };
    } catch (error) {
      console.error('Error getting results summary:', error);
      return { success: false, error };
    }
  },

  /**
   * Update results for completed games and evaluate user decisions
   * @returns {Promise<Object>} - Results of the update operation
   */
  updateGameResults: async () => {
    try {
      // Get all pending picks
      const { data: pendingPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('id, sport, home_team, away_team, pick, spread, moneyline')
        .is('result', null);

      if (picksError) throw picksError;

      // Process each pending pick
      for (const pick of pendingPicks) {
        try {
          // Get game result from API
          const result = await gameResultsService.getGameResultFromOddsAPI(pick);
          
          if (result.success) {
            // Update game results table
            await gameResultsService.insertGameResult({
              pick_id: pick.id,
              game_date: new Date(),
              league: pick.sport,
              result: result.data.result,
              final_score: result.data.final_score
            });

            // Update daily_picks with result
            const { error: updateError } = await supabase
              .from('daily_picks')
              .update({ result: result.data.result })
              .eq('id', pick.id);

            if (updateError) throw updateError;

            // Update user decisions
            await userDecisionsService.updateOutcomes(pick.id, result.data.final_score);
          }
        } catch (error) {
          console.error(`Error processing result for pick ${pick.id}:`, error);
        }
      }

      return { success: true, message: 'Game results updated successfully' };
    } catch (error) {
      console.error('Error updating game results:', error);
      return { success: false, error };
    }
  },

  /**
   * Get user's decision history for a specific game
   * @param {string} pickId - The pick ID
   * @returns {Promise<Array>} - List of user decisions for this game
   */
  getUserDecisionsForGame: async (pickId) => {
    try {
      const { data, error } = await supabase
        .from('user_picks')
        .select('user_id, decision, outcome')
        .eq('pick_id', pickId);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error getting user decisions:', error);
      return { success: false, error };
    }
  },

  /**
   * Get user's overall performance statistics
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} - User's performance statistics
   */
  getUserPerformance: async (userId) => {
    try {
      // Get user's stats
      const { data: stats } = await userDecisionsService.getUserStats(userId);

      // Get user's recent decisions
      const { data: recentDecisions, error: decisionsError } = await supabase
        .from('user_picks')
        .select('created_at, decision, outcome')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (decisionsError) throw decisionsError;

      return {
        success: true,
        data: {
          stats,
          recentDecisions
        }
      };
    } catch (error) {
      console.error('Error getting user performance:', error);
      return { success: false, error };
    }
  },

  /**
   * Get leaderboard data for all users
   * @returns {Promise<Array>} - List of users sorted by win rate
   */
  getLeaderboard: async () => {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, stats')
        .order('stats->win_rate', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        data: users.map(user => ({
          id: user.id,
          email: user.email,
          total_picks: user.stats?.total_picks || 0,
          correct: user.stats?.correct || 0,
          incorrect: user.stats?.incorrect || 0,
          win_rate: user.stats?.win_rate || 0
        }))
      };
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return { success: false, error };
    }
  },

  /**
   * Get completed game results from The Odds API
   * @param {Object} pick - The pick to check results for
   * @returns {Promise<Object>} - Game result data
   */
  getGameResultFromOddsAPI: async (pick) => {
    try {
      // Try to get game result from Odds API first
      try {
        // Get odds data for this game
        const { data: oddsData, error: oddsError } = await oddsService.getUpcomingGames(pick.sport);
        
        if (!oddsError) {
          // Find the game in the odds data
          const game = oddsData.find(game => 
            game.home_team === pick.home_team && 
            game.away_team === pick.away_team
          );

          if (game && game.scores) {
            // Get the final score from the odds data
            const finalScore = `${game.scores.home}-${game.scores.away}`;

            // Evaluate the pick against the final score
            const evaluation = await userDecisionsService.evaluatePickAgainstResult(
              pick, 
              { home_score: game.scores.home, away_score: game.scores.away }
            );

            return {
              success: true,
              data: {
                result: evaluation.won ? 'won' : 'lost',
                final_score: finalScore
              }
            };
          }
        }
      } catch (oddsError) {
        console.warn('Error getting game result from Odds API, falling back to Perplexity:', oddsError);
      }
      
      // If Odds API fails or doesn't have the data, try Perplexity API
      try {
        const { perplexityService } = await import('./perplexityService.js');
        
        // Yesterday's date for checking results
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        // Get result from Perplexity
        const perplexityResult = await perplexityService.getScoresFromPerplexity(
          pick.home_team,
          pick.away_team,
          pick.sport,
          dateStr
        );
        
        if (perplexityResult.success && perplexityResult.scores) {
          const scores = perplexityResult.scores;
          const finalScore = `${scores.away_score}-${scores.home_score}`;
          
          // Determine if bet won or lost
          const betEvaluation = gameResultsService.evaluateBetResult(pick, {
            scores: {
              home_score: scores.home_score,
              away_score: scores.away_score
            }
          });
          
          return {
            success: true,
            data: {
              result: betEvaluation.won ? 'won' : 'lost',
              final_score: finalScore
            }
          };
        }
      } catch (perplexityError) {
        console.error('Error getting game result from Perplexity:', perplexityError);
      }
      
      return { success: false, error: 'Could not retrieve game results from any sources' };
    } catch (error) {
      console.error('Error in getGameResultFromOddsAPI:', error);
      return { success: false, error: error.message || error };
    }
  },

  /**
   * Evaluate if a bet was successful based on game result
   * @param {Object} pick - The pick to evaluate
   * @param {Object} gameResult - The game result data
   * @returns {Object} - Result of bet evaluation
   */
  evaluateBetResult: (pick, gameResult) => {
    try {
      if (!gameResult || !gameResult.scores) {
        return { won: false, details: 'Invalid game result data' };
      }

      const { home_score, away_score } = gameResult.scores;
      const isHomeWin = home_score > away_score;
      const isAwayWin = away_score > home_score;
      const isPush = home_score === away_score;

      // Check if pick is for home or away team
      const isHomePick = pick.pick === pick.home_team;
      const isAwayPick = pick.pick === pick.away_team;

      // Determine if the bet won
      let won = false;
      let details = '';

      if (isPush) {
        // For pushes (e.g., in spreads where the score difference equals the spread)
        return { won: false, push: true, details: 'Push - No action' };
      } else if (pick.bet_type === 'moneyline') {
        // Moneyline bet - just pick the winner
        won = (isHomePick && isHomeWin) || (isAwayPick && isAwayWin);
        details = won ? 'Moneyline winner' : 'Moneyline loser';
      } else if (pick.bet_type === 'spread') {
        // Spread bet - account for the spread
        const spread = parseFloat(pick.spread);
        if (isHomePick) {
          const homeScoreWithSpread = home_score + spread;
          won = homeScoreWithSpread > away_score;
          details = `Home team ${spread >= 0 ? '+' : ''}${spread} (${homeScoreWithSpread}-${away_score})`;
        } else if (isAwayPick) {
          const awayScoreWithSpread = away_score + spread;
          won = awayScoreWithSpread > home_score;
          details = `Away team ${spread >= 0 ? '+' : ''}${spread} (${awayScoreWithSpread}-${home_score})`;
        }
      }

      return { won, details };
    } catch (error) {
      console.error('Error evaluating bet result:', error);
      return { won: false, details: 'Error evaluating bet result' };
    }
  },

  /**
   * Schedule automatic updates for game results
   * This would typically be handled by a cron job in a production environment
   * @returns {Object} - Status of the scheduled updates
   */
  scheduleResultsUpdates: () => {
    // Check for completed games every 6 hours
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    
    console.log('Scheduling automatic game results updates');
    
    // First update immediately
    gameResultsService.updateGameResults();
    
    // Then schedule regular updates
    const intervalId = setInterval(async () => {
      console.log('Running scheduled game results update');
      await gameResultsService.updateGameResults();
    }, CHECK_INTERVAL);

    return { success: true, intervalId };
  }
};

export { gameResultsService };
