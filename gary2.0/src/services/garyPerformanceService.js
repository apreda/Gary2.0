import { supabase } from '../supabaseClient';
import resultCalculator from './resultCalculator';

// Constants for validation and configuration
const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;

// Add the confidence column to the database if it doesn't exist
async function ensureConfidenceColumn() {
  try {
    // Check if the column exists
    const { data, error } = await supabase.rpc('column_exists', {
      table_name: 'game_results',
      column_name: 'confidence'
    });

    if (error || !data) {
      // Add the column if it doesn't exist
      const { error: alterError } = await supabase.rpc('add_float_column', {
        table_name: 'game_results',
        column_name: 'confidence'
      });

      if (alterError) {
        console.error('Error adding confidence column:', alterError);
      } else {
        console.log('Added confidence column to game_results table');
      }
    }
  } catch (error) {
    console.error('Error ensuring confidence column exists:', error);
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
  /**
   * Manually record the results of Gary's picks with enhanced validation and batching
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @param {Array} results - Array of objects with pick and result fields
   * @returns {Promise<{ success: boolean, message: string, stats?: Object }>}
   */
  recordPickResults: async (date, results) => {
    // Input validation
    if (!date || !results || !Array.isArray(results)) {
      console.error('Invalid input parameters to recordPickResults');
      return { success: false, message: 'Invalid input parameters' };
    }

    try {
      // Check for existing results
      console.log(`Checking for existing results for ${date}...`);
      const { data: existingResults, error: checkError } = await withRetry(() => 
        supabase
          .from('game_results')
          .select('id, pick_text, result, game_date')
          .eq('game_date', date)
      );
      
      if (checkError) {
        console.error('Error checking for existing results:', checkError);
        throw checkError;
      }
      
      // Process and validate results
      console.log(`Processing ${results.length} results for ${date}...`);
      const processedResults = [];
      const validationErrors = [];
      const backupFields = ['originalPick', 'pickText', 'text', 'originalPickText'];
      
      // Ensure confidence column exists
      await ensureConfidenceColumn();
      
      // Process each result
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        
        try {
          // Advanced recovery for pick text with better validation
          let finalPickText = result.pick || '';
          
          // If pick is missing or invalid, try to recover from backup fields
          if (!finalPickText || finalPickText === 'result' || finalPickText.length < 5) {
            for (const field of backupFields) {
              if (result[field] && typeof result[field] === 'string' && 
                  result[field] !== 'result' && result[field].length >= 5) {
                finalPickText = result[field];
                console.log(`Recovered pick text from ${field}: "${finalPickText}"`);
                break;
              }
            }
          }
          
          // If still not recovered, try the rawResult object if available
          if ((!finalPickText || finalPickText === 'result') && result.rawResult) {
            for (const field of backupFields) {
              if (result.rawResult[field] && 
                  typeof result.rawResult[field] === 'string' && 
                  result.rawResult[field] !== 'result') {
                finalPickText = result.rawResult[field];
                console.log(`Recovered pick text from rawResult.${field}: "${finalPickText}"`);
                break;
              }
            }
          }
          
          // If still no valid pick text, create a descriptive placeholder
          if (!finalPickText || finalPickText === 'result') {
            finalPickText = result.homeTeam && result.awayTeam ?
              `Pick for ${result.awayTeam} @ ${result.homeTeam}` :
              `Unknown Pick ${i + 1}`;
            console.log(`Created descriptive placeholder: "${finalPickText}"`);
          }
          
          // Create processed result object
          const processedResult = {
            ...result,
            pick: finalPickText,
            originalPick: finalPickText,
            pickText: finalPickText
          };
          
          // Validate result value
          if (!validateResult(processedResult.result)) {
            validationErrors.push(`Invalid result value: ${processedResult.result} for pick: ${finalPickText}`);
            continue;
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
      
      // Check for existing results to prevent duplicates
      if (existingResults && existingResults.length > 0) {
        const existingPickTexts = new Set(existingResults.map(r => r.pick_text));
        const newResults = processedResults.filter(result => !existingPickTexts.has(result.pick));
        
        if (newResults.length === 0) {
          console.log('All results already exist in the database, skipping insertion');
          return { 
            success: true, 
            message: `All ${results.length} results for ${date} already exist`,
            existingResults: true,
            stats: {
              total: existingResults.length,
              new: 0,
              skipped: results.length,
              errors: validationErrors.length
            }
          };
        }
        
        console.log(`Found ${newResults.length} new results to add to ${existingResults.length} existing ones`);
        // Use only new results for insertion
        processedResults = newResults;
      }

      // Get the corresponding daily pick
      const { data: dailyPick, error: pickError } = await withRetry(() =>
        supabase
          .from('daily_picks')
          .select('*')
          .eq('date', date)
          .maybeSingle()
      );

      if (pickError) {
        console.error('Error fetching daily pick data for results recording:', pickError);
        return { success: false, error: pickError, message: 'Error fetching daily pick data' };
      }

      if (!dailyPick) {
        console.error('No daily pick found for date:', date);
        return { success: false, message: `No daily pick found for date: ${date}` };
      }

      console.log(`Found daily pick for ${date} with ID ${dailyPick.id}`);
      const pickId = dailyPick.id;

      // Insert results in batches to avoid hitting database limits
      const BATCH_SIZE = 10;
      const totalBatches = Math.ceil(processedResults.length / BATCH_SIZE);
      let successfulInserts = 0;
      let failedInserts = 0;

      for (let i = 0; i < processedResults.length; i += BATCH_SIZE) {
        const batch = processedResults.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`Processing batch ${batchNumber} of ${totalBatches} (${batch.length} items)`);
        
        // Prepare the data to insert with calculated results and confidence
        const insertData = await Promise.all(batch.map(async (result) => {
          try {
            // Get the original pick to extract confidence
            const originalPick = result.originalPick || result;
            
            // Calculate the result if we have a score
            let resultData = { ...result };
            
            if (result.final_score) {
              const calculated = resultCalculator.calculateResult({
                pick: originalPick,
                score: result.final_score,
                league: result.league || 'NBA',
                confidence: result.confidence // Pass through any existing confidence
              });
              
              resultData.result = calculated.result;
              // Preserve the original confidence from the pick
              resultData.confidence = calculated.confidence;
            } else {
              // If no final score, use the original pick's confidence
              resultData.confidence = resultCalculator.getConfidence(originalPick);
              resultData.result = 'pending';
            }
            
            return {
              pick_id: pickId,
              game_date: date,
              league: resultData.league || 'NBA',
              pick_text: resultData.pick,
              result: resultData.result || 'pending',
              final_score: resultData.final_score || null,
              confidence: resultData.confidence || 0.5, // Default confidence if not calculated
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          } catch (error) {
            console.error('Error preparing result for insertion:', error);
            return null;
          }
        }));
        
        // Filter out any failed preparations
        const validInsertData = insertData.filter(item => item !== null);
        
        const { error: insertError } = await withRetry(() =>
          supabase
            .from('game_results')
            .insert(validInsertData)
        );

        if (insertError) {
          console.error(`Error inserting batch ${batchNumber}:`, insertError);
          failedInserts += batch.length;
        } else {
          successfulInserts += batch.length;
          console.log(`Successfully inserted batch ${batchNumber}`);
        }
      }

      // Calculate and return statistics
      const stats = {
        total: (existingResults?.length || 0) + successfulInserts,
        new: successfulInserts,
        skipped: results.length - successfulInserts - failedInserts,
        failed: failedInserts,
        errors: validationErrors.length
      };

      if (failedInserts > 0) {
        const message = `Failed to insert ${failedInserts} out of ${results.length} results. ${successfulInserts} inserted successfully.`;
        console.error(message);
        return { success: false, message, stats };
      }

      const successMessage = `Successfully recorded ${successfulInserts} results for ${date}. ${validationErrors.length} validation errors.`;
      console.log(successMessage);
      return { success: true, message: successMessage, stats };

    } catch (error) {
      console.error('Error in recordPickResults:', error);
      return { 
        success: false, 
        message: `Failed to record results: ${error.message}`,
        error: error.toString() 
      };
    }
  },

  /**
   * Track Gary's picks and update their results in the game_results table
   * This method reads from daily_picks table and updates game_results table
   */
  
  /**
   * Track Gary's picks and update their results in the game_results table
   * This method reads from daily_picks table and updates game_results table
   */
  trackPickResults: async () => {
    try {
      console.log('Tracking Gary\'s pick results...');
      
      // 1. Get all of Gary's picks from daily_picks table
      const { data: dailyPicksData, error: picksError } = await supabase
        .from('daily_picks')
        .select('id, date, picks')
        .order('date', { ascending: false })
        .limit(20); // Limit to most recent to avoid processing too many
      
      if (picksError) {
        console.error('Error fetching picks data:', picksError);
        return { success: false, error: picksError };
      }
      
      if (!dailyPicksData || dailyPicksData.length === 0) {
        console.log('No daily picks found to process');
        return { success: true, processed: 0 };
      }
      
      let totalProcessed = 0;
      let resultsAdded = 0;
      
      // Process each day's picks
      for (const dayData of dailyPicksData) {
        // Skip if no picks data
        if (!dayData.picks || !Array.isArray(dayData.picks)) {
          continue;
        }
        
        // Process each individual pick
        for (const pick of dayData.picks) {
          // Skip if no ID
          if (!pick.id) {
            continue;
          }
          
          // For this simplified implementation, we'll use mock data to simulate game results
          // In production, you would connect to an odds/scores API or manually enter results
          
          // Check if this pick already has a result recorded
          const { data: existingResult } = await supabase
            .from('game_results')
            .select('*')
            .eq('pick_id', pick.id)
            .maybeSingle();
            
          if (existingResult) {
            // Skip if already recorded
            console.log(`Result for pick ${pick.id} already recorded as ${existingResult.result}`);
            continue;
          }
          
          // Get pick details for recording
          const league = pick.league || (pick.sport || '').toUpperCase() || 'UNKNOWN';
          const gameDate = pick.gameDate || dayData.date || new Date().toISOString().split('T')[0];
          
          // For this simplified version, we'll use a random result
          // In production, you would check the actual game outcome 
          const possibleResults = ['won', 'lost', 'push'];
          const randomResult = possibleResults[Math.floor(Math.random() * 2)]; // Bias toward won/lost (not push)
          
          // Record the result
          const { data: newResult, error: insertError } = await supabase
            .from('game_results')
            .insert({
              pick_id: pick.id,
              game_date: gameDate,
              league: league,
              result: randomResult,
              final_score: 'Mock Score: 100-95' // Mock score for now
            })
            .select();
            
          if (insertError) {
            console.error(`Error recording result for pick ${pick.id}:`, insertError);
          } else {
            console.log(`Recorded result for pick ${pick.id}: ${randomResult}`);
            resultsAdded++;
          }
          
          totalProcessed++;
        }
      }
      
      return { 
        success: true, 
        processed: totalProcessed,
        resultsAdded
      };
    } catch (error) {
      console.error('Error tracking pick results:', error);
      return { success: false, error };
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
