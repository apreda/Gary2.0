import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { sportsDbApiService } from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import { perplexityService } from './perplexityService';
import { userPickResultsService } from './userPickResultsService';

// Constants for validation and configuration
const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Database indexes to be created (run these in your database)
/*
CREATE INDEX IF NOT EXISTS idx_game_results_pick_id ON public.game_results(pick_id);
CREATE INDEX IF NOT EXISTS idx_game_results_game_date ON public.game_results(game_date);
CREATE INDEX IF NOT EXISTS idx_game_results_league ON public.game_results(league);
*/

/**
 * Validates the result value
 * @param {string} result - The result to validate
 * @returns {boolean} True if valid, false otherwise
 */
const validateResult = (result) => {
  if (!VALID_RESULTS.has(result)) {
    console.error(`Invalid result: ${result}. Must be one of: ${Array.from(VALID_RESULTS).join(', ')}`);
    return false;
  }
  return true;
};

/**
 * Validates the score format
 * @param {string} score - The score to validate (e.g., "100-98")
 * @returns {boolean} True if valid, false otherwise
 */
const validateScore = (score) => {
  if (!SCORE_REGEX.test(score)) {
    console.error(`Invalid score format: ${score}. Expected format: "##-##"`);
    return false;
  }
  return true;
};

/**
 * Retry wrapper for API calls
 * @param {Function} fn - The function to retry
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise<*>} The result of the function
 */
const withRetry = async (fn, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      console.error(`Max retries reached. Error: ${error.message}`);
      throw error;
    }
    console.warn(`Retry attempt ${MAX_RETRIES - retries + 1}/${MAX_RETRIES}. Retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 1.5); // Exponential backoff
  }
};

// Create a Supabase client with admin privileges that bypasses RLS
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://wljxcsmijuhnqumstxvr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
const adminSupabase = SUPABASE_SERVICE_KEY ? 
  createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : 
  supabase; // Fallback to regular client if no service key

// Initialize services
sportsDbApiService.initialize();

/**
 * Results checker service for evaluating sports betting picks
 * Handles fetching picks, getting game scores, and evaluating results
 */
export const resultsCheckerService = {
  /**
   * Get yesterday's picks from the database
   * @returns {Promise<Object>} Picks data with success flag
   */
  getYesterdaysPicks: async () => {
    try {
      // Calculate yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const formattedDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log(`Fetching picks for yesterday (${formattedDate})`);
      
      // Get picks from Supabase
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', formattedDate)
        .single();
      
      if (error) {
        console.error('Error fetching yesterday\'s picks:', error);
        return { success: false, message: error.message };
      }
      
      if (!data || !data.picks || data.picks.length === 0) {
        console.log('No picks found for yesterday');
        return { success: false, message: 'No picks found for yesterday' };
      }
      
      console.log(`Found ${data.picks.length} picks for yesterday`);
      return { success: true, data: data.picks, date: formattedDate, id: data.id };
    } catch (error) {
      console.error('Error in getYesterdaysPicks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get scores for Gary's picks using multiple data sources with fallback strategy
   * Tries Ball Don't Lie (NBA) / SportsDB first, falls back to Perplexity if needed
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} picks - Array of Gary's picks from the database
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getGameScores: async function(date, picks) {
    try {
      if (!picks || picks.length === 0) {
        console.log('No picks provided to check scores for');
        return { success: false, message: 'No picks provided' };
      }
      
      console.log(`Fetching scores for ${picks.length} picks from ${date}`);
      const scores = {};
      const missingGames = [];
      
      // 1. Try primary sources first (Ball Don't Lie for NBA, SportsDB for others)
      for (const pick of picks) {
        // Extract team names from the pick string
        const pickStr = pick.pick || '';
        const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
        
        if (!teamMatch || !teamMatch[1]) {
          console.warn(`Could not extract team name from pick: ${pickStr}`);
          missingGames.push(pick);
          continue;
        }
        
        const teamName = teamMatch[1].trim();
        const isNBA = (pick.league || '').toLowerCase() === 'nba';
        
        try {
          if (isNBA) {
            // Try Ball Don't Lie for NBA games
            const bdlScores = await ballDontLieService.getGamesByDate(date);
            if (bdlScores) {
              // Find the game that includes the team name
              const gameKey = Object.keys(bdlScores).find(key => 
                key.toLowerCase().includes(teamName.toLowerCase())
              );
              
              if (gameKey) {
                scores[teamName] = bdlScores[gameKey];
                console.log(`Found NBA score from Ball Don't Lie: ${teamName}`);
                continue;
              }
            }
          }
          
          // Try SportsDB for all sports
          const sportsDbScores = await sportsDbApiService.getScores(date, pick.league);
          if (sportsDbScores) {
            // Find the game that includes the team name
            const gameKey = Object.keys(sportsDbScores).find(key => 
              key.toLowerCase().includes(teamName.toLowerCase())
            );
            
            if (gameKey) {
              scores[teamName] = sportsDbScores[gameKey];
              console.log(`Found score from SportsDB: ${teamName}`);
              continue;
            }
          }
          
          // If we get here, we couldn't find the score from primary sources
          missingGames.push(pick);
          
        } catch (error) {
          console.warn(`Error fetching score for ${teamName} from primary sources:`, error);
          missingGames.push(pick);
        }
      }
      
      // 2. If we have missing games, try Perplexity as a fallback
      if (missingGames.length > 0) {
        console.log(`Couldn't find scores for ${missingGames.length} games, trying Perplexity...`);
        const perplexityScores = await resultsCheckerService.getScoresFromPerplexity(date, missingGames);
        
        if (perplexityScores && perplexityScores.success) {
          Object.assign(scores, perplexityScores.scores || {});
        }
      }
      
      return { success: true, scores };
      
    } catch (error) {
      console.error('Error in getGameScores:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get scores for Gary's picks from Perplexity API by searching league websites
   * Used as a fallback when primary sources fail
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} picks - Array of Gary's picks from the database
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  /**
   * Get scores for Gary's picks from Perplexity API by searching league websites
   * Used as a fallback when primary sources fail
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} picks - Array of Gary's picks from the database
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getScoresFromPerplexity: async function(date, picks) {
    try {
      if (!picks || picks.length === 0) {
        console.log('No picks provided to check scores for');
        return { success: false, message: 'No picks provided' };
      }
      
      console.log(`Getting scores for ${picks.length} picks from Perplexity for ${date}`);
      
      // Format date for display (e.g., "Wednesday, May 14, 2025")
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const scores = {};
      const errors = [];
      
      // Process each pick
      for (const pick of picks) {
        try {
          if (!pick.pick) {
            console.warn('Skipping pick with no pick text');
            continue;
          }
          
          console.log(`Searching for: ${pick.pick} (${pick.league || 'no league'})`);
          
          // Extract team names from the pick text if possible
          const teamMatch = pick.pick.match(/([\w\s]+)(?:\s+[-+]?\d+\.?\d*|ML|\+\d+)?(?:\s+vs\.?\s+|\s+at\s+|\s+@\s+)([\w\s]+)/i);
          let team1 = '';
          let team2 = '';
          
          if (teamMatch && teamMatch.length >= 3) {
            team1 = teamMatch[1].trim();
            team2 = teamMatch[2].trim();
          } else {
            // Fallback to using the entire pick text
            team1 = pick.pick;
          }
          
          // Create a search query for Perplexity
          let searchQuery = `What was the final score for ${team1}`;
          if (team2) {
            searchQuery += ` vs ${team2}`;
          }
          searchQuery += ` on ${formattedDate}? Only respond with the score in format "AwayScore-HomeScore" if found.`;
          
          console.log(`Search query: "${searchQuery}"`);
          
          // Call Perplexity API with the search method
          const response = await perplexityService.search(searchQuery, {
            maxTokens: 50, // We only need a short response
            temperature: 0.1 // More deterministic for scores
          });
          
          if (response.success && response.data) {
            // Try to extract score from response
            const scoreMatch = response.data.match(/(\d+)-(\d+)/);
            if (scoreMatch) {
              const [_, awayScore, homeScore] = scoreMatch;
              // Determine if the score is in the correct order (away-home)
              const score = parseInt(awayScore) > parseInt(homeScore) ? 
                `${awayScore}-${homeScore}` : `${homeScore}-${awayScore}`;
                
              scores[pick.pick] = score;
              console.log(`Found score for ${pick.pick}: ${score}`);
            } else {
              console.log(`No score found in response for ${pick.pick}`);
              errors.push(`No score found for ${pick.pick}`);
            }
          } else {
            console.error(`Error from Perplexity for ${pick.pick}:`, response.error);
            errors.push(`API error for ${pick.pick}: ${response.error}`);
          }
          
          // Add a small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1500));
          
        } catch (error) {
          console.error(`Error processing pick ${pick.pick || 'unknown'}:`, error);
          errors.push(`Error processing ${pick.pick || 'unknown pick'}: ${error.message}`);
        }
      }
      
      return {
        success: errors.length === 0,
        scores,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      console.error('Error in getScoresFromPerplexity:', error);
      return {
        success: false,
        error: error.message,
        scores: {}
      };
    }
  },

  // Other helper methods...
  
  /**
   * Process team picks and group them by league
   * @param {Array} picks - Array of pick objects
   * @returns {Object} Picks grouped by league
   */
  /**
   * Process team picks and group them by league
   * @param {Array} picks - Array of pick objects
   * @returns {Object} Picks grouped by league
   */
  processTeamPicks: (picks) => {
    const teamPicks = picks.map(pick => {
      const pickStr = pick.pick || '';
      const teamMatch = pickStr.match(/(?:^|vs\.?|@|vs?\s+)([A-Z][A-Za-z0-9\s.]+?)(?:\s*\+|\s*$)/);
      const teamName = teamMatch && teamMatch[1] ? teamMatch[1].trim() : '';
      
      if (!teamName) {
        console.warn(`Could not extract team name from pick: ${pickStr}`);
      }
      
      return {
        ...pick,
        teamName,
        normalizedTeamName: teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
      };
    }).filter(pick => pick.teamName); // Filter out picks without valid team names
    
    // Group picks by league
    const picksByLeague = {};
    teamPicks.forEach(pick => {
      const league = pick.league || 'unknown';
      if (!picksByLeague[league]) {
        picksByLeague[league] = [];
      }
      picksByLeague[league].push(pick);
    });
    
    return picksByLeague;
  },
  
  /**
   * Get league-specific score URLs
   * @returns {Object} URLs for different leagues
   */
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
  checkResults: async function(date) {
    try {
      console.log(`Checking results for date: ${date}`);
      
      // 1. Get the picks for the specified date
      const { data: dailyPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      
      if (picksError) {
        throw new Error(`Error fetching picks: ${picksError.message}`);
      }
      
      if (!dailyPicks || !dailyPicks.picks || dailyPicks.picks.length === 0) {
        return { success: true, message: 'No picks found for this date', scores: {} };
      }
      
      console.log(`Found ${dailyPicks.picks.length} picks to check`);
      
      // 2. Get scores using fallback strategy
      const { success, scores, message } = await this.getGameScores(
        date,
        dailyPicks.picks
      );
      
      if (!success) {
        throw new Error(`Failed to get scores: ${message}`);
      }
      
      // 3. Record the results in game_results table via garyPerformanceService
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        Object.entries(scores).map(([matchup, score]) => ({
          pick: `${score.away_team} @ ${score.home_team}`,
          result: score.final ? 'won' : 'lost',
          score: `${score.away_score}-${score.home_score}`,
          league: score.league || 'NBA' // Default to NBA if not specified
        }))
      );
      
      if (!recordSuccess) {
        throw new Error(`Failed to record results: ${recordMessage}`);
      }
      
      // 4. Update performance metrics for the given date
      await garyPerformanceService.updatePerformanceStats(date);
      
      return { 
        success: true, 
        message: 'Results checked and recorded successfully',
        scores,
        pickCount: dailyPicks.picks.length,
        recorded: true
      };
      
    } catch (error) {
      console.error('Error in checkResults:', error);
      return { 
        success: false, 
        message: error.message,
        error: error.stack
      };
    }
  },
  
  /**
   * Start a daily job to check results automatically
   * @returns {Object} Status of the operation
   */
  startDailyResultsChecker: () => {
    // Implementation will be added here
    return { success: true, message: 'Daily results checker started' };
  }
};

export default resultsCheckerService;
