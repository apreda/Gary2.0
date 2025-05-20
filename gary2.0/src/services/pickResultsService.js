/**
 * Pick Results Service
 * 
 * Handles checking and recording results for both game picks and player prop picks
 * Uses data from sports APIs to determine winners and automatically records results in Supabase
 */
import { supabase } from '../supabaseClient.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
import { apiSportsService } from './apiSportsService.js';

// Constants for validation
const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;

const pickResultsService = {
  /**
   * Get yesterday's game picks from daily_picks table
   * @param {string} dateStr - Optional date string in YYYY-MM-DD format, defaults to yesterday
   * @returns {Promise<Object>} - Picks data or error
   */
  getGamePicks: async (dateStr = null) => {
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
  getPropPicks: async (dateStr = null) => {
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
        if (row.picks && Array.isArray(JSON.parse(row.picks))) {
          const parsedPicks = JSON.parse(row.picks).map(pick => ({
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
  fetchFinalScore: async (league, homeTeam, awayTeam, date) => {
    console.log(`Fetching final score for ${league} game: ${awayTeam} @ ${homeTeam} on ${date}`);
    
    try {
      // 1. Try TheSportsDB API first (most reliable for historical data)
      const leagueMap = { 'MLB': 'MLB', 'NBA': 'NBA', 'NHL': 'NHL', 'NFL': 'NFL' };
      const formattedLeague = leagueMap[league] || league;
      
      const response = await fetch(
        `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=${formattedLeague}`
      );
      const data = await response.json();
      
      if (data?.events && Array.isArray(data.events)) {
        // Try to find the game with fuzzy matching on team names
        const game = data.events.find(e => {
          return (
            (e.strHomeTeam?.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) ||
             homeTeam.toLowerCase().includes(e.strHomeTeam?.toLowerCase().split(' ')[0])) &&
            (e.strAwayTeam?.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0]) ||
             awayTeam.toLowerCase().includes(e.strAwayTeam?.toLowerCase().split(' ')[0]))
          );
        });
        
        if (game && game.intHomeScore && game.intAwayScore) {
          return {
            homeScore: Number(game.intHomeScore),
            awayScore: Number(game.intAwayScore),
            winner:
              Number(game.intHomeScore) > Number(game.intAwayScore)
                ? homeTeam
                : awayTeam,
            final_score: `${game.intAwayScore}-${game.intHomeScore}`,
            source: 'TheSportsDB'
          };
        }
      }
      
      // 2. Try Ball Don't Lie for NBA games
      if (league.toUpperCase() === 'NBA') {
        try {
          const nbaGames = await ballDontLieService.getNbaGamesByDate(date);
          if (nbaGames) {
            const gameKey = Object.keys(nbaGames).find(key => {
              return (
                key.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]) &&
                key.toLowerCase().includes(awayTeam.toLowerCase().split(' ')[0])
              );
            });
            
            if (gameKey && nbaGames[gameKey]) {
              const [awayScore, homeScore] = nbaGames[gameKey].split('-').map(Number);
              return {
                homeScore,
                awayScore,
                winner: homeScore > awayScore ? homeTeam : awayTeam,
                final_score: `${awayScore}-${homeScore}`,
                source: 'BallDontLie'
              };
            }
          }
        } catch (error) {
          console.error('Ball Don\'t Lie API error:', error);
        }
      }
      
      // 3. Try API Sports as another option
      try {
        // Format for API-Sports
        if (league.toUpperCase() === 'MLB') {
          const games = await apiSportsService.apiRequest('/games', { date, league: 1 }, 'MLB');
          if (games?.response) {
            const game = games.response.find(g => {
              return (
                (g.teams?.home?.name?.toLowerCase().includes(homeTeam.toLowerCase()) ||
                 homeTeam.toLowerCase().includes(g.teams?.home?.name?.toLowerCase())) &&
                (g.teams?.away?.name?.toLowerCase().includes(awayTeam.toLowerCase()) ||
                 awayTeam.toLowerCase().includes(g.teams?.away?.name?.toLowerCase()))
              );
            });
            
            if (game?.scores) {
              return {
                homeScore: Number(game.scores.home?.total || 0),
                awayScore: Number(game.scores.away?.total || 0),
                winner:
                  Number(game.scores.home?.total) > Number(game.scores.away?.total)
                    ? homeTeam
                    : awayTeam,
                final_score: `${game.scores.away?.total || 0}-${game.scores.home?.total || 0}`,
                source: 'API-Sports'
              };
            }
          }
        }
      } catch (error) {
        console.error('API Sports error:', error);
      }

      // 4. Use Perplexity as last resort
      try {
        console.log('Using Perplexity as fallback for game result');
        const formattedDate = new Date(date).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
        
        const query = `What was the final score of the ${league} game between ${awayTeam} and ${homeTeam} on ${formattedDate}? Reply with ONLY the final score in the format: AwayTeam Score - HomeTeam Score. Include no other text.`;
        
        const result = await perplexityService.fetchRealTimeInfo(query);
        if (result) {
          // Try to parse scores with regex
          const scorePattern = /(\d+)\s*[-:]\s*(\d+)/;
          const match = result.match(scorePattern);
          
          if (match && match.length >= 3) {
            const awayScore = Number(match[1]);
            const homeScore = Number(match[2]);
            
            return {
              homeScore,
              awayScore,
              winner: homeScore > awayScore ? homeTeam : awayTeam,
              final_score: `${awayScore}-${homeScore}`,
              source: 'Perplexity'
            };
          }
        }
      } catch (error) {
        console.error('Perplexity error:', error);
      }
      
      console.log(`Could not find score for ${league} game: ${awayTeam} @ ${homeTeam}`);
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
  writeGameResultToDb: async (pick, gameResult, resultStr) => {
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
   * Store graded prop pick result in prop_results table
   * @param {Object} propPick - Original prop pick data
   * @param {number} actualValue - The actual value achieved by the player
   * @param {string} resultStr - Result string ('won', 'lost', 'push')
   * @returns {Promise<Object>} - Result of the database operation
   */
  writePropResultToDb: async (propPick, actualValue, resultStr) => {
    try {
      if (!resultStr) {
        return { success: false, message: 'Invalid result data' };
      }
      
      console.log(`Writing prop result to db: ${propPick.player} ${propPick.prop} -> ${resultStr}`);
      
      const propType = propPick.prop?.split(' ')[0] || 'unknown';
      const lineValue = parseFloat(propPick.prop?.split(' ')[1]) || 0;
      
      const { error } = await supabase
        .from('prop_results')
        .insert({
          prop_pick_id: propPick.prop_pick_id,
          game_date: propPick.game_date,
          player_name: propPick.player,
          prop_type: propType,
          line_value: lineValue,
          actual_value: actualValue || 0,
          result: resultStr,
          odds: propPick.odds?.toString() || '',
          pick_text: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
          matchup: propPick.team || '',
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
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Results processing summary
   */
  gradeAllGamePicks: async (dateStr) => {
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
      
      return { 
        success: true, 
        results,
        message: `Processed ${results.processed} picks: ${results.won} won, ${results.lost} lost, ${results.push} push, ${results.error} errors`
      };
    } catch (error) {
      console.error('Error grading game picks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Process all prop picks for a specific date and save results in prop_results
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Results processing summary
   */
  gradeAllPropPicks: async (dateStr) => {
    try {
      console.log(`Grading all prop picks for date: ${dateStr}`);
      
      // 1. Get prop picks from the date
      const picksResult = await pickResultsService.getPropPicks(dateStr);
      if (!picksResult.success || !picksResult.data?.length) {
        return { success: false, message: picksResult.message || 'No prop picks found for the specified date' };
      }
      
      const propPicks = picksResult.data;
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
          
          // For props, use Perplexity to get actual value and result
          const propType = propPick.prop?.split(' ')[0] || '';
          const lineValue = parseFloat(propPick.prop?.split(' ')[1]) || 0;
          const betType = propPick.bet?.toLowerCase() || '';
          
          // 3. Use Perplexity to get actual value
          const gameDate = new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          });
          
          const query = `What was the final ${propType} stat for ${propPick.player} on ${gameDate}? Just respond with the number value and nothing else.`;
          let actualValue;
          
          try {
            console.log('Querying Perplexity for actual prop value');
            const response = await perplexityService.fetchRealTimeInfo(query, { temperature: 0.1 });
            if (response) {
              // Try to extract a number from the response
              const numberMatch = response.match(/(\d+(\.\d+)?)/); 
              if (numberMatch) {
                actualValue = parseFloat(numberMatch[0]);
                console.log(`Found actual value: ${actualValue} for ${propPick.player} ${propType}`);
              }
            }
          } catch (error) {
            console.error('Perplexity query failed:', error);
          }
          
          // If we couldn't get the value, skip this prop
          if (actualValue === undefined || isNaN(actualValue)) {
            console.warn(`Could not determine actual value for: ${propPick.player} ${propType}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
              status: 'error',
              reason: 'Could not determine actual value'
            });
            continue;
          }
          
          // 4. Grade the prop
          let resultStr;
          if (betType === 'over') {
            if (actualValue > lineValue) resultStr = 'won';
            else if (actualValue < lineValue) resultStr = 'lost';
            else resultStr = 'push';
          } else if (betType === 'under') {
            if (actualValue < lineValue) resultStr = 'won';
            else if (actualValue > lineValue) resultStr = 'lost';
            else resultStr = 'push';
          } else {
            console.warn(`Unknown bet type: ${betType}`);
            results.error++;
            results.details.push({
              pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
              status: 'error',
              reason: 'Unknown bet type'
            });
            continue;
          }
          
          // 5. Save result to database
          const dbResult = await pickResultsService.writePropResultToDb(propPick, actualValue, resultStr);
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
          results[resultStr]++;
          results.details.push({
            pick: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
            status: 'success',
            result: resultStr,
            actual: actualValue,
            line: lineValue
          });
          
          console.log(`Successfully processed: ${propPick.player} ${propPick.prop} - ${resultStr} (${actualValue} vs ${lineValue})`);
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
      
      return { 
        success: true, 
        results,
        message: `Processed ${results.processed} prop picks: ${results.won} won, ${results.lost} lost, ${results.push} push, ${results.error} errors`
      };
    } catch (error) {
      console.error('Error grading prop picks:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Main function for admin interface to check and grade both game and prop picks for a date
   * @param {string} dateStr - Date string in YYYY-MM-DD format
   * @returns {Promise<Object>} - Combined results
   */
  checkResultsForDate: async (dateStr) => {
    if (!dateStr) {
      return { success: false, message: 'Date is required' };
    }
    
    console.log(`Checking all results for date: ${dateStr}`);
    
    // Run game picks and prop picks in parallel
    const [gameResults, propResults] = await Promise.all([
      pickResultsService.gradeAllGamePicks(dateStr),
      pickResultsService.gradeAllPropPicks(dateStr)
    ]);
    
    return {
      success: gameResults.success || propResults.success,
      gameResults,
      propResults,
      message: `Game Picks: ${gameResults.message || 'Failed to process'}, Prop Picks: ${propResults.message || 'Failed to process'}`
    };
  }
};

export { pickResultsService };
