import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';

export const resultsCheckerService = {
  /**
   * Get yesterday's picks from the database
   * @returns {Promise<Array>} Array of picks
   */
  getYesterdaysPicks: async () => {
    try {
      // Calculate yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const formattedDate = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      
      console.log(`Fetching picks for date: ${formattedDate}`);
      
      // Get the picks from the daily_picks table using the date column
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', formattedDate)
        .maybeSingle();

      if (error) throw error;

      if (!data || !data.picks) {
        return { success: false, message: `No picks found for ${formattedDate}` };
      }

      return { 
        success: true, 
        data: data.picks,
        date: formattedDate
      };
    } catch (error) {
      console.error('Error fetching yesterday\'s picks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Check results for picks using Perplexity API
   * @param {string} date - Date of the picks
   * @param {Array} picks - Array of picks to check
   * @returns {Promise} API response with results
   */
  checkResultsWithAI: async (picks, date) => {
    try {
      console.log(`Checking results for picks on ${date}:`, picks);
      
      // Format the date for display
      const displayDate = date;
      
      // Create a formatted query for Perplexity
      const query = `I need to check the results for these sports picks from ${displayDate}. For each pick, tell me if it won, lost, or pushed.

For each pick, search for the related game and provide THE EXACT PICK TEXT followed by either "won", "lost", or "push", and include the final score when applicable.

Response format must be structured as a JSON array of objects, each with fields 'pick', 'result', and 'score'.

Picks: ${JSON.stringify(picks, null, 2)}`;
      
      console.log(`Using Perplexity API for checking results`);
      
      // Use the Perplexity service to make the API call
      const responseText = await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar-medium-online', // Better model for complex sports analysis
        temperature: 0.2,  // Low temperature for more consistent factual responses
        maxTokens: 2000    // Allow enough tokens for all the results
      });
      
      // Create a simulated response object for compatibility with the rest of the code
      const response = {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: responseText
            }
          }]
        })
      };
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Perplexity API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // Parse the response to extract the results
      const assistantMessage = responseData.choices[0].message.content;
      console.log('Perplexity response:', assistantMessage);
      
      // Extract JSON from the response
      let results;
      try {
        // Try to parse JSON directly
        results = JSON.parse(assistantMessage);
      } catch (e) {
        // If direct parsing fails, try to extract JSON from the text
        const jsonMatch = assistantMessage.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse results from Perplexity response');
        }
      }
      
      // Validate results format
      if (!Array.isArray(results)) {
        throw new Error('Expected results to be an array');
      }
      
      // Make sure each result has the required fields
      const validatedResults = results.map(result => ({
        pick: result.pick || '',
        result: ['won', 'lost', 'push'].includes(result.result.toLowerCase()) 
          ? result.result.toLowerCase() 
          : 'unknown',
        score: result.score || 'N/A'
      }));
      
      return { 
        success: true, 
        results: validatedResults 
      };
    } catch (error) {
      console.error('Error checking results with AI:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Automate the whole process of getting picks and recording results
   * @returns {Promise} Results of the operation
   */
  automateResultsChecking: async () => {
    try {
      // Step 1: Get yesterday's picks
      const picksResponse = await resultsCheckerService.getYesterdaysPicks();
      
      if (!picksResponse.success) {
        return picksResponse; // Return error
      }
      
      // Step 2: Check results with AI
      const resultsResponse = await resultsCheckerService.checkResultsWithAI(
        picksResponse.data, 
        picksResponse.date
      );
      
      if (!resultsResponse.success) {
        return resultsResponse; // Return error
      }
      
      // Step 3: Record the results
      const recordResponse = await garyPerformanceService.recordPickResults(
        picksResponse.date,
        resultsResponse.results
      );
      
      return recordResponse;
    } catch (error) {
      console.error('Error automating results checking:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Check the status of the Perplexity API key
   * @returns {Promise<boolean>} True if the API key is valid, false otherwise
   */
  checkApiKeyStatus: async () => {
    try {
      // The API key is already loaded in the perplexityService
      if (!perplexityService.API_KEY) {
        return false;
      }
      
      // Try a simple query to check if the key is valid
      try {
        await perplexityService.fetchRealTimeInfo('Hello', {
          model: 'sonar-small-online', // Use smallest model for quick check
          maxTokens: 10 // Minimal tokens needed
        });
        return true;
      } catch (error) {
        // If there's an error with the API key, this will fail
        console.error('Error checking Perplexity API key status:', error);
        return false;
      }
    } catch (error) {
      console.error('Error checking Perplexity API key status:', error);
      return false;
    }
  },
  
  /**
   * Start a daily job to check results automatically
   */
  startDailyResultsChecker: () => {
    // Set up a daily job that runs at a specific time (e.g., 10 AM)
    const checkTime = new Date();
    checkTime.setHours(10, 0, 0, 0); // 10 AM
    
    let timeUntilCheck = checkTime.getTime() - Date.now();
    
    // If it's already past the check time, schedule for tomorrow
    if (timeUntilCheck < 0) {
      timeUntilCheck += 24 * 60 * 60 * 1000; // Add 24 hours
    }
    
    console.log(`Scheduled results checking in ${timeUntilCheck / (1000 * 60 * 60)} hours`);
    
    // Schedule the first check
    setTimeout(async () => {
      await resultsCheckerService.automateResultsChecking();
      
      // Schedule daily checks thereafter
      setInterval(async () => {
        await resultsCheckerService.automateResultsChecking();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, timeUntilCheck);
    
    return { success: true, message: 'Daily results checker started' };
  }
};
