import { supabase } from '../supabaseClient';
import { oddsService } from './oddsService';

/**
 * Service for tracking Gary's picks and their results
 */
export const garyPickTracking = {
  /**
   * Track results for Gary's picks
   * @returns {Promise<Object>} Results of the tracking operation
   */
  trackPickResults: async () => {
    try {
      console.log('Tracking results for Gary\'s picks...');
      
      // 1. Get all of Gary's picks from daily_picks table
      const { data: allPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('id, date, picks')
        .order('date', { ascending: false });
      
      if (picksError) {
        console.error('Error fetching Gary\'s picks:', picksError);
        return { success: false, error: picksError };
      }
      
      if (!allPicks || allPicks.length === 0) {
        console.log('No picks found to track');
        return { success: true, updated: 0 };
      }
      
      console.log(`Found ${allPicks.length} days of picks to check`);
      
      let totalTracked = 0;
      
      // Process each day's picks
      for (const dayPicks of allPicks) {
        // Skip if no picks data
        if (!dayPicks.picks || !Array.isArray(dayPicks.picks)) {
          continue;
        }
        
        // Process each individual pick
        for (const pick of dayPicks.picks) {
          // Skip if pick doesn't have necessary data
          if (!pick.id || !pick.league || !pick.gameId) {
            continue;
          }
          
          // Check if this pick already has a result in game_results
          const { data: existingResult, error: resultError } = await supabase
            .from('game_results')
            .select('*')
            .eq('pick_id', pick.id)
            .maybeSingle();
            
          if (resultError) {
            console.error(`Error checking existing result for pick ${pick.id}:`, resultError);
            continue;
          }
          
          // Skip if we already have a result for this pick
          if (existingResult && existingResult.result) {
            console.log(`Pick ${pick.id} already has result: ${existingResult.result}`);
            continue;
          }
          
          // Check if game has completed by fetching scores
          try {
            const gameDate = new Date(pick.gameDate || dayPicks.date);
            const formattedDate = gameDate.toISOString().split('T')[0];
            
            // Only check for results if the game date is in the past
            if (gameDate > new Date()) {
              console.log(`Game for pick ${pick.id} is in the future (${formattedDate}), skipping...`);
              continue;
            }
            
            // Simple mapping from our league names to oddsAPI sport keys
            const sportKey = {
              'NBA': 'basketball_nba',
              'MLB': 'baseball_mlb',
              'NHL': 'icehockey_nhl',
              'NFL': 'americanfootball_nfl'
            }[pick.league];
            
            if (!sportKey) {
              console.log(`Unknown league for pick ${pick.id}: ${pick.league}`);
              continue;
            }
            
            // Get game results from oddsAPI
            const scores = await oddsService.getScores(sportKey, formattedDate);
            const gameResult = scores.find(game => game.id === pick.gameId);
            
            if (!gameResult || !gameResult.completed) {
              console.log(`Game for pick ${pick.id} not completed yet`);
              continue;
            }
            
            console.log(`Found completed game for pick ${pick.id}:`, gameResult);
            
            // Determine if Gary's pick was correct
            let pickResult = 'unknown';
            let finalScore = '';
            
            if (gameResult.scores) {
              // Format the final score
              finalScore = `${gameResult.home_team} ${gameResult.scores.home} - ${gameResult.away_team} ${gameResult.scores.away}`;
              
              // Process the pick based on its type
              if (pick.pickType === 'totals' || pick.bet_type === 'totals') {
                const totalPoints = (gameResult.scores.home || 0) + (gameResult.scores.away || 0);
                const line = parseFloat(pick.line || pick.total || 0);
                
                if (pick.pick && pick.pick.toLowerCase().includes('over')) {
                  pickResult = totalPoints > line ? 'won' : 'lost';
                } else if (pick.pick && pick.pick.toLowerCase().includes('under')) {
                  pickResult = totalPoints < line ? 'won' : 'lost';
                } else if (Math.abs(totalPoints - line) < 0.1) {
                  pickResult = 'push';
                }
              } 
              // Handle moneyline bets
              else if (pick.pickType === 'moneyline' || pick.bet_type === 'moneyline' || 
                       (!pick.pickType && !pick.bet_type && pick.pick)) {
                // For moneyline, just check if the team picked won
                const teamPicked = pick.pick || '';
                const homeWon = (gameResult.scores.home || 0) > (gameResult.scores.away || 0);
                
                if (teamPicked.includes(gameResult.home_team)) {
                  pickResult = homeWon ? 'won' : 'lost';
                } else if (teamPicked.includes(gameResult.away_team)) {
                  pickResult = homeWon ? 'lost' : 'won';
                }
              }
              // Handle spread bets
              else if (pick.pickType === 'spread' || pick.bet_type === 'spread') {
                const line = parseFloat(pick.line || 0);
                const isHomeTeamPick = pick.pick && pick.pick.includes(gameResult.home_team);
                const homeDiff = (gameResult.scores.home || 0) - (gameResult.scores.away || 0);
                
                if (isHomeTeamPick) {
                  pickResult = homeDiff + line > 0 ? 'won' : (homeDiff + line === 0 ? 'push' : 'lost');
                } else {
                  pickResult = homeDiff - line < 0 ? 'won' : (homeDiff - line === 0 ? 'push' : 'lost');
                }
              }
            }
            
            console.log(`Determined result for pick ${pick.id}: ${pickResult}`);
            
            // Insert or update the result in game_results
            if (pickResult !== 'unknown') {
              const { data: updatedResult, error: updateError } = await supabase
                .from('game_results')
                .upsert({
                  pick_id: pick.id,
                  game_date: formattedDate,
                  league: pick.league,
                  result: pickResult,
                  final_score: finalScore
                })
                .select()
                .single();
                
              if (updateError) {
                console.error(`Error updating result for pick ${pick.id}:`, updateError);
              } else {
                console.log(`Updated result for pick ${pick.id}:`, updatedResult);
                totalTracked++;
              }
            }
          } catch (gameError) {
            console.error(`Error processing game for pick ${pick.id}:`, gameError);
          }
        }
      }
      
      return { success: true, updated: totalTracked };
    } catch (error) {
      console.error('Error tracking pick results:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Get Gary's performance summary (win/loss record)
   * @param {Object} filters - Optional filters like date range or league
   * @returns {Promise<Object>} Performance summary
   */
  getGaryPerformanceSummary: async (filters = {}) => {
    try {
      // Build the query
      let query = supabase
        .from('game_results')
        .select('*');
      
      // Apply any filters
      if (filters.startDate) {
        query = query.gte('game_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('game_date', filters.endDate);
      }
      if (filters.league) {
        query = query.eq('league', filters.league);
      }
      
      // Execute query
      const { data: results, error } = await query;
      
      if (error) {
        console.error('Error fetching Gary\'s performance:', error);
        return { success: false, error };
      }
      
      // Calculate performance metrics
      const summary = {
        total: results.length,
        wins: results.filter(r => r.result === 'won').length,
        losses: results.filter(r => r.result === 'lost').length,
        pushes: results.filter(r => r.result === 'push').length,
        pending: results.filter(r => !r.result || r.result === 'unknown').length,
      };
      
      // Calculate win rate - exclude pushes and pending from denominator
      const decisiveGames = summary.total - summary.pushes - summary.pending;
      summary.winRate = decisiveGames > 0 ? (summary.wins / decisiveGames) * 100 : 0;
      
      // Add league breakdown if requested
      if (filters.includeLeagueBreakdown) {
        summary.leagueBreakdown = {};
        
        // Get unique leagues
        const leagues = [...new Set(results.map(r => r.league))];
        
        // Calculate stats for each league
        for (const league of leagues) {
          const leagueResults = results.filter(r => r.league === league);
          const leagueWins = leagueResults.filter(r => r.result === 'won').length;
          const leagueLosses = leagueResults.filter(r => r.result === 'lost').length;
          const leaguePushes = leagueResults.filter(r => r.result === 'push').length;
          const leaguePending = leagueResults.filter(r => !r.result || r.result === 'unknown').length;
          const leagueDecisive = leagueResults.length - leaguePushes - leaguePending;
          
          summary.leagueBreakdown[league] = {
            total: leagueResults.length,
            wins: leagueWins,
            losses: leagueLosses,
            pushes: leaguePushes,
            pending: leaguePending,
            winRate: leagueDecisive > 0 ? (leagueWins / leagueDecisive) * 100 : 0
          };
        }
      }
      
      return { success: true, data: summary };
    } catch (error) {
      console.error('Error getting Gary\'s performance summary:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Create a schedule to track pick results periodically
   */
  scheduleTracking: () => {
    // Run once when initialized
    garyPickTracking.trackPickResults();
    
    // Then schedule to run every 2 hours
    const trackingInterval = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    setInterval(() => {
      garyPickTracking.trackPickResults();
    }, trackingInterval);
    
    console.log('Gary pick tracking scheduled to run every 2 hours');
  }
};
