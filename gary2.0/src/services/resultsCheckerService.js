import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import sportsDbApiService from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import openaiService from './openaiService';
import { extractJsonFromText } from '../utils/helpers';
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
   * Get scores for games from Perplexity API by searching league websites
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getScoresFromPerplexity: async (date) => {
    try {
      // Format date in a reader-friendly way for the query
      const dateObj = new Date(date);
      const formattedDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      console.log(`Getting scores from Perplexity for ${formattedDate}`);
      
      // League-specific URLs for scores
      const urls = [
        'https://www.mlb.com/scores',           // MLB scores
        'https://www.nba.com/scores',           // NBA scores
        'https://www.nhl.com/scores',           // NHL scores
        'https://www.espn.com/mlb/scoreboard',  // ESPN MLB scores
        'https://www.espn.com/nba/scoreboard',  // ESPN NBA scores
        'https://www.espn.com/nhl/scoreboard'   // ESPN NHL scores
      ];
      
      // Create a query that searches for scores from all major sports sites
      const query = `${formattedDate} ${urls.join(' OR ')}`;
      
      // Get the response from Perplexity
      const response = await perplexityService.search({
        query,
        maxResults: 10,
        includeDomains: urls
      });
      
      // Process the response to extract scores
      const scores = {};
      
      // This is a simplified example - you'll need to adapt this based on the actual response format
      if (response.answers && response.answers.length > 0) {
        response.answers.forEach(answer => {
          // Process each answer to extract scores
          // This is a placeholder - you'll need to implement the actual parsing logic
          console.log('Processing answer:', answer.substring(0, 200) + '...');
        });
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
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Results of the operation
   */
  checkResults: async (date) => {
    try {
      // Implementation will be added here
      return { success: true };
    } catch (error) {
      console.error('Error in checkResults:', error);
      return { success: false, message: error.message };
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
