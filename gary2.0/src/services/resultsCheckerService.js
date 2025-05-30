import { supabase } from '../supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
import { pickResultsAnalyzer } from './pickResultsAnalyzer.js';
import { oddsService } from './oddsService.js';
import { apiSportsService } from './apiSportsService.js';
import { garyPerformanceService } from './garyPerformanceService.js';

const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xuttubsfgdcjfgmskcol.supabase.co';
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const adminSupabase = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : supabase;

// Initialize services as needed

export const resultsCheckerService = {
  /**
   * Get yesterday's game picks from daily_picks table
   * @param {string} dateStr - Optional date string in YYYY-MM-DD format, defaults to yesterday
   * @returns {Promise<Object>} - Picks data or error
   */
  getYesterdayGamePicks: async (dateStr = null) => {
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
      console.error('Error in getYesterdayGamePicks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get yesterday's prop picks from prop_picks table
   * @param {string} dateStr - Optional date string in YYYY-MM-DD format, defaults to yesterday
   * @returns {Promise<Object>} - Prop picks data or error
   */
  getYesterdayPropPicks: async (dateStr = null) => {
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
      console.error('Error in getYesterdayPropPicks:', error);
      return { success: false, message: error.message };
    }
  },
  validateResult(result) {
    if (!VALID_RESULTS.has(result)) {
      console.error(`Invalid result: ${result}. Must be one of: ${Array.from(VALID_RESULTS).join(', ')}`);
      return false;
    }
    return true;
  },

  validateScore(score) {
    if (!SCORE_REGEX.test(score)) {
      console.error(`Invalid score format: ${score}. Expected format: "##-##"`);
      return false;
    }
    return true;
  },

  withRetry: async (fn, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) => {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        console.error(`Max retries reached. Error: ${error.message}`);
        throw error;
      }
      console.warn(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Use the direct function reference to avoid circular dependency
      return resultsCheckerService.withRetry(fn, retries - 1, delay * 1.5);
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
            final_score: `${game.intHomeScore}-${game.intAwayScore}`,
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
                final_score: `${homeScore}-${awayScore}`,
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
                final_score: `${game.scores.home?.total || 0}-${game.scores.away?.total || 0}`,
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
        
        // Use a more specific query format to get exactly what we need
        const query = `What was the final score of the ${league} game between ${awayTeam} and ${homeTeam} on ${formattedDate}? Respond with ONLY: [Team1] [Score1], [Team2] [Score2].`;
        
        const result = await perplexityService.fetchRealTimeInfo(query);
        console.log(`Perplexity response for ${awayTeam} @ ${homeTeam}: "${result}"`);
        
        if (result) {
          console.log(`Successfully extracted score: ${result}`);
          
          // Try multiple patterns to handle different response formats
          
          // Pattern 1: Direct score pattern (digits-digits)
          const directScorePattern = /(\d+)\s*[-:]\s*(\d+)/;
          const directMatch = result.match(directScorePattern);
          
          if (directMatch && directMatch.length >= 3) {
            console.log(`Found direct score pattern: ${directMatch[1]}-${directMatch[2]}`);
            const score1 = Number(directMatch[1]);
            const score2 = Number(directMatch[2]);
            
            // Since we don't know which is home/away in this format, match with team names
            return {
              homeScore: score2, // Assuming second score is home
              awayScore: score1, // Assuming first score is away
              winner: score2 > score1 ? homeTeam : awayTeam,
              final_score: `${score1}-${score2}`,
              source: 'Perplexity-Direct'
            };
          }
          
          // Pattern 2: Team name and score pattern like "Detroit Tigers 5, Toronto Blue Jays 4"
          const teamScorePattern = /([A-Za-z][A-Za-z\s\.\-']+)\s*(\d+)\s*,\s*([A-Za-z][A-Za-z\s\.\-']+)\s*(\d+)/i;
          const teamMatch = result.match(teamScorePattern);
          
          if (teamMatch && teamMatch.length >= 5) {
            console.log(`Found team name and score pattern`);
            const team1 = teamMatch[1].trim();
            const score1 = Number(teamMatch[2]);
            const team2 = teamMatch[3].trim();
            const score2 = Number(teamMatch[4]);
            
            console.log(`Team 1: ${team1} (${score1}), Team 2: ${team2} (${score2})`);
            
            // Determine which team is home vs away
            let homeTeamName = homeTeam;
            let awayTeamName = awayTeam;
            
            // The strings might be null or undefined, so add safety checks
            const safeHomeTeam = (homeTeamName || '').toLowerCase();
            const safeAwayTeam = (awayTeamName || '').toLowerCase();
            const safeTeam1 = (team1 || '').toLowerCase();
            const safeTeam2 = (team2 || '').toLowerCase();
            
            let homeMatchesTeam1 = safeTeam1.includes(safeHomeTeam) || safeHomeTeam.includes(safeTeam1);
            let homeMatchesTeam2 = safeTeam2.includes(safeHomeTeam) || safeHomeTeam.includes(safeTeam2);
            
            if (homeMatchesTeam1) {
              return {
                homeScore: score1,
                awayScore: score2,
                winner: score1 > score2 ? homeTeam : awayTeam,
                final_score: `${score2}-${score1}`,
                source: 'Perplexity-Teams'
              };
            } else if (homeMatchesTeam2) {
              return {
                homeScore: score2,
                awayScore: score1,
                winner: score2 > score1 ? homeTeam : awayTeam,
                final_score: `${score1}-${score2}`,
                source: 'Perplexity-Teams'
              };
            } else {
              // If matching is unclear, try another approach - look for words like "at"
              const isHomeSecond = result.includes(' at ') || result.includes(' @ ');
              
              if (isHomeSecond) {
                return {
                  homeScore: score2,
                  awayScore: score1,
                  winner: score2 > score1 ? homeTeam : awayTeam,
                  final_score: `${score1}-${score2}`,
                  source: 'Perplexity-AtFormat'
                };
              } else {
                // If all else fails, make a best guess based on which team was mentioned first
                return {
                  homeScore: score2,
                  awayScore: score1,
                  winner: score2 > score1 ? homeTeam : awayTeam,
                  final_score: `${score1}-${score2}`,
                  source: 'Perplexity-Guess'
                };
              }
            }
          }
          
          // Pattern 3: Just extract all numbers as possible scores
          const allNumbers = result.match(/\d+/g);
          if (allNumbers && allNumbers.length >= 2) {
            console.log(`Found numbers in response: ${allNumbers[0]}, ${allNumbers[1]}`);
            const score1 = Number(allNumbers[0]);
            const score2 = Number(allNumbers[1]);
            
            return {
              homeScore: score2, // Assume second number is home score
              awayScore: score1, // Assume first number is away score
              winner: score2 > score1 ? homeTeam : awayTeam,
              final_score: `${score1}-${score2}`,
              source: 'Perplexity-Numbers'
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
          confidence: pick.confidence || null,
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
   * @param {Object} gameResult - Game result with scores
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
          odds: propPick.odds.toString(),
          pick_text: `${propPick.player} ${propPick.prop} ${propPick.bet}`,
          matchup: propPick.team,
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

  getGameScores: async (date, picks) => {
    try {
      if (!picks || picks.length === 0) {
        return { success: false, message: 'No picks provided' };
      }
      const scores = {};
      let missingGames = [];

      // 1. Perplexity primary
      try {
        // Use direct method call with proper reference
        const perplexityScores = await resultsCheckerService.getScoresFromPerplexity(date, picks);
        if (perplexityScores?.success && Object.keys(perplexityScores.scores || {}).length > 0) {
          Object.assign(scores, perplexityScores.scores);
          const foundPicks = new Set(Object.keys(scores));
          missingGames = picks.filter(pick => !foundPicks.has(pick.pick || pick.originalPick));
          if (missingGames.length === 0) {
            return { success: true, scores, missingGames: [] };
          }
        } else {
          missingGames = [...picks];
        }
      } catch (err) {
        console.error('Perplexity failed', err);
        missingGames = [...picks];
      }

      // 2. Ball Don't Lie for NBA
      if (missingGames.length > 0) {
        try {
          // Use the correct function name with proper capitalization
          const bdlScores = await ballDontLieService.getNbaGamesByDate(date);
          const remainingGames = [];
          for (const pick of missingGames) {
            const pickStr = pick.pick || pick.originalPick || '';
            const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
            if (!teamMatch || !teamMatch[1]) {
              remainingGames.push(pick);
              continue;
            }
            const teamName = teamMatch[1].trim();
            const league = (pick.league || 'NBA').toUpperCase();
            if (league === 'NBA' && bdlScores) {
              const gameKey = Object.keys(bdlScores).find(key =>
                key.toLowerCase().includes(teamName.toLowerCase())
              );
              if (gameKey) {
                scores[pick.pick || pick.originalPick] = {
                  ...bdlScores[gameKey],
                  league,
                  final: true
                };
                continue;
              }
            }
            remainingGames.push(pick);
          }
          missingGames = remainingGames;
        } catch (err) {
          console.error('BallDontLie failed', err);
        }
      }

      // 3. SportsDB for others
      if (missingGames.length > 0) {
        const remainingGames = [];
        for (const pick of missingGames) {
          const pickStr = pick.pick || pick.originalPick || '';
          const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
          if (!teamMatch?.[1]) {
            remainingGames.push(pick);
            continue;
          }
          const teamName = teamMatch[1].trim();
          const league = (pick.league || 'NBA').toUpperCase();
          // No longer using SportsDB API for results
          // We'll use The Odds API as primary source and Perplexity as fallback
          remainingGames.push(pick);
        }
        missingGames = remainingGames;
      }

      // 4. Final Perplexity pass if still missing
      if (missingGames.length > 0) {
        try {
          console.log('Making final attempt with Perplexity for remaining games...');
          // Use the perplexityService reference to call the function correctly
          const perplexityPromises = missingGames.map(async pick => {
            try {
              // Extract team names if not explicitly provided
              const pickStr = pick.pick || pick.originalPick || '';
              let homeTeam = pick.home_team;
              let awayTeam = pick.away_team;
              const league = pick.league || 'NBA';
              
              if (!homeTeam || !awayTeam) {
                // Extract team names from the pick string if not provided
                const teamMatch = pickStr.match(/([A-Za-z. ]+)\s+(?:@|vs\.?)\s+([A-Za-z. ]+)/i);
                if (teamMatch && teamMatch.length >= 3) {
                  awayTeam = teamMatch[1].trim();
                  homeTeam = teamMatch[2].trim();
                } else {
                  // If can't extract both teams, use what we can find
                  const singleTeamMatch = pickStr.match(/^([A-Za-z. ]+)/i);
                  const pickTeam = singleTeamMatch ? singleTeamMatch[1].trim() : '';
                  
                  if (!homeTeam && !awayTeam) {
                    // If we don't have either, use the extracted team as both for searching
                    homeTeam = pickTeam;
                    awayTeam = pickTeam;
                  } else if (!homeTeam) {
                    homeTeam = pickTeam;
                  } else if (!awayTeam) {
                    awayTeam = pickTeam;
                  }
                }
              }
              
              console.log(`Looking up results for ${awayTeam} @ ${homeTeam} (${league})`);
              
              // Use the exact date provided in the query
              const gameDate = new Date(date);
              const formattedDate = gameDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              
              // Use Perplexity directly for this specific score lookup
              const query = `What was the final score of the ${league} game involving ${awayTeam} on ${formattedDate}? Include the names of both teams and their scores. Respond with only the team names and the score.`;
              
              // Call perplexity directly instead of trying to use getScoresFromPerplexity
              const perplexityResponse = await perplexityService.fetchRealTimeInfo(query, {
                model: 'sonar',
                temperature: 0.1,
                maxTokens: 150
              });
              
              let result = { success: false };
              
              if (perplexityResponse) {
                // Try to extract the score using multiple patterns
                // Pattern 1: Standard format with scores between team names
                const scorePattern1 = /([A-Za-z\s.]+)\s*(\d+)[^\d]+(\d+)\s*([A-Za-z\s.]+)/i;
                // Pattern 2: Comma-separated format like "Team A 5, Team B 3"
                const scorePattern2 = /([A-Za-z][A-Za-z\s.\-']+)\s*(\d+)\s*,\s*([A-Za-z][A-Za-z\s.\-']+)\s*(\d+)/i;
                
                // Try each pattern in sequence
                let scoreMatch = perplexityResponse.match(scorePattern1);
                if (!scoreMatch) {
                  scoreMatch = perplexityResponse.match(scorePattern2);
                }
                
                if (scoreMatch && scoreMatch.length >= 5) {
                  console.log(`Successfully extracted score: ${scoreMatch[0]}`);
                  // Check if we matched against scorePattern2 (comma-separated format)
                  const isCommaFormat = scoreMatch[0].includes(',');
                  
                  let firstTeam, secondTeam, firstScore, secondScore;
                  
                  if (isCommaFormat) {
                    // In comma format, team names and scores are in different positions
                    // "Team A 5, Team B 3" => first = A, first score = 5, second = B, second score = 3
                    firstTeam = scoreMatch[1].trim();
                    firstScore = parseInt(scoreMatch[2]);
                    secondTeam = scoreMatch[3].trim();
                    secondScore = parseInt(scoreMatch[4]);
                  } else {
                    // Standard format: "Team A 5 - 3 Team B"
                    firstTeam = scoreMatch[1].trim();
                    secondTeam = scoreMatch[4].trim();
                    firstScore = parseInt(scoreMatch[2]);
                    secondScore = parseInt(scoreMatch[3]);
                  }
                  
                  // Add safety checks for undefined homeTeam, awayTeam, or firstTeam
                  const safeHomeTeam = homeTeam ? homeTeam.toLowerCase() : '';
                  const safeAwayTeam = awayTeam ? awayTeam.toLowerCase() : '';
                  const safeFirstTeam = firstTeam ? firstTeam.toLowerCase() : '';
                  const safeSecondTeam = secondTeam ? secondTeam.toLowerCase() : '';
                  
                  // Determine home/away scores using safer comparisons
                  let homeScore, awayScore;
                  
                  // Try to match team names
                  const firstMatchesHome = safeFirstTeam.includes(safeHomeTeam) || safeHomeTeam.includes(safeFirstTeam);
                  const secondMatchesHome = safeSecondTeam.includes(safeHomeTeam) || safeHomeTeam.includes(safeSecondTeam);
                  
                  if (firstMatchesHome) {
                    homeScore = firstScore;
                    awayScore = secondScore;
                  } else if (secondMatchesHome) {
                    homeScore = secondScore;
                    awayScore = firstScore;
                  } else {
                    // If no matches, make best guess (assume second team is home)
                    homeScore = secondScore;
                    awayScore = firstScore;
                  }
                  
                  result = {
                    success: true,
                    scores: {
                      [pickStr]: {
                        home_team: homeTeam || 'Unknown',
                        away_team: awayTeam || 'Unknown',
                        home_score: homeScore,
                        away_score: awayScore,
                        league: league,
                        final: true,
                        source: 'Perplexity'
                      }
                    }
                  };
                } else {
                  console.log(`Could not extract score pattern from response: ${perplexityResponse}`);
                }
              }
              
              return { 
                pick: pick.pick || pick.originalPick, 
                pickData: pick,
                result,
                processedTeams: { homeTeam, awayTeam, league }
              };
            } catch (err) {
              console.error(`Error getting scores for ${pick.pick || pick.originalPick}:`, err);
              return { pick: pick.pick || pick.originalPick, result: { success: false } };
            }
          });
          
          const perplexityResults = await Promise.all(perplexityPromises);
          const finalPerplexityScores = { success: true, scores: {} };
          
          perplexityResults.forEach(({ pick, pickData, result, processedTeams }) => {
            if (result && result.success && result.scores) {
              // Extract the score data
              const scores = result.scores;
              
              // Determine if the bet won by checking which team was picked
              let betResult = 'unknown';
              
              if (pickData) {
                const pickedTeam = pickData.pick?.split(/\s+/)[0] || '';
                const spreadMatch = pickData.pick?.match(/([+-]?\d+(\.\d+)?)/i);
                const hasSpread = spreadMatch && spreadMatch.length > 0;
                const spread = hasSpread ? parseFloat(spreadMatch[0]) : 0;
                
                // Check if we're dealing with a spread bet or moneyline
                if (hasSpread) {
                  // It's a spread bet
                  const isPicked = (team) => {
                    // Add safety checks for undefined variables
                    if (!pickedTeam || !team) return false;
                    const safePickedTeam = String(pickedTeam).toLowerCase();
                    const safeTeam = String(team).toLowerCase();
                    return safePickedTeam.includes(safeTeam);
                  };
                  let homeScore = parseInt(scores.home_score);
                  let awayScore = parseInt(scores.away_score);
                  
                  // Determine if home or away team was picked
                  if (isPicked(scores.home_team)) {
                    // Home team picked with spread
                    const adjustedScore = homeScore + spread;
                    if (adjustedScore > awayScore) {
                      betResult = 'won';
                    } else if (adjustedScore < awayScore) {
                      betResult = 'lost';
                    } else {
                      betResult = 'push';
                    }
                  } else if (isPicked(scores.away_team)) {
                    // Away team picked with spread
                    const adjustedScore = awayScore + spread;
                    if (adjustedScore > homeScore) {
                      betResult = 'won';
                    } else if (adjustedScore < homeScore) {
                      betResult = 'lost';
                    } else {
                      betResult = 'push';
                    }
                  }
                } else {
                  // It's a moneyline bet
                  const isPicked = (team) => {
                    // Add safety checks for undefined variables
                    if (!pickedTeam || !team) return false;
                    const safePickedTeam = String(pickedTeam).toLowerCase();
                    const safeTeam = String(team).toLowerCase();
                    return safePickedTeam.includes(safeTeam);
                  };
                  
                  if (isPicked(scores.home_team)) {
                    // Home team picked
                    betResult = scores.home_score > scores.away_score ? 'won' : 'lost';
                  } else if (isPicked(scores.away_team)) {
                    // Away team picked
                    betResult = scores.away_score > scores.home_score ? 'won' : 'lost';
                  }
                }
              }
              
              // Add the determined result to the scores object
              finalPerplexityScores.scores[pick] = {
                ...scores,
                result: betResult,
                final_score: `${scores.away_score}-${scores.home_score}`,
                processed_teams: processedTeams
              };
            }
          });
          
          if (finalPerplexityScores && finalPerplexityScores.success) {
            Object.assign(scores, finalPerplexityScores.scores || {});
            
            // Remove found games from missingGames
            Object.keys(finalPerplexityScores.scores || {}).forEach(foundPick => {
              const index = missingGames.findIndex(p => 
                (p.pick || p.originalPick) === foundPick
              );
              if (index !== -1) {
                missingGames.splice(index, 1);
              }
            });
          }
        } catch (finalError) {
          console.error('Final Perplexity attempt failed:', finalError);
        }
      }

      return {
        success: Object.keys(scores).length > 0 || missingGames.length === 0,
        scores,
        missingGames
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  generatePerplexityQuery: (homeTeam, awayTeam, date) => {
    // Don't query if both teams are the same or if one is a placeholder
    if (homeTeam === awayTeam || homeTeam === "Opponent" || awayTeam === "Opponent") {
      return null;
    }
    
    // Format date for human-readability
    const gameDate = new Date(date);
    const month = gameDate.toLocaleString('default', { month: 'long' });
    const day = gameDate.getDate();
    const year = gameDate.getFullYear();
    const humanDate = `${month} ${day}, ${year}`;

      // Use the exact date provided, not yesterday
    const formattedMonth = gameDate.toLocaleString('default', { month: 'short' });
    const formattedDay = gameDate.getDate();

    return `ONLY FACTUAL INFO: What was the EXACT final score of the game between ${awayTeam} and ${homeTeam} on ${formattedMonth} ${formattedDay}, ${year}? Respond in this JSON format only: {"home_score": X, "away_score": Y, "home_team": "${homeTeam}", "away_team": "${awayTeam}"}`;
  },

  getScoresFromPerplexity: async (date, picks) => {
    const scores = {};
    
    // Try getting scores from The Odds API first
    console.log('Getting scores from The Odds API...');
    let oddsApiScores = {};
    // We no longer use sportsDbScores since we've moved away from TheSportsDB
    
    try {
      // Try fetching from The Odds API first
      const leagues = ['nba', 'nhl', 'mlb'];
      for (const league of leagues) {
        try {
          console.log(`Fetching ${league.toUpperCase()} scores from The Odds API for ${date}`);
          const gameResults = await oddsService.getCompletedGamesByDate(league, date);
          
          if (gameResults && Array.isArray(gameResults)) {
            console.log(`Found ${gameResults.length} ${league.toUpperCase()} games from The Odds API`);
            
            gameResults.forEach(game => {
              if (game.completed) {
                const homeTeam = game.home_team;
                const awayTeam = game.away_team;
                const matchup = `${awayTeam} @ ${homeTeam}`;
                
                const homeScore = game.scores?.home || 0;
                const awayScore = game.scores?.away || 0;
                
                // Store by matchup
                oddsApiScores[matchup] = {
                  home_team: homeTeam,
                  away_team: awayTeam,
                  home_score: homeScore,
                  away_score: awayScore,
                  league: league.toUpperCase(),
                  final: true,
                  source: 'TheOddsAPI'
                };
                
                // Also store by team names for easier lookup
                oddsApiScores[homeTeam] = {
                  home_team: homeTeam,
                  away_team: awayTeam,
                  home_score: homeScore,
                  away_score: awayScore,
                  league: league.toUpperCase(),
                  final: true,
                  source: 'TheOddsAPI'
                };
                
                oddsApiScores[awayTeam] = {
                  home_team: homeTeam,
                  away_team: awayTeam,
                  home_score: homeScore,
                  away_score: awayScore,
                  league: league.toUpperCase(),
                  final: true,
                  source: 'TheOddsAPI'
                };
              }
            });
          }
        } catch (leagueError) {
          console.warn(`Error fetching ${league.toUpperCase()} scores from The Odds API:`, leagueError);
        }
      }
      
      // Add any games found to our scores object
      if (Object.keys(oddsApiScores).length > 0) {
        console.log(`Found ${Object.keys(oddsApiScores).length} total games from The Odds API`);
        Object.assign(scores, oddsApiScores);
      } else {
        console.log('No games found from The Odds API, will try Perplexity as fallback');
      }
    } catch (oddsApiError) {
      console.error('Error fetching from The Odds API:', oddsApiError.message);
    }

    // Process each pick
    for (const pick of picks) {
      const pickText = pick.pick || '';
      const league = pick.league || 'NHL'; // Default to NHL

      // Extract clean team name from formatted pick
      let teamName = '';
      
      // Extract teams from the pick if it has @ format
      const teams = pickText.split(' @ ');
      if (teams.length === 2) {
        // Use both teams for better query
        const homeTeam = teams[1].trim();
        const awayTeam = teams[0].trim();
        console.log(`Looking up results for ${awayTeam} @ ${homeTeam} (${league})`);
        
        // No longer using TheSportsDB for scores
        // Just defining matchupKey for logging purposes
        const matchupKey = `${awayTeam} @ ${homeTeam}`;
        
        // If we can't find scores in the database, use Perplexity as a fallback
        console.log(`No scores found in database for ${matchupKey}, using Perplexity as fallback`);
        
        // Create a focused query to get the final score
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const query = `What was the final score of the ${league} game: ${awayTeam} at ${homeTeam} on ${formattedDate}? Include the exact score for both teams. Do NOT add any explanation, just provide the team names and score.`;
        
        try {
          const result = await perplexityService.fetchRealTimeInfo(query, {
            model: 'sonar',
            temperature: 0.1,
            maxTokens: 150
          });
          
          if (result) {
            // Try to parse the result using multiple regex patterns
            // Escape regex special characters in team names
            const escAwayTeam = awayTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escHomeTeam = homeTeam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Pattern 1: Standard format with scores between team names
            const scorePattern1 = new RegExp(`(${escAwayTeam}|${escHomeTeam})\\s*(\\d+)[^\\d]+(\\d+)\\s*(${escHomeTeam}|${escAwayTeam})`, 'i');
            // Pattern 2: Comma-separated format like "Team A 5, Team B 3"
            const scorePattern2 = new RegExp(`(${escAwayTeam}|${escHomeTeam})\\s*(\\d+)\\s*,\\s*(${escHomeTeam}|${escAwayTeam})\\s*(\\d+)`, 'i');
            // Pattern 3: Generic comma-separated format when team names may not match exactly
            const scorePattern3 = /([A-Za-z][A-Za-z\s.\-']+)\s*(\d+)\s*,\s*([A-Za-z][A-Za-z\s.\-']+)\s*(\d+)/i;
            
            // Try each pattern in sequence
            let scoreMatch = result.match(scorePattern1);
            if (!scoreMatch) {
              scoreMatch = result.match(scorePattern2);
            }
            if (!scoreMatch) {
              scoreMatch = result.match(scorePattern3);
            }
            
            if (scoreMatch && scoreMatch.length >= 5) {
              // Determine which team is home and which is away
              // Check if we matched against a comma-separated format
              const isCommaFormat = scoreMatch[0].includes(',');
              
              let firstTeam, secondTeam, firstScore, secondScore;
              
              if (isCommaFormat) {
                // In comma format, team names and scores are in different positions
                // "Team A 5, Team B 3" => first = A, first score = 5, second = B, second score = 3
                firstTeam = scoreMatch[1].trim();
                firstScore = parseInt(scoreMatch[2]);
                secondTeam = scoreMatch[3].trim();
                secondScore = parseInt(scoreMatch[4]);
              } else {
                // Standard format: "Team A 5 - 3 Team B"
                firstTeam = scoreMatch[1].trim();
                secondTeam = scoreMatch[4].trim();
                firstScore = parseInt(scoreMatch[2]);
                secondScore = parseInt(scoreMatch[3]);
              }
              
              let homeScore, awayScore;
              
              if (firstTeam.toLowerCase().includes(homeTeam.toLowerCase())) {
                homeScore = firstScore;
                awayScore = secondScore;
              } else {
                homeScore = secondScore;
                awayScore = firstScore;
              }
              
              scores[pickText] = {
                home_team: homeTeam,
                away_team: awayTeam,
                home_score: homeScore,
                away_score: awayScore,
                league,
                final: true,
                source: 'Perplexity'
              };
              
              console.log(`Successfully extracted score for ${awayTeam} @ ${homeTeam}: ${awayScore}-${homeScore}`);
            } else {
              console.error(`Could not find score pattern in Perplexity response: ${result}`);
            }
          }
        } catch (error) {
          console.error(`Error with Perplexity API: ${error.message}`);
        }
      } else {
        // This is a formatted pick like "Team +1.5 -110"
        // Extract team name by removing betting elements
        teamName = pickText
          .replace(/\s+[+-]?\d+(\.\d+)?\s+[+-]\d+$/, '') // Remove spread and odds
          .replace(/\s+ML\s+[+-]\d+$/, '')               // Remove ML and odds
          .replace(/\s+[+-]\d+$/, '')                    // Remove just odds
          .replace(/\s+OVER\s+.*$/i, '')                 // Remove OVER
          .replace(/\s+UNDER\s+.*$/i, '')                // Remove UNDER
          .trim();
          
        console.log(`Extracted team name "${teamName}" from pick: ${pickText}`);
        
        // We no longer use TheSportsDB for scores
        // We use The Odds API as primary source and Perplexity as fallback
        
        // If we still don't have a match, use Perplexity as a fallback
        if (!scores[pickText]) {
          console.log(`No scores found in database for ${teamName}, using Perplexity as fallback`);
          
          // Create a query to find games involving this team
          console.log(`Raw date value received in getScoresFromPerplexity: ${date}, type: ${typeof date}`);
          
          // DEBUG: Parse the date string manually to avoid timezone issues
          let gameDate;
          if (typeof date === 'string' && date.includes('-')) {
            // Parse YYYY-MM-DD format manually to avoid timezone issues
            const [year, month, day] = date.split('-').map(num => parseInt(num, 10));
            // Note: month is 0-indexed in JavaScript Date
            gameDate = new Date(year, month - 1, day);
            console.log(`Date parsed manually: ${year}-${month}-${day} → ${gameDate.toISOString()}`);
          } else {
            gameDate = new Date(date);
          }
          
          // Format the date properly - use Eastern Time since all sports schedules use ET
          const formattedDate = gameDate.toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            timeZone: 'America/New_York'  // Use Eastern Time for sports schedules
          });
          console.log(`Querying for scores on date: ${formattedDate}`);
          const query = `What was the final score of the ${league} game involving ${teamName} on ${formattedDate}? Include the names of both teams and their scores. Respond with only the team names and the score.`;
          
          try {
            const result = await perplexityService.fetchRealTimeInfo(query, {
              model: 'sonar',
              temperature: 0.1,
              maxTokens: 150
            });
            
            if (result) {
              // Try to find team names and scores with enhanced regex patterns
              // Try JSON format first
              let match = null;
              
              try {
                const jsonMatch = result.match(/\{[^\}]+\}/g);
                if (jsonMatch) {
                  const jsonData = JSON.parse(jsonMatch[0]);
                  if (jsonData.home_score !== undefined && jsonData.away_score !== undefined) {
                    return {
                      away_team: jsonData.away_team,
                      home_team: jsonData.home_team,
                      away_score: parseInt(jsonData.away_score),
                      home_score: parseInt(jsonData.home_score),
                      league,
                      final: true,
                      source: 'Perplexity JSON'
                    };
                  }
                }
              } catch (jsonError) {
                console.log('Not a valid JSON response, trying text patterns');
              }
              
              // Try multiple regex patterns to handle different formatting
              const patterns = [
                // Pattern 1: Team A 3 - 2 Team B
                /(\w[\w\s.\-']+\w)\s+(\d+)\s*[-–]\s*(\d+)\s+(\w[\w\s.\-']+\w)/i,
                
                // Pattern 2: Team A defeated Team B 3-2
                /(\w[\w\s.\-']+\w)\s+(?:defeated|beat|won against)\s+(\w[\w\s.\-']+\w)\s+(?:by a score of|with a score of|)\s*(\d+)\s*[-–]\s*(\d+)/i,
                
                // Pattern 3: The final score was Team A 3, Team B 2
                /(?:final score|score)\s+(?:was|:|is)?\s*(\w[\w\s.\-']+\w)\s+(\d+)(?:,|\s+)\s*(\w[\w\s.\-']+\w)\s+(\d+)/i,
                
                // Pattern 4: Team A X, Team B Y (comma-separated format)
                /([\w\s.\-']+)\s+(\d+)\s*,\s*([\w\s.\-']+)\s+(\d+)/i,
                
                // Pattern 5: Another comma variation with possible period at end
                /([\w\s.\-']+)\s+(\d+),\s*([\w\s.\-']+)\s+(\d+)\.*/i,

                // Pattern 6: Simple Team A X - Y Team B without requiring spaces around dash
                /([\w\s.\-']+)\s(\d+)[-–](\d+)\s([\w\s.\-']+)/i,

                // Pattern 7: Handle "Team A X - Team B Y" format
                /([\w\s.\-']+)\s(\d+)\s*[-–]\s*([\w\s.\-']+)\s(\d+)/i
              ];
              
              // Try each pattern until we find a match
              for (const pattern of patterns) {
                const patternMatch = result.match(pattern);
                if (patternMatch && patternMatch.length >= 5) {
                  match = patternMatch;
                  break;
                }
              }
              
              // If no match yet, try a simpler pattern to just extract numbers
              if (!match) {
                const simpleScorePattern = /(\d+)\s*[-–]\s*(\d+)/i;
                const simpleMatch = result.match(simpleScorePattern);
                
                if (simpleMatch) {
                  // We found scores but not team names, use the teamName we have
                  const score1 = parseInt(simpleMatch[1]);
                  const score2 = parseInt(simpleMatch[2]);
                  
                  // For simple score patterns, try to extract full teams from the text
                  const teamsRegex = /([A-Z][A-Za-z\s.]+)\s+(?:vs|versus|@|at|against|and)\s+([A-Z][A-Za-z\s.]+)/i;
                  const teamsMatch = result.match(teamsRegex);
                  
                  let teamA = '';
                  let teamB = '';
                  
                  if (teamsMatch && teamsMatch.length >= 3) {
                    teamA = teamsMatch[1].trim();
                    teamB = teamsMatch[2].trim();
                  } else {
                    teamA = teamName;
                    
                    // Try to find the opponent team name
                    const potentialTeams = [];
                    for (const word of result.split(/\s+/)) {
                      if (word.length > 3 && !teamName.toLowerCase().includes(word.toLowerCase()) && 
                          !/^\d+$/.test(word) && !/^[\W_]+$/.test(word) && 
                          /^[A-Z]/.test(word)) {
                        potentialTeams.push(word);
                      }
                    }
                    
                    if (potentialTeams.length > 0) {
                      teamB = potentialTeams.join(' ');
                    } else {
                      teamB = 'Opponent';
                    }
                  }
                  
                  // Determine home vs away using text analysis
                  const isTeamAway = result.toLowerCase().includes('away') && 
                                     result.toLowerCase().includes(teamName.toLowerCase());
                  
                  // Verify the scores are valid
                  if (isNaN(score1) || isNaN(score2)) {
                    console.error(`Invalid scores for simple pattern: score1=${score1}, score2=${score2}`);
                    continue;
                  }
                  
                  if (isTeamAway) {
                    return {
                      away_team: teamA,
                      home_team: teamB,
                      away_score: score1,
                      home_score: score2,
                      league,
                      final: true,
                      source: 'Perplexity Simple'
                    };
                  } else {
                    return {
                      away_team: teamB,
                      home_team: teamA,
                      away_score: score2,
                      home_score: score1,
                      league,
                      final: true,
                      source: 'Perplexity Simple'
                    };
                  }
                }
              }
              
              if (match && match.length >= 5) {
                // Extract team names and scores
                let teamA = match[1].trim();
                let scoreA = match[2] ? parseInt(match[2]) : null;
                let teamB = match[3].trim();
                let scoreB = match[4] ? parseInt(match[4]) : null;
                
                // Verify we have valid numbers for scores
                if (isNaN(scoreA) || isNaN(scoreB)) {
                  console.error(`Invalid scores extracted: scoreA=${scoreA}, scoreB=${scoreB}`);
                  // Try to swap positions if pattern 7 was matched (Team A X - Team B Y)
                  if (isNaN(scoreB) && !isNaN(parseInt(match[4] || ''))) {
                    // This might be pattern 7 format
                    teamA = match[1].trim();
                    scoreA = parseInt(match[2] || 0);
                    teamB = match[3].trim();
                    scoreB = parseInt(match[4] || 0);
                  }
                }
                
                // Double-check score validity after potential correction
                if (isNaN(scoreA) || isNaN(scoreB)) {
                  console.error(`Still invalid scores after correction: scoreA=${scoreA}, scoreB=${scoreB}`);
                  continue;
                }
                
                // Create a proper score object with correct team name matching
                scores[pickText] = {
                  home_team: teamB,  // Second team is usually the home team in most formats
                  away_team: teamA,  // First team is usually the away team
                  home_score: scoreB,
                  away_score: scoreA,
                  league,
                  final: true,
                  source: 'Perplexity'
                };
                
                // If our search team is clearly the home team, swap if needed
                if (teamName.toLowerCase().includes('home') || 
                    (teamB.toLowerCase().includes(teamName.toLowerCase()) &&
                     !teamA.toLowerCase().includes(teamName.toLowerCase()))) {
                  // Keep as is - teamB is correctly the home team
                } else if (teamA.toLowerCase().includes(teamName.toLowerCase()) &&
                           !teamB.toLowerCase().includes(teamName.toLowerCase())) {
                  // Swap teams - our search team is in position A but should be home
                  scores[pickText] = {
                    home_team: teamA,
                    away_team: teamB,
                    home_score: scoreA,
                    away_score: scoreB,
                    league,
                    final: true,
                    source: 'Perplexity'
                  };
                }
                
                console.log(`Successfully extracted score for ${teamName}: ${scores[pickText].away_team} ${scores[pickText].away_score} - ${scores[pickText].home_team} ${scores[pickText].home_score}`);
              } else {
                console.error(`Could not find score pattern in Perplexity response: ${result}`);
              }
            }
          } catch (error) {
            console.error(`Error with Perplexity API: ${error.message}`);
          }
        }
      }
    }
    
    // Log the final scores we've collected
    console.log('Final collected scores:', JSON.stringify(scores, null, 2));

    return {
      success: Object.keys(scores).length > 0,
      scores
    };
  },

  processTeamPicks: (picks) => {
    const teamPicks = picks.map(pick => {
      const pickStr = pick.pick || '';
      const teamMatch = pickStr.match(/(?:^|vs\.?|@|vs?\s+)([A-Z][A-Za-z0-9\s.]+?)(?:\s*\+|\s*$)/);
      const teamName = teamMatch && teamMatch[1] ? teamMatch[1].trim() : '';
      return {
        ...pick,
        teamName,
        normalizedTeamName: teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
      };
    }).filter(pick => pick.teamName);
    const picksByLeague = {};
    teamPicks.forEach(pick => {
      const league = pick.league || 'unknown';
      if (!picksByLeague[league]) picksByLeague[league] = [];
      picksByLeague[league].push(pick);
    });
    return picksByLeague;
  },

  getLeagueUrls: () => ({
    nba: [
      'https://www.nba.com/scores',
      'https://www.espn.com/nba/scoreboard'
    ],
    mlb: [
      'https://www.mlb.com/scores',
      'https://www.espn.com/mlb/scoreboard'
    ],
    nhl: [
      'https://www.nhl.com/scores',
      'https://www.espn.com/nhl/scoreboard'
    ],
    unknown: [
      'https://www.espn.com/nba/scoreboard',
      'https://www.espn.com/mlb/scoreboard',
      'https://www.espn.com/nhl/scoreboard'
    ]
  }),

  checkResults: async (date) => {
    try {
      console.log(`Checking results for date: ${date}`);
      const { data: dailyPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      if (picksError) throw new Error(`Error fetching picks: ${picksError.message}`);
      if (!dailyPicks || !dailyPicks.picks || dailyPicks.picks.length === 0) {
        console.log(`No picks found for date: ${date}`);
        return { success: true, message: 'No picks found for this date', scores: {} };
      }
      
      console.log(`Found ${dailyPicks.picks.length} picks for ${date}`);
      const { success, scores, message } = await resultsCheckerService.getGameScores(date, dailyPicks.picks);
      if (!success) throw new Error(`Failed to get scores: ${message}`);
      
      console.log(`Retrieved scores for ${Object.keys(scores).length} games`);
      
      // Process each pick to determine win/loss/push based on scores and bet type
      const processedResults = [];
      
      for (const pick of dailyPicks.picks) {
        // Extract the team name from the pick by removing the bet type and odds
        // Example: "Washington Capitals +1.5 -185" becomes "Washington Capitals"
        // Example: "Dallas Stars ML +110" becomes "Dallas Stars"
        let teamName = '';
        
        if (pick.pick) {
          // Extract team name by removing bet type and odds
          teamName = pick.pick.replace(/\+?\d+(\.\d+)?\s+[-+]\d+$/, '').trim(); // Remove spread and odds
          teamName = teamName.replace(/\s+ML\s+[-+]\d+$/, '').trim(); // Remove ML and odds
          teamName = teamName.replace(/\s+[-+]\d+$/, '').trim(); // Remove just odds
          
          // Store the original team name for reference
          if (teamName !== pick.pick) {
            console.log(`Extracted team name "${teamName}" from pick: ${pick.pick}`);
            
            // Add team name to the pick object for easier matching
            pick.team_name = teamName;
          }
        }
        
        // Get the pick teams (homeTeam/awayTeam format) if available
        const pickTeams = pick.pick?.split(' @ ') || [];
        if (pickTeams.length !== 2 && !teamName && !pick.pick) {
          console.warn(`Invalid pick format: ${pick.pick}`);
          continue;
        }
        
        // Try to find the corresponding game score
        let scoreData = null;
        
        // First try direct match by pick
        if (scores[pick.pick]) {
          scoreData = scores[pick.pick];
        } else {
          // Try to find by team names in any order
          for (const [matchup, data] of Object.entries(scores)) {
            const homeTeam = data.home_team;
            const awayTeam = data.away_team;
            
            // Check if the extracted team name is part of either team in the matchup
            if (teamName && (homeTeam.includes(teamName) || awayTeam.includes(teamName) || 
                teamName.includes(homeTeam) || teamName.includes(awayTeam))) {
              console.log(`Found matching game for team "${teamName}": ${awayTeam} @ ${homeTeam}`);
              scoreData = data;
              break;
            }
            // Try traditional matching approaches as fallbacks
            else if ((pick.home_team === homeTeam && pick.away_team === awayTeam) ||
                (pickTeams.length === 2 && pickTeams[0] === awayTeam && pickTeams[1] === homeTeam) ||
                (matchup.includes(pick.home_team) && matchup.includes(pick.away_team))) {
              scoreData = data;
              break;
            }
          }
        }
        
        if (!scoreData) {
          console.warn(`Could not find score data for pick: ${pick.pick}`);
          continue;
        }

        console.log(`Analyzing pick ${pick.pick} with score data:`, scoreData);
        
        // Log the original confidence and type before processing
        console.log(`Processing pick with confidence: ${pick.confidence}, type: ${pick.type}`);
        
        // Use the new analyzer to determine the result, ensuring we pass the original confidence and type
        const pickWithId = { 
          ...pick, 
          id: dailyPicks.id,
          confidence: pick.confidence, // Ensure confidence is preserved
          type: pick.type || (pick.pick && pick.pick.includes('ML') ? 'moneyline' : (pick.pick && /[+\-]\d+\.?\d*/.test(pick.pick) ? 'spread' : 'moneyline'))
        };
        
        const analyzedResult = await pickResultsAnalyzer.analyzePickResult(pickWithId, scoreData);
        
        console.log(`PickResultsAnalyzer determined: ${analyzedResult.result} for pick: ${pick.pick}`);
        
        // Format the result for garyPerformanceService
        // CRITICAL: send pick_text as the original bet text from daily_picks table
        processedResults.push({
          // This is the matchup but we DON'T want this as pick_text
          matchup: analyzedResult.matchup,
          // These are the ACTUAL FULL PICK TEXT we want to store in DB
          pick: pick.pick,
          original_pick: pick.pick,
          pickText: pick.pick,
          pick_text: pick.pick,
          result: analyzedResult.result,
          score: analyzedResult.final_score,
          final_score: analyzedResult.final_score,
          league: analyzedResult.league,
          confidence: analyzedResult.confidence
        });
      }
      
      console.log(`Processed ${processedResults.length} results`);
      
      // Record the results in the performance service
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        processedResults
      );
      if (!recordSuccess) throw new Error(`Failed to record results: ${recordMessage}`);
      await garyPerformanceService.updatePerformanceStats(date);
      return {
        success: true,
        message: 'Results checked and recorded successfully',
        scores,
        pickCount: dailyPicks.picks.length,
        recorded: true
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.stack
      };
    }
  },

  startDailyResultsChecker: () => {
    // To be implemented
    return { success: true, message: 'Daily results checker started' };
  }
};

// Use named export only to avoid circular reference issues
