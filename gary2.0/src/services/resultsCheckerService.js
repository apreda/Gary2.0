import { supabase } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { pickResultsAnalyzer } from './pickResultsAnalyzer.js';
import { oddsService } from './oddsService.js';
import { garyPerformanceService } from './garyPerformanceService.js';

const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

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
        const parsed = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
        if (parsed && Array.isArray(parsed)) {
          const parsedPicks = parsed.map(pick => ({
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
        const parsed = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
        if (parsed && Array.isArray(parsed)) {
          const parsedPicks = parsed.map(pick => ({
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
      } catch (oddsError) {
        console.error('BDL scores helper error:', oddsError);
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
      
      // Using Ball Don't Lie for scores
      console.log(`Could not find score for ${league} game: ${awayTeam} @ ${homeTeam} from BDL`);
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

      // 1. Try Ball Don't Lie scores first
      try {
        // Use direct method call with proper reference - this now uses BDL internally
        const apiScores = await resultsCheckerService.getScoresFromBDL(date, picks);
        if (apiScores?.success && Object.keys(apiScores.scores || {}).length > 0) {
          Object.assign(scores, apiScores.scores);
          const foundPicks = new Set(Object.keys(scores));
          missingGames = picks.filter(pick => !foundPicks.has(pick.pick || pick.originalPick));
          if (missingGames.length === 0) {
            return { success: true, scores, missingGames: [] };
          }
        } else {
          missingGames = [...picks];
        }
      } catch (err) {
        console.error('BDL score fetch failed', err);
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

      // Log any missing games (no additional fallback available)
      if (missingGames.length > 0) {
        console.log(`⚠️ Still missing scores for ${missingGames.length} games after BDL lookups`);
        missingGames.forEach(pick => {
          console.log(`  - ${pick.pick || pick.originalPick} (${pick.league || 'Unknown'})`);
        });
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

  // DEPRECATED: generateScoreQuery - Legacy function
  // Keeping stub for backward compatibility
  generateScoreQuery: (homeTeam, awayTeam, date) => {
    // Don't query if both teams are the same or if one is a placeholder
    if (homeTeam === awayTeam || homeTeam === "Opponent" || awayTeam === "Opponent") {
      return null;
    }
    
    // Format date for human-readability
    const gameDate = new Date(date);
    const formattedMonth = gameDate.toLocaleString('default', { month: 'short' });
    const formattedDay = gameDate.getDate();
    const year = gameDate.getFullYear();

    return `What was the final score of the game between ${awayTeam} and ${homeTeam} on ${formattedMonth} ${formattedDay}, ${year}?`;
  },

  // NOTE: Renamed from getScoresFromOddsApi - now uses Ball Don't Lie via oddsService
  getScoresFromBDL: async (date, picks) => {
    const scores = {};

    // Get scores from Ball Don't Lie
    console.log('Getting scores from Ball Don\'t Lie...');
    let bdlScores = {};

    try {
      // Fetch from BDL for supported leagues
      const leagues = ['nba', 'nhl', 'mlb', 'nfl'];
      for (const league of leagues) {
        try {
          console.log(`Fetching ${league.toUpperCase()} scores from BDL for ${date}`);
          const gameResults = await oddsService.getCompletedGamesByDate(league, date);

          if (gameResults && Array.isArray(gameResults)) {
            console.log(`Found ${gameResults.length} ${league.toUpperCase()} games from BDL`);

            gameResults.forEach(game => {
              if (game.completed) {
                const homeTeam = game.home_team;
                const awayTeam = game.away_team;
                const matchup = `${awayTeam} @ ${homeTeam}`;

                const homeScore = game.scores?.home || 0;
                const awayScore = game.scores?.away || 0;

                const scoreData = {
                  home_team: homeTeam,
                  away_team: awayTeam,
                  home_score: homeScore,
                  away_score: awayScore,
                  league: league.toUpperCase(),
                  final: true,
                  source: 'BallDontLie'
                };

                // Store by matchup and team names for easier lookup
                bdlScores[matchup] = scoreData;
                bdlScores[homeTeam] = scoreData;
                bdlScores[awayTeam] = scoreData;

                // Also store normalized team names (lowercase)
                bdlScores[homeTeam.toLowerCase()] = scoreData;
                bdlScores[awayTeam.toLowerCase()] = scoreData;
              }
            });
          }
        } catch (leagueError) {
          console.warn(`Error fetching ${league.toUpperCase()} scores from BDL:`, leagueError);
        }
      }

      if (Object.keys(bdlScores).length > 0) {
        console.log(`Found ${Object.keys(bdlScores).length} total game entries from BDL`);
      } else {
        console.log('No games found from BDL');
      }
    } catch (bdlError) {
      console.error('Error fetching from BDL:', bdlError.message);
    }

    // Process each pick and match to BDL scores
    for (const pick of picks) {
      const pickText = pick.pick || '';
      const league = pick.league || 'NHL';

      // Extract teams from the pick if it has @ format
      const teams = pickText.split(' @ ');
      if (teams.length === 2) {
        const homeTeam = teams[1].trim();
        const awayTeam = teams[0].trim();
        const matchupKey = `${awayTeam} @ ${homeTeam}`;

        // Try to find in bdlScores
        if (bdlScores[matchupKey]) {
          scores[pickText] = bdlScores[matchupKey];
          console.log(`Found score for ${matchupKey}`);
        } else if (bdlScores[homeTeam]) {
          scores[pickText] = bdlScores[homeTeam];
          console.log(`Found score by home team: ${homeTeam}`);
        } else if (bdlScores[awayTeam]) {
          scores[pickText] = bdlScores[awayTeam];
          console.log(`Found score by away team: ${awayTeam}`);
        } else {
          console.log(`No score found for ${matchupKey} in BDL data`);
        }
      } else {
        // Extract team name from formatted pick
        const teamName = pickText
          .replace(/\s+[+-]?\d+(\.\d+)?\s+[+-]\d+$/, '')
          .replace(/\s+ML\s+[+-]\d+$/, '')
          .replace(/\s+[+-]\d+$/, '')
          .replace(/\s+OVER\s+.*$/i, '')
          .replace(/\s+UNDER\s+.*$/i, '')
          .trim();
          
        // Try to match team name
        if (bdlScores[teamName]) {
          scores[pickText] = bdlScores[teamName];
          console.log(`Found score for ${teamName}`);
        } else if (bdlScores[teamName.toLowerCase()]) {
          scores[pickText] = bdlScores[teamName.toLowerCase()];
          console.log(`Found score for ${teamName} (normalized)`);
        } else {
          // Try partial match
          const matchingKey = Object.keys(bdlScores).find(key => 
            key.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(key.toLowerCase())
          );
          if (matchingKey) {
            scores[pickText] = bdlScores[matchingKey];
            console.log(`Found score for ${teamName} via partial match: ${matchingKey}`);
          } else {
            console.log(`No score found for ${teamName}`);
          }
        }
      }
    }
    
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
