import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { sportsDbApiService } from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import openaiService from './openaiService';
import { perplexityService } from './perplexityService';
import { userPickResultsService } from './userPickResultsService';

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
  getGameScores: async (date, picks) => {
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
        const isNBA = (pick.sport || '').toLowerCase().includes('nba');
        const key = `${pick.away_team} @ ${pick.home_team}`.toLowerCase();
        
        try {
          if (isNBA) {
            // Try Ball Don't Lie for NBA games
            const bdlScores = await ballDontLieService.getGamesByDate(date);
            if (bdlScores && bdlScores[key]) {
              scores[key] = bdlScores[key];
              console.log(`Found NBA score from Ball Don't Lie: ${key}`);
              continue;
            }
          }
          
          // Try SportsDB for all sports
          const sportsDbScores = await sportsDbApiService.getScores(date);
          if (sportsDbScores && sportsDbScores[key]) {
            scores[key] = sportsDbScores[key];
            console.log(`Found score from SportsDB: ${key}`);
            continue;
          }
          
          // If we get here, we couldn't find the score from primary sources
          missingGames.push(pick);
          
        } catch (error) {
          console.warn(`Error fetching score for ${key} from primary sources:`, error);
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
  getScoresFromPerplexity: async (date, picks) => {
    try {
      if (!picks || picks.length === 0) {
        console.log('No picks provided to check scores for');
        return { success: false, message: 'No picks provided' };
      }
      
      // Helper function to normalize team names for matching
      const normalizeTeamName = (name) => {
        if (!name) return '';
        return name.trim().toLowerCase()
          .replace(/[^a-z0-9]/g, '') // Remove special chars
          .replace(/(?<=\w)(s|z)$/i, ''); // Handle common pluralizations
      };

      // Format date in a reader-friendly way for the query
      const dateObj = new Date(date);
      const formattedDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      console.log(`Getting scores for ${picks.length} picks from ${formattedDate}`);
      
      // League-specific URLs for scores
      const urls = [
        'https://www.mlb.com/scores',           // MLB scores
        'https://www.nba.com/scores',           // NBA scores
        'https://www.nhl.com/scores',           // NHL scores
        'https://www.espn.com/mlb/scoreboard',  // ESPN MLB scores
        'https://www.espn.com/nba/scoreboard',  // ESPN NBA scores
        'https://www.espn.com/nhl/scoreboard'   // ESPN NHL scores
      ];
      
      // Create a map to store scores by matchup
      const scores = {};
      
      // Process each pick to create specific queries
      for (const pick of picks) {
        try {
          if (!pick.home_team || !pick.away_team) {
            console.warn('Pick is missing team information:', pick);
            continue;
          }
          
          const sport = pick.sport || 'basketball_nba'; // Default to NBA if not specified
          const league = sport.split('_')[1]?.toUpperCase() || 'NBA'; // Extract NBA/MLB/NHL
          
          // Create a specific query for this game with strict format
          const query = `
            ${formattedDate} ${pick.away_team} @ ${pick.home_team} final score ${league} game.
            Only include if the game has completed with final scores.
            Do not include if the game is in progress, postponed, or scheduled.
            
            Respond STRICTLY in this exact format:
            FINAL ${pick.away_team} @ ${pick.home_team}: XX-XX
            
            Where:
            - First team is always the away team
            - Second team is always the home team
            - Use @ symbol to separate team names
            - Use colon and space before the score
            - Use hyphen between scores (away score first, then home score)
            
            Example: FINAL LAL @ BOS: 102-100
            
            Do not add any other text, commentary, or explanations.
            Data sources: ${urls.join(' OR ')}
          `;
          
          console.log(`Searching for: ${pick.away_team} vs ${pick.home_team} (${league})`);
          
          // Get the response from Perplexity
          const response = await perplexityService.search({
            query: query.replace(/\s+/g, ' ').trim(), // Clean up whitespace
            maxResults: 3, // Fewer results since we're being specific
            includeDomains: urls,
            focus: 'scores',
            format: 'text'
          });
          
          // Process the response to extract the score with improved parsing
          if (response.answers && response.answers.length > 0) {
            const answer = response.answers[0];
            
            // Match format: FINAL AWAY @ HOME: AWAY_SCORE-HOME_SCORE
            const scoreMatch = answer.match(/FINAL\s+([^@]+)@([^:]+):\s*(\d+)-(\d+)/i);
            
            if (scoreMatch) {
              const awayTeam = scoreMatch[1].trim();
              const homeTeam = scoreMatch[2].trim();
              const awayScore = parseInt(scoreMatch[3], 10);
              const homeScore = parseInt(scoreMatch[4], 10);
              
              // Create consistent matchup key
              const matchupKey = `${awayTeam} @ ${homeTeam}`.toLowerCase();
              
              // Verify we're not mixing up home/away
              const normalizedAway = normalizeTeamName(awayTeam);
              const normalizedPickAway = normalizeTeamName(pick.away_team);
              const normalizedHome = normalizeTeamName(homeTeam);
              const normalizedPickHome = normalizeTeamName(pick.home_team);
              
              const awayMatches = normalizedAway.includes(normalizedPickAway) || 
                               normalizedPickAway.includes(normalizedAway);
              const homeMatches = normalizedHome.includes(normalizedPickHome) || 
                               normalizedPickHome.includes(normalizedHome);
              
              if (!awayMatches || !homeMatches) {
                console.warn(`Team name mismatch for ${matchupKey} - expected ${pick.away_team} @ ${pick.home_team}`);
                continue;
              }
              
              scores[matchupKey] = {
                home_team: homeTeam,
                away_team: awayTeam,
                home_score: homeScore,
                away_score: awayScore,
                final: true,
                source: 'perplexity',
                processed_at: new Date().toISOString()
              };
              
              console.log(`Found score: ${awayTeam} ${awayScore}-${homeScore} ${homeTeam}`);
            } else {
              console.warn(`Could not parse score from: ${answer.substring(0, 100).replace(/\n/g, ' ')}...`);
            }
          }
          
          // Add delay between requests to avoid rate limiting (increased from 1000ms)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Error processing pick ${pick.away_team} @ ${pick.home_team}:`, error);
          continue;
        }
      }
      
      return { success: true, scores };
    } catch (error) {
      console.error('Error in getScoresFromPerplexity:', error);
      return { success: false, message: error.message };
    }
  },
  
  // Other methods will be added here
  
  /**
   * Check results for picks from a specific date
   * @param {string} date - Date in YYYY-MM-DD format (YYYY-MM-DD)
   * @returns {Promise<Object>} Results of the operation
   */
  checkResults: async (date) => {
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
      const { success, scores, message } = await resultsCheckerService.getGameScores(
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
      
      // 4. Update performance metrics
      await garyPerformanceService.updatePerformanceMetrics(dailyPicks.picks, scores);
      
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
