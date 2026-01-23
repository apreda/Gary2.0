/**
 * Pick Results Service
 * 
 * Handles checking and recording results for both game picks and player prop picks
 * Uses data from sports APIs to determine winners and automatically records results in Supabase
 */
import { supabase } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { oddsService } from './oddsService.js';

// Constants for validation
const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;

const pickResultsService = {
  /**
   * Get yesterday's game picks from daily_picks table
   * @param {string} dateStr - Optional date string in YYYY-MM-DD format, defaults to yesterday
   * @returns {Promise<Object>} - Picks data or error
   */
  getGamePicks: async function(dateStr = null) {
    try {
      // Default to yesterday if no date provided
      const targetDate = dateStr || (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
      })();
      
      console.log(`Fetching game picks for date: ${targetDate}`);
      
      // Get daily picks from the specified date
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', targetDate);

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { success: false, message: 'No picks found for the specified date' };
      }
      
      // Extract picks from each row
      const allPicks = [];
      for (const row of data) {
        if (row.picks && Array.isArray(JSON.parse(row.picks))) {
          const parsedPicks = JSON.parse(row.picks).map(pick => ({
            ...pick,
            pick_id: row.id,
            game_date: targetDate
          }));
          allPicks.push(...parsedPicks);
        }
      }
      
      return { 
        success: true, 
        data: allPicks, 
        date: targetDate,
        originalData: data
      };
    } catch (error) {
      console.error('Error in getGamePicks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get prop picks from prop_picks table
   * @param {string} dateStr - Optional date string in YYYY-MM-DD format, defaults to yesterday
   * @returns {Promise<Object>} - Prop picks data or error
   */
  getPropPicks: async function(dateStr = null) {
    try {
      // Default to yesterday if no date provided
      const targetDate = dateStr || (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format
      })();
      
      console.log(`Fetching prop picks for date: ${targetDate}`);
      
      // Get prop picks from the specified date
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', targetDate);

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return { success: false, message: 'No prop picks found for the specified date' };
      }
      
      // Extract picks from each row
      const allPropPicks = [];
      for (const row of data) {
        // Handle both JSONB (native array) and JSON string formats
        let picks = row.picks;
        if (typeof picks === 'string') {
          try {
            picks = JSON.parse(picks);
          } catch (e) {
            console.warn('Failed to parse picks JSON:', e.message);
            continue;
          }
        }
        
        if (picks && Array.isArray(picks)) {
          const parsedPicks = picks.map(pick => ({
            ...pick,
            prop_pick_id: row.id,
            game_date: targetDate
          }));
          allPropPicks.push(...parsedPicks);
        }
      }
      
      return { 
        success: true, 
        data: allPropPicks, 
        date: targetDate,
        originalData: data
      };
    } catch (error) {
      console.error('Error in getPropPicks:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Fetch final score for a specific game from various sports APIs
   * @param {string} league - League code (MLB, NBA, NHL)
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} date - Game date in YYYY-MM-DD format
   * @returns {Promise<Object|null>} - Game result object or null if not found
   */
  fetchFinalScore: async function(league, homeTeam, awayTeam, date) {
    console.log(`Fetching final score for ${league} game: ${awayTeam} @ ${homeTeam} on ${date}`);
    
    try {
      // 1. Try Ball Don't Lie via the shared oddsService helper
      try {
        const completedGames = await oddsService.getCompletedGamesByDate(league, date);
        if (Array.isArray(completedGames) && completedGames.length > 0) {
          const normalize = (team) => (team || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const normalizedHome = normalize(homeTeam);
          const normalizedAway = normalize(awayTeam);

          const matchedGame = completedGames.find(game => {
            const gameHome = normalize(game.home_team);
            const gameAway = normalize(game.away_team);
            return (
              (gameHome.includes(normalizedHome) || normalizedHome.includes(gameHome)) &&
              (gameAway.includes(normalizedAway) || normalizedAway.includes(gameAway))
            );
          });

          if (matchedGame) {
            const homeScore = Number(matchedGame.scores?.home ?? 0);
            const awayScore = Number(matchedGame.scores?.away ?? 0);

            console.log(`Found score from BDL: ${awayTeam} ${awayScore}, ${homeTeam} ${homeScore}`);
            return {
              homeScore,
              awayScore,
              winner: homeScore > awayScore ? homeTeam : awayTeam,
              final_score: `${homeScore}-${awayScore}`,
              source: 'BallDontLie'
            };
          }
        }
      } catch (bdlError) {
        console.error('Error fetching scores from BDL:', bdlError);
      }

      // Ball Don't Lie did not have the result
      console.log(`Could not find score from BDL for ${league} game: ${awayTeam} @ ${homeTeam}`);
      return null;
    } catch (error) {
      console.error(`Error fetching game result: ${error.message}`);
      return null;
    }
  },
  
  /**
   * Grade a pick (determine win/loss/push) based on final score
   * @param {Object} pick - Pick object containing details of the bet
   * @param {Object} gameResult - Game result with scores
   * @returns {string} - 'won', 'lost', or 'push'
   */
  gradePick: (pick, gameResult) => {
    if (!gameResult) return null;
    
    // Extract data from the pick
    const pickText = pick.pick || '';
    const type = pick.type?.toLowerCase() || '';
    const homeTeam = pick.homeTeam || pick.home_team || '';
    const awayTeam = pick.awayTeam || pick.away_team || '';
    const { homeScore, awayScore } = gameResult;
    
    try {
      // Handle different bet types
      if (type === 'moneyline' || type.includes('ml')) {
        // For moneyline, check if picked team won
        const pickedTeam = pickText.toLowerCase().includes(homeTeam.toLowerCase()) ? homeTeam : awayTeam;
        const winner = gameResult.winner || (homeScore > awayScore ? homeTeam : awayTeam);
        
        return pickedTeam.toLowerCase() === winner.toLowerCase() ? 'won' : 'lost';
      }
      
      if (type === 'spread' || pickText.match(/[-+][0-9]+(\.[0-9]+)?/)) {
        // For spread bets, extract the spread value
        const spreadMatch = pickText.match(/([+-][0-9]+(\.[0-9]+)?)/); 
        if (!spreadMatch) return null;
        
        const spread = parseFloat(spreadMatch[0]);
        const isHomeTeamPick = pickText.toLowerCase().includes(homeTeam.toLowerCase());
        
        // Calculate with spread applied
        if (isHomeTeamPick) {
          // Home team with spread vs away team straight
          const homeScoreWithSpread = homeScore + spread;
          if (homeScoreWithSpread > awayScore) return 'won';
          if (homeScoreWithSpread < awayScore) return 'lost';
          return 'push';
        } else {
          // Away team with spread vs home team straight
          const awayScoreWithSpread = awayScore + spread;
          if (awayScoreWithSpread > homeScore) return 'won';
          if (awayScoreWithSpread < homeScore) return 'lost';
          return 'push';
        }
      }
      
      if (type === 'total' || type === 'over/under' || pickText.includes('over') || pickText.includes('under')) {
        // For totals, check if total score is over/under the line
        const totalScore = homeScore + awayScore;
        const lineMatch = pickText.match(/([0-9]+(\.[0-9]+)?)/); 
        if (!lineMatch) return null;
        
        const line = parseFloat(lineMatch[0]);
        const isOver = pickText.toLowerCase().includes('over');
        
        if (isOver) {
          if (totalScore > line) return 'won';
          if (totalScore < line) return 'lost';
          return 'push';
        } else {
          if (totalScore < line) return 'won';
          if (totalScore > line) return 'lost';
          return 'push';
        }
      }
      
      // Default fallback
      console.error(`Could not determine result for pick type: ${type}`);
      return null;
    } catch (error) {
      console.error(`Error grading pick: ${error.message}`);
      return null;
    }
  },
  
  /**
   * Store graded game pick result in game_results table
   * @param {Object} pick - Original pick data
   * @param {Object} gameResult - Game result with scores
   * @param {string} resultStr - Result string ('won', 'lost', 'push')
   * @returns {Promise<Object>} - Result of the database operation
   */
  writeGameResultToDb: async function(pick, gameResult, resultStr) {
    try {
      if (!resultStr || !gameResult) {
        return { success: false, message: 'Invalid result data' };
      }
      
      console.log(`Writing game result to db: ${pick.pick} -> ${resultStr}`);
      
      const { error } = await supabase
        .from('game_results')
        .insert({
          pick_id: pick.pick_id,
          game_date: pick.game_date,
          league: pick.league,
          result: resultStr,
          final_score: gameResult.final_score,
          pick_text: pick.pick,
          matchup: `${pick.awayTeam || pick.away_team} @ ${pick.homeTeam || pick.home_team}`,
          confidence: pick.confidence,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      console.error(`Error writing game result to db: ${error.message}`);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Fetch player stats for a specific game date
   * Uses Ball Don't Lie API for verified stats
   * @param {string} playerName - Player name
   * @param {string} team - Team name
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object|null>} - Player stats or null if not found
   */
  fetchPlayerStats: async function(playerName, team, dateStr) {
    try {
      // Player stats should be fetched from BDL API
      // This function is a placeholder - prop results are checked via BDL game logs
      console.log(`[pickResultsService] Player stats for ${playerName} should be fetched from BDL API`);
      return null;
    } catch (error) {
      console.error('Error fetching player stats:', error);
      return null;
    }
  },

  /**
   * Grade a prop pick based on player stats
   * @param {Object} propPick - Prop pick data
   * @param {Object} playerStats - Player stats data
   * @returns {string|null} - Result string ('won', 'lost', 'push') or null
   */
  gradePropPick: function(propPick, playerStats) {
    try {
      if (!playerStats || playerStats.actualValue === undefined) return null;
      
      const propType = propPick.prop?.split(' ')[0] || '';
      const lineValue = parseFloat(propPick.prop?.split(' ')[1]) || 0;
      const betType = propPick.bet?.toLowerCase() || '';
      const actualValue = playerStats.actualValue;
      
      if (betType === 'over') {
        if (actualValue > lineValue) return 'won';
        else if (actualValue < lineValue) return 'lost';
        else return 'push';
      } else if (betType === 'under') {
        if (actualValue < lineValue) return 'won';
        else if (actualValue > lineValue) return 'lost';
        else return 'push';
      } else {
        console.warn(`Unknown bet type: ${betType}`);
        return null;
      }
    } catch (error) {
      console.error(`Error grading prop pick: ${error.message}`);
      return null;
    }
  },

  /**
   * Store graded prop pick result in prop_results table
   * @param {Object} propPick - Original prop pick data
   * @param {number} actualValue - Actual stat value
   * @param {string} resultStr - Result string ('won', 'lost', 'push')
   * @returns {Promise<Object>} - Result of the database operation
   */
  writePropResultToDb: async function(propPick, actualValue, resultStr) {
    try {
      if (!resultStr) {
        return { success: false, message: 'Invalid result data' };
      }
      
      console.log(`Writing prop result to db: ${propPick.player} ${propPick.prop} -> ${resultStr}`);
      
      const propType = propPick.prop?.split(' ')[0] || 'unknown';
      const lineValue = parseFloat(propPick.prop?.split(' ')[1]) || 0;
      
      // Format odds properly - ensure it's a string with the sign
      let oddsStr = null;
      if (propPick.odds !== undefined && propPick.odds !== null) {
        const oddsNum = Number(propPick.odds);
        if (!isNaN(oddsNum)) {
          // Format with + sign for positive odds
          oddsStr = oddsNum > 0 ? `+${oddsNum}` : String(oddsNum);
        }
      }
      
      const { error } = await supabase
        .from('prop_results')
        .insert({
          prop_pick_id: propPick.prop_pick_id || `prop-${Date.now()}`,
          game_date: propPick.game_date,
          player_name: propPick.player,
          prop_type: propType,
          line_value: lineValue,
          actual_value: actualValue || 0,
          result: resultStr,
          odds: oddsStr,
          pick_text: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
          matchup: propPick.team,
          bet: propPick.bet || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      console.error(`Error writing prop result to db: ${error.message}`);
      return { success: false, message: error.message };
    }
  },

  /**
   * Process all game picks for a specific date and save results in game_results
   * ALSO automatically process user bet/fade results
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Results processing summary
   */
  gradeAllGamePicks: async function(dateStr) {
    try {
      console.log(`Grading all game picks for date: ${dateStr}`);
      
      // 1. Get picks from the date
      const picksResult = await pickResultsService.getGamePicks(dateStr);
      if (!picksResult.success || !picksResult.data?.length) {
        return { success: false, message: picksResult.message || 'No picks found for the specified date' };
      }
      
      const picks = picksResult.data;
      console.log(`Found ${picks.length} game picks to grade`);
      
      // 2. Process each pick
      const results = {
        processed: 0,
        won: 0,
        lost: 0,
        push: 0,
        error: 0,
        details: []
      };
      
      for (const pick of picks) {
        try {
          console.log(`Processing pick: ${pick.pick} (${pick.homeTeam} vs ${pick.awayTeam})`);
          
          // Skip picks that don't have both team names
          if (!pick.homeTeam || !pick.awayTeam) {
            console.warn(`Skipping pick due to missing team names: ${pick.pick}`);
            results.error++;
            results.details.push({
              pick: pick.pick,
              status: 'error',
              reason: 'Missing team names'
            });
            continue;
          }
          
          // 3. Fetch game result
          const gameResult = await pickResultsService.fetchFinalScore(
            pick.league,
            pick.homeTeam,
            pick.awayTeam,
            dateStr
          );
          
          if (!gameResult) {
            console.warn(`Could not find game result for: ${pick.awayTeam} @ ${pick.homeTeam}`);
            results.error++;
            results.details.push({
              pick: pick.pick,
              status: 'error',
              reason: 'Game result not found'
            });
            continue;
          }
          
          // 4. Grade the pick
          const gradeResult = pickResultsService.gradePick(pick, gameResult);
          if (!gradeResult) {
            console.warn(`Could not grade pick: ${pick.pick}`);
            results.error++;
            results.details.push({
              pick: pick.pick,
              status: 'error',
              reason: 'Could not determine result'
            });
            continue;
          }
          
          // 5. Save result to database
          const dbResult = await pickResultsService.writeGameResultToDb(pick, gameResult, gradeResult);
          if (!dbResult.success) {
            console.error(`Error saving result to database: ${dbResult.message}`);
            results.error++;
            results.details.push({
              pick: pick.pick,
              status: 'error',
              reason: 'Database error: ' + dbResult.message
            });
            continue;
          }
          
          // 6. Update counts
          results.processed++;
          results[gradeResult]++;
          results.details.push({
            pick: pick.pick,
            status: 'success',
            result: gradeResult,
            score: gameResult.final_score
          });
          
          console.log(`Successfully processed: ${pick.pick} - ${gradeResult} (${gameResult.final_score})`);
        } catch (error) {
          console.error(`Error processing pick ${pick.pick}:`, error);
          results.error++;
          results.details.push({
            pick: pick.pick,
            status: 'error',
            reason: error.message
          });
        }
      }
      
      // 🎯 NEW: Automatically process user bet/fade results after game results are saved
      console.log('🎯 Automatically processing user bet/fade results...');
      try {
        // Import the userPickResultsService
        const { userPickResultsService } = await import('./userPickResultsService.js');
        
        // Process user results for this date
        const userResultsProcessing = await userPickResultsService.manualProcessResults(dateStr);
        
        if (userResultsProcessing.success) {
          console.log(`✅ Successfully processed ${userResultsProcessing.updated} user bet/fade results`);
          results.userResults = {
            success: true,
            processed: userResultsProcessing.updated,
            message: `Automatically updated ${userResultsProcessing.updated} user bet/fade outcomes`
          };
        } else {
          console.warn('⚠️ User results processing completed with issues:', userResultsProcessing.message);
          results.userResults = {
            success: false,
            message: userResultsProcessing.message || 'Failed to process user results'
          };
        }
      } catch (userError) {
        console.error('❌ Error processing user bet/fade results:', userError);
        results.userResults = {
          success: false,
          message: `Error processing user results: ${userError.message}`
        };
      }
      
      return { 
        success: true, 
        results,
        message: `Processed ${results.processed} picks: ${results.won} won, ${results.lost} lost, ${results.push} push, ${results.error} errors. ${results.userResults?.message || ''}`
      };
    } catch (error) {
      console.error('Error grading game picks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Process all prop picks for a specific date and save results in prop_results
   * ALSO automatically process user bet/fade results
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Results processing summary
   */
  gradeAllPropPicks: async function(dateStr) {
    try {
      console.log(`Grading all prop picks for date: ${dateStr}`);
      
      // 1. Get prop picks from the date
      const propPicksResult = await pickResultsService.getPropPicks(dateStr);
      if (!propPicksResult.success || !propPicksResult.data?.length) {
        return { success: false, message: propPicksResult.message || 'No prop picks found for the specified date' };
      }
      
      const propPicks = propPicksResult.data;
      console.log(`Found ${propPicks.length} prop picks to grade`);
      
      // 2. Process each prop pick
      const results = {
        processed: 0,
        won: 0,
        lost: 0,
        push: 0,
        error: 0,
        details: []
      };
      
      for (const propPick of propPicks) {
        try {
          console.log(`Processing prop pick: ${propPick.player} ${propPick.prop} ${propPick.bet}`);
          
          // Skip picks that don't have required data
          if (!propPick.player || !propPick.prop) {
            console.warn(`Skipping prop pick due to missing data: ${JSON.stringify(propPick)}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player || ''} ${propPick.prop || ''} ${propPick.bet || ''}`,
              status: 'error',
              reason: 'Missing player or prop data'
            });
            continue;
          }
          
          // 3. Fetch player stats for the game
          const playerStats = await pickResultsService.fetchPlayerStats(
            propPick.player,
            propPick.team,
            dateStr
          );
          
          if (!playerStats) {
            console.warn(`Could not find player stats for: ${propPick.player} on ${dateStr}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
              status: 'error',
              reason: 'Player stats not found'
            });
            continue;
          }
          
          // 4. Grade the prop pick
          const gradeResult = pickResultsService.gradePropPick(propPick, playerStats);
          if (!gradeResult) {
            console.warn(`Could not grade prop pick: ${propPick.player} ${propPick.prop}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
              status: 'error',
              reason: 'Could not determine result'
            });
            continue;
          }
          
          // 5. Save result to database
          const dbResult = await pickResultsService.writePropResultToDb(propPick, playerStats.actualValue, gradeResult);
          if (!dbResult.success) {
            console.error(`Error saving prop result to database: ${dbResult.message}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
              status: 'error',
              reason: 'Database error: ' + dbResult.message
            });
            continue;
          }
          
          // 6. Update counts
          results.processed++;
          results[gradeResult]++;
          results.details.push({
            pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
            status: 'success',
            result: gradeResult,
            actualValue: playerStats.actualValue
          });
          
          console.log(`Successfully processed: ${propPick.player} ${propPick.prop} - ${gradeResult} (actual: ${playerStats.actualValue})`);
        } catch (error) {
          console.error(`Error processing prop pick:`, error);
          results.error++;
          results.details.push({
            pick: `${propPick.player || ''} ${propPick.prop || ''} ${propPick.bet || ''}`,
            status: 'error',
            reason: error.message
          });
        }
      }
      
      // 🎯 NEW: Automatically process user bet/fade results for prop picks after results are saved
      console.log('🎯 Automatically processing user bet/fade results for prop picks...');
      try {
        // Import the userPickResultsService
        const { userPickResultsService } = await import('./userPickResultsService.js');
        
        // Process user results for this date (this will handle both game and prop picks)
        const userResultsProcessing = await userPickResultsService.manualProcessResults(dateStr);
        
        if (userResultsProcessing.success) {
          console.log(`✅ Successfully processed ${userResultsProcessing.updated} user bet/fade results for prop picks`);
          results.userResults = {
            success: true,
            processed: userResultsProcessing.updated,
            message: `Automatically updated ${userResultsProcessing.updated} user bet/fade outcomes for prop picks`
          };
        } else {
          console.warn('⚠️ User results processing for prop picks completed with issues:', userResultsProcessing.message);
          results.userResults = {
            success: false,
            message: userResultsProcessing.message || 'Failed to process user results for prop picks'
          };
        }
      } catch (userError) {
        console.error('❌ Error processing user bet/fade results for prop picks:', userError);
        results.userResults = {
          success: false,
          message: `Error processing user results for prop picks: ${userError.message}`
        };
      }
      
      return { 
        success: true, 
        results,
        message: `Processed ${results.processed} prop picks: ${results.won} won, ${results.lost} lost, ${results.push} push, ${results.error} errors. ${results.userResults?.message || ''}`
      };
    } catch (error) {
      console.error('Error grading prop picks:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Main function for admin interface to check and grade both game and prop picks for a date
   * ALSO automatically processes user bet/fade results
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Combined results
   */
  checkResultsForDate: async function(dateStr) {
    if (!dateStr) {
      return { success: false, message: 'Date is required' };
    }
    
    console.log(`Checking all results for date: ${dateStr}`);
    
    // Run game picks and prop picks in parallel
    const [gameResults, propResults] = await Promise.all([
      pickResultsService.gradeAllGamePicks(dateStr),
      pickResultsService.gradeAllPropPicks(dateStr)
    ]);
    
    // Extract user results info from game results processing
    const userResultsInfo = gameResults.results?.userResults || { success: false, message: 'No user results processed' };
    
    return {
      success: gameResults.success || propResults.success,
      gameResults,
      propResults,
      userResults: userResultsInfo, // Include user results in the response
      message: `Game Picks: ${gameResults.message || 'Failed to process'}, Prop Picks: ${propResults.message || 'Failed to process'}`
    };
  }
};

export { pickResultsService };
