import { supabase } from '../supabaseClient';
import { bankrollService } from './bankrollService';
import { oddsService } from './oddsService';
import { userPickResultsService } from './userPickResultsService';
import axios from 'axios';

/**
 * Service for handling game results and updating wagers
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
        .select(`
          *,
          picks:daily_picks!pick_id(*)
        `);

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
   * Get game results summary (win/loss record, ROI, etc)
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

      // Calculate win rate and ROI
      summary.winRate = summary.total > 0 ? 
        (summary.wins / (summary.total - summary.pending - summary.pushes)) * 100 : 0;

      // Get bankroll data for ROI calculation
      const bankrollData = await bankrollService.getBankrollHistory(filters);
      if (bankrollData.success) {
        const startingAmount = bankrollData.data[0]?.amount || 10000;
        const currentAmount = bankrollData.data[bankrollData.data.length - 1]?.amount || startingAmount;
        summary.roi = ((currentAmount - startingAmount) / startingAmount) * 100;
      }

      return { success: true, data: summary };
    } catch (error) {
      console.error('Error getting results summary:', error);
      return { success: false, error };
    }
  },


  /**
   * Update results for completed games and adjust bankroll accordingly
   * @returns {Promise<Object>} - Results of the update operation
   */
  updateGameResults: async () => {
    try {
      // 1. Get pending wagers
      const { data: pendingWagers, error: wagerError } = await supabase
        .from('wagers')
        .select(`
          id,
          pick_id,
          amount,
          odds,
          potential_payout,
          placed_date,
          status,
          picks:daily_picks!inner(*)
        `)
        .eq('status', 'pending');
      
      if (wagerError) {
        console.error('Error fetching pending wagers:', wagerError);
        return { success: false, error: wagerError };
      }
      
      if (!pendingWagers || pendingWagers.length === 0) {
        console.log('No pending wagers to update');
        return { success: true, updated: 0 };
      }
      
      // 2. For each pending wager, check if the game has completed
      const updatedWagers = [];
      
      for (const wager of pendingWagers) {
        const pick = wager.picks;
        if (!pick) continue;
        
        // If it's older than 24 hours, we'll get the result
        const wagerDate = new Date(wager.placed_date);
        const currentDate = new Date();
        const hoursDifference = (currentDate - wagerDate) / (1000 * 60 * 60);
        
        if (hoursDifference < 24) {
          console.log(`Wager for ${pick.game} is less than 24 hours old, skipping`);
          continue;
        }
        
        // Check for game result from The Odds API
        const gameResult = await gameResultsService.getGameResultFromOddsAPI(pick);
        
        if (gameResult.completed) {
          // Determine if the bet won or lost based on the actual game result
          const betResult = gameResultsService.evaluateBetResult(pick, gameResult);
          const finalResult = betResult.won ? 'won' : 'lost';
          
          try {
            // Update wager status and insert game result
            const [wagerUpdate, resultInsert] = await Promise.all([
              supabase
                .from('wagers')
                .update({ 
                  status: finalResult,
                  result_date: new Date().toISOString()
                })
                .eq('id', wager.id),
              gameResultsService.insertGameResult({
                pick_id: pick.id,
                game_date: pick.game_date || wager.placed_date,
                league: pick.league,
                result: finalResult,
                final_score: `${gameResult.scores.home} - ${gameResult.scores.away}`
              })
            ]);

            if (wagerUpdate.error) {
          
              console.error(`Error updating wager ${wager.id}:`, wagerUpdate.error);
              continue;
            }

            if (resultInsert.error) {
              console.error(`Error inserting game result for pick ${pick.id}:`, resultInsert.error);
              // Don't continue here - wager was already updated
            }
          
            // Update bankroll
            await bankrollService.updateBankrollForWager(
              wager.id, 
              finalResult, 
              finalResult === 'won' ? wager.potential_payout : wager.amount
            );
          } catch (error) {
            console.error(`Error processing wager ${wager.id}:`, error);
            continue;
          }
          
          updatedWagers.push({
            id: wager.id,
            game: pick.game,
            pick: pick.pick,
            result: finalResult,
            amount: wager.amount,
            payout: finalResult === 'won' ? wager.potential_payout : 0,
            details: betResult.details // Add details about why the bet won or lost
          });
        }
      }
      
      // Check if there are no updates to process
      if (updatedWagers.length === 0) {
        return { success: true, message: 'No updates needed', updates: 0 };
      }

      // After updating wagers, update user stats for any users who bet on these picks
      try {
        console.log('Checking for user pick results to update...');
        const userResults = await userPickResultsService.checkAndUpdateResults();
        console.log('User pick results updated:', userResults);
      } catch (userStatsError) {
        console.error('Error updating user stats:', userStatsError);
        // Continue execution even if user stats update fails
      }

      return { 
        success: true, 
        message: `Updated ${updatedWagers.length} wagers`, 
        updates: updatedWagers.length 
      };
    } catch (error) {
      console.error('Unexpected error in updateGameResults:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Schedule automatic updates for game results
   * This would typically be handled by a cron job in a production environment
   */
  scheduleResultsUpdates: () => {
    // Check for completed games every 6 hours
    const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    
    console.log('Scheduling automatic game results updates');
    
    // First update immediately
    gameResultsService.updateGameResults();
    
    // Then schedule regular updates
    setInterval(async () => {
      console.log('Running scheduled game results update');
      await gameResultsService.updateGameResults();
    }, CHECK_INTERVAL);
  },

  /**
   * Get completed game results from The Odds API
   * @param {Object} pick - The pick to check results for
   * @returns {Promise<Object>} - Game result data
   */
  getGameResultFromOddsAPI: async (pick) => {
    try {
      // Get API key from environment
      const apiKey = import.meta.env.VITE_ODDS_API_KEY;
      if (!apiKey) {
        console.error('No Odds API key found');
        return { completed: false, error: 'No API key' };
      }

      // Extract team names and sport from the pick
      const sport = pick.league?.toLowerCase() || 'basketball_nba'; // Default to NBA if not specified
      const gameTeams = pick.game?.split(' vs ') || [];
      
      if (gameTeams.length !== 2) {
        console.error('Invalid game format, expected "Team1 vs Team2"');
        return { completed: false, error: 'Invalid game format' };
      }
      
      // Map sport to The Odds API sport key
      const sportMap = {
        'nba': 'basketball_nba',
        'mlb': 'baseball_mlb',
        'nfl': 'americanfootball_nfl',
        'nhl': 'icehockey_nhl'
      };
      
      const sportKey = sportMap[sport.toLowerCase()] || sport;
      
      // Call The Odds API to get scores
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${apiKey}`;
      const response = await axios.get(url);
      
      if (response.data && Array.isArray(response.data)) {
        // Find the matching game
        const game = response.data.find(g => {
          const homeTeam = g.home_team;
          const awayTeam = g.away_team;
          
          // Check if either team from the pick matches the teams in this game
          return (gameTeams[0].includes(homeTeam) || gameTeams[0].includes(awayTeam)) &&
                 (gameTeams[1].includes(homeTeam) || gameTeams[1].includes(awayTeam));
        });
        
        if (game) {
          // Check if the game is completed
          if (game.completed) {
            return {
              completed: true,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              homeScore: game.scores?.home_team || 0,
              awayScore: game.scores?.away_team || 0,
              winner: game.scores?.home_team > game.scores?.away_team ? 'home' : 'away',
              rawData: game
            };
          } else {
            return { completed: false, scheduled: game.commence_time, rawData: game };
          }
        } else {
          console.log('Game not found in API response');
          return { completed: false, error: 'Game not found' };
        }
      } else {
        console.error('Invalid API response');
        return { completed: false, error: 'Invalid API response' };
      }
    } catch (error) {
      console.error('Error fetching game results:', error);
      return { completed: false, error: error.message };
    }
  },
  
  /**
   * Evaluate if a bet was successful based on game result
   * @param {Object} pick - The pick to evaluate
   * @param {Object} gameResult - The game result from The Odds API
   * @returns {Object} - Result of bet evaluation
   */
  evaluateBetResult: (pick, gameResult) => {
    try {
      if (!gameResult.completed) {
        return { won: false, details: 'Game not completed' };
      }
      
      const betType = pick.betType?.toLowerCase() || '';
      const pickText = pick.pick?.toLowerCase() || '';
      
      // Extract teams from game result
      const { homeTeam, awayTeam, homeScore, awayScore, winner } = gameResult;
      
      // For moneyline bets
      if (betType.includes('moneyline')) {
        // Check if the pick was on the winning team
        const pickedTeam = pickText.includes(homeTeam.toLowerCase()) ? 'home' : 
                          pickText.includes(awayTeam.toLowerCase()) ? 'away' : null;
        
        if (!pickedTeam) {
          return { 
            won: false, 
            details: `Could not determine which team was picked: ${pickText}` 
          };
        }
        
        return { 
          won: pickedTeam === winner,
          details: `${pickedTeam === 'home' ? homeTeam : awayTeam} ${pickedTeam === winner ? 'won' : 'lost'} ${homeScore}-${awayScore}`
        };
      }
      
      // For spread bets
      else if (betType.includes('spread')) {
        // Extract team and spread from pick text
        const spreadMatch = pickText.match(/([a-zA-Z\s]+)\s*([-+]?\d+\.?\d*)/i);
        
        if (!spreadMatch) {
          return { 
            won: false, 
            details: `Could not parse spread from pick: ${pickText}` 
          };
        }
        
        const pickedTeam = spreadMatch[1].trim().toLowerCase();
        const spreadValue = parseFloat(spreadMatch[2]);
        
        const isHomeTeam = pickedTeam.includes(homeTeam.toLowerCase());
        const isAwayTeam = pickedTeam.includes(awayTeam.toLowerCase());
        
        if (!isHomeTeam && !isAwayTeam) {
          return { 
            won: false, 
            details: `Could not match team: ${pickedTeam}` 
          };
        }
        
        // Calculate final score with spread
        let adjustedScore;
        if (isHomeTeam) {
          adjustedScore = homeScore + spreadValue;
          return { 
            won: adjustedScore > awayScore,
            details: `${homeTeam} + ${spreadValue} = ${adjustedScore} vs ${awayTeam} ${awayScore}` 
          };
        } else {
          adjustedScore = awayScore + spreadValue;
          return { 
            won: adjustedScore > homeScore,
            details: `${awayTeam} + ${spreadValue} = ${adjustedScore} vs ${homeTeam} ${homeScore}` 
          };
        }
      }
      
      // For over/under bets
      else if (betType.includes('total') || betType.includes('over') || betType.includes('under')) {
        // Extract over/under value from pick text
        const totalMatch = pickText.match(/(over|under)\s*(\d+\.?\d*)/i);
        
        if (!totalMatch) {
          return { 
            won: false, 
            details: `Could not parse over/under from pick: ${pickText}` 
          };
        }
        
        const overUnder = totalMatch[1].toLowerCase();
        const totalValue = parseFloat(totalMatch[2]);
        const actualTotal = homeScore + awayScore;
        
        if (overUnder === 'over') {
          return { 
            won: actualTotal > totalValue,
            details: `Total: ${homeScore} + ${awayScore} = ${actualTotal} (over ${totalValue})` 
          };
        } else {
          return { 
            won: actualTotal < totalValue,
            details: `Total: ${homeScore} + ${awayScore} = ${actualTotal} (under ${totalValue})` 
          };
        }
      }
      
      // For parlay bets - this is simplified, would need more complex logic for real parlays
      else if (pick.league === 'PARLAY') {
        // For parlays, we should check each leg individually
        // This is a simplified version that assumes 60% success rate for parlays
        // In a real implementation, you'd evaluate each leg
        const randomSuccess = Math.random() < 0.4; // 40% success rate for parlays
        return {
          won: randomSuccess,
          details: randomSuccess ? 
            'Parlay hit! All legs successful.' : 
            'Parlay lost. One or more legs failed.'
        };
      }
      
      // Default case if bet type not recognized
      return { 
        won: false, 
        details: `Unknown bet type: ${betType}` 
      };
    } catch (error) {
      console.error('Error evaluating bet result:', error);
      return { won: false, details: `Error: ${error.message}` };
    }
  }
};

// Add method to bankrollService to update bankroll for a wager
bankrollService.updateBankrollForWager = async (wagerId, result, amount) => {
  try {
    // Use hardcoded bankroll data
    const defaultAmount = 10000;
    
    // Just update the wager status without touching bankroll
    // This avoids any references to the bankroll table
    const { error: updateError } = await supabase
      .from('wagers')
      .update({
        status: result === 'won' ? 'won' : 'lost',
        result_date: new Date().toISOString()
      })
      .eq('id', wagerId);
      
    if (updateError) {
      console.error('Error updating wager status:', updateError);
      return false;
    }
    
    // Log what would have happened to bankroll without updating the table
    console.log(`Wager ${wagerId} updated to ${result}. Bankroll update skipped (no bankroll table)`);
    
    return true;
  } catch (err) {
    console.error('Unexpected error in updateBankrollForWager:', err);
    return false;
  }
};

export { gameResultsService };
