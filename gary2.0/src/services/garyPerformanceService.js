import { supabase } from '../supabaseClient.js';
import resultCalculator from './resultCalculator.js';

// Constants for validation and configuration
const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;

// Add the confidence column to the database if it doesn't exist
async function ensureConfidenceColumn() {
  try {
    // For now, let's just check if we can query the game_results table
    // without trying to modify the schema, since we're not storing
    // confidence as a separate column
    const { data, error } = await supabase
      .from('game_results')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Error checking game_results table:', error);
    } else {
      console.log('Successfully connected to game_results table');
    }
  } catch (error) {
    console.error('Error connecting to game_results table:', error);
  }
}

// Run the column check when the module loads
ensureConfidenceColumn();
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Generate a random UUID v4
 * @returns {string} A valid UUID
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, 
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

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

/**
 * Service for tracking Gary's pick performance
 */
export const garyPerformanceService = {
  /**
   * Fetch Gary's win/loss record from game_results table
   * @param {Object} filters - Optional filters for date range, league, etc.
   * @returns {Promise<Object>} Gary's performance statistics
   */
  getGaryPerformance: async (filters = {}) => {
    try {
      // Query game_results table to get all pick results
      let query = supabase
        .from('game_results')
        .select('*');
      
      // Apply filters if provided
      if (filters.startDate) {
        query = query.gte('game_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('game_date', filters.endDate);
      }
      if (filters.league) {
        query = query.eq('league', filters.league);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching Gary\'s performance data:', error);
        return { success: false, error };
      }
      
      // Calculate overall performance
      const wins = data.filter(record => record.result === 'won').length;
      const losses = data.filter(record => record.result === 'lost').length;
      const pushes = data.filter(record => record.result === 'push').length;
      const total = wins + losses + pushes;
      
      // Calculate win rate (exclude pushes from the calculation)
      const decisiveGames = total - pushes;
      const winRate = decisiveGames > 0 ? (wins / decisiveGames) * 100 : 0;
      
      // Create performance summary
      const summary = {
        total,
        wins,
        losses,
        pushes,
        winRate: parseFloat(winRate.toFixed(1)),
        record: `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`,
      };
      
      // Calculate performance by league
      const sportBreakdown = [];
      const leagues = [...new Set(data.map(record => record.league))];
      
      for (const league of leagues) {
        const leagueData = data.filter(record => record.league === league);
        const leagueWins = leagueData.filter(record => record.result === 'won').length;
        const leagueLosses = leagueData.filter(record => record.result === 'lost').length;
        const leaguePushes = leagueData.filter(record => record.result === 'push').length;
        const leagueTotal = leagueWins + leagueLosses + leaguePushes;
        const leagueDecisive = leagueTotal - leaguePushes;
        const leagueWinRate = leagueDecisive > 0 ? (leagueWins / leagueDecisive) * 100 : 0;
        
        sportBreakdown.push({
          name: league,
          icon: league === 'NBA' ? '🏀' : 
                league === 'MLB' ? '⚾' :
                league === 'NFL' ? '🏈' :
                league === 'NHL' ? '🏒' : '🎯',
          record: `${leagueWins}-${leagueLosses}${leaguePushes > 0 ? `-${leaguePushes}` : ''}`,
          winRate: parseFloat(leagueWinRate.toFixed(1)),
          totalBets: leagueTotal,
          // Add these properties for the chart to use
          wins: leagueWins,
          losses: leagueLosses,
          pushes: leaguePushes,
          total: leagueTotal
        });
      }
      
      return { 
        success: true, 
        summary, 
        sportBreakdown,
        // Return raw data as well if needed elsewhere
        data
      };
    } catch (error) {
      console.error('Error in getPerformanceStats:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Update performance stats from existing game_results
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  updatePerformanceStats: async (date) => {
    try {
      console.log(`Updating performance stats for ${date} from game_results table`);
      
      // Get results directly from game_results table
      const { data: gameResults, error: resultsError } = await supabase
        .from('game_results')
        .select('*')
        .eq('game_date', date);
      
      if (resultsError) {
        console.error('Error fetching game results for stats update:', resultsError);
        return { success: false, error: resultsError, message: 'Error fetching game results' };
      }
      
      if (!gameResults || gameResults.length === 0) {
        console.log(`No game results found for ${date} to update stats`);
        return { success: false, message: `No game results found for ${date}` };
      }
      
      console.log(`Found ${gameResults.length} game results for ${date}, processing stats...`);
      
      // Here you would process the stats as needed
      // For now, we'll just return success
      
      return { 
        success: true, 
        message: `Processed stats for ${gameResults.length} results from ${date}`,
        count: gameResults.length
      };
    } catch (error) {
      console.error('Error updating performance stats:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Manually record the results of Gary's picks with enhanced validation and batching
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @param {Array} results - Array of objects with pick and result fields
   * @returns {Promise<{ success: boolean, message: string, stats?: Object }>}
   */
  recordPickResults: async (date, results) => {
    console.log(`Recording ${results.length} results for ${date}...`);
    
    // Validate inputs
    if (!date || !results || !Array.isArray(results)) {
      return { success: false, message: 'Invalid date or results' };
    }
    
    try {
      // Check if there are existing results for this date
      console.log(`Checking for existing results for ${date}...`);
      const { data: existingResults, error: checkError } = await supabase
        .from('game_results')
        .select('*')
        .eq('game_date', date);
      
      if (checkError) {
        console.error('Error checking for existing results:', checkError);
        return { success: false, message: checkError.message };
      }
      // Find or create the daily_picks entry for this date
      const { data: dailyPick, error: dailyPickError } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('date', date)
        .single();
      
      if (dailyPickError && dailyPickError.code !== 'PGRST116') {
        console.error('Error finding daily_picks entry:', dailyPickError);
        return { success: false, message: dailyPickError.message };
      }
      
      const dailyPickId = dailyPick?.id;
      if (!dailyPickId) {
        console.warn(`No daily_picks entry found for ${date}`);
      } else {
        console.log(`Found daily pick for ${date} with ID ${dailyPickId}`);
      }
      
      // Process the results
      const processedResults = [];
      const validationErrors = [];
      
      for (let i = 0; i < results.length; i++) {
        try {
          const result = results[i];
          
          // Extract pick from various result formats
          let finalPickText = '';
          const possibleFields = ['pick', 'original_pick', 'pickText', 'pick_text'];
          
          for (const field of possibleFields) {
            if (result[field] && typeof result[field] === 'string') {
              finalPickText = result[field];
              console.log(`Recovered pick text from result.${field}: "${finalPickText}"`);
              break;
            }
          }
          
          // If still no valid pick text, create a descriptive placeholder
          if (!finalPickText || finalPickText === 'result') {
            finalPickText = result.homeTeam && result.awayTeam ?
              `Pick for ${result.awayTeam} @ ${result.homeTeam}` :
              `Unknown Pick ${i + 1}`;
            console.log(`Created descriptive placeholder: "${finalPickText}"`);
          }
          
          // Get the final score in the correct format
          let finalScore = result.final_score || result.score;
          
          // Get the matchup in standard format
          let matchup = result.matchup || finalPickText;
          
          // Create processed result object with fields matching the DB schema
          const processedResult = {
            pick_id: dailyPickId,
            game_date: date,
            league: result.league || 'Unknown',
            result: result.result,
            final_score: finalScore,
            pick_text: finalPickText,
            matchup: matchup,
            confidence: result.confidence || null
          };
          
          // Ensure result is valid (won, lost, push)
          if (!processedResult.result || !validateResult(processedResult.result)) {
            console.warn(`Invalid result '${processedResult.result}' for ${finalPickText}, trying fallback validation...`);
            
            // Convert unknown or invalid values to valid ones if possible
            if (processedResult.result === 'win') processedResult.result = 'won';
            else if (processedResult.result === 'loss') processedResult.result = 'lost';
            else if (processedResult.result === 'tie') processedResult.result = 'push';
            else if (processedResult.result === 'unknown' || !processedResult.result) {
              validationErrors.push(`Invalid result value: ${processedResult.result} for pick: ${finalPickText}`);
              continue;
            }
          }
          
          // Validate final score format if present
          if (processedResult.final_score && !validateScore(processedResult.final_score)) {
            validationErrors.push(`Invalid score format: ${processedResult.final_score} for pick: ${finalPickText}`);
            continue;
          }
          
          processedResults.push(processedResult);
        } catch (error) {
          console.error(`Error processing result ${i + 1}:`, error);
          validationErrors.push(`Error processing result: ${error.message}`);
        }
      }
      
      // Log validation errors if any
      if (validationErrors.length > 0) {
        console.warn(`Found ${validationErrors.length} validation errors:`, validationErrors);
      }
      
      if (processedResults.length > 0) {
        console.log(`Inserting ${processedResults.length} results into game_results...`);
        console.log('Sample result being inserted:', processedResults[0]);
        
        const { data: insertData, error: insertError } = await supabase
          .from('game_results')
          .insert(processedResults);
        
        if (insertError) {
          console.error('Error inserting results:', insertError);
          return { success: false, message: insertError.message };
        }
      }
      
      // Update performance stats after successfully recording results
      await garyPerformanceService.updatePerformanceStats(date);
      
      return {
        success: true,
        message: `Successfully recorded ${processedResults.length} results for ${date}. ${validationErrors.length} validation errors.`,
        stats: {
          added: processedResults.length,
          errors: validationErrors.length
        },
        recorded: true
      };
    } catch (error) {
      console.error('Error recording pick results:', error);
      return { 
        success: false, 
        message: `Failed to record results: ${error.message}`,
        error: error.stack
      };
    }
  },
  
  /**
   * Add a test result to the game_results table (for testing/demo purposes)
   */
  addTestResult: async (league = 'NBA', result = 'won') => {
    try {
      const { data, error } = await supabase
        .from('game_results')
        .insert({
          pick_id: `test-${Date.now()}`,
          game_date: new Date().toISOString().split('T')[0],
          league,
          result,
          final_score: 'Test Score 105-98'
        })
        .select();
        
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error adding test result:', error);
      return { success: false, error };
    }
  }
};
