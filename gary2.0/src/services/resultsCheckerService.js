import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';

/**
 * Manually parse results from text response when JSON parsing fails
 * @param {string} text - The text response from Perplexity
 * @returns {Array} - Array of pick results objects
 */
const parseResultsManually = (text) => {
  console.log('Manual parsing of:', text);
  
  // Initialize results array
  const results = [];
  
  // Split the text by lines or by clear separators
  const lines = text.split(/\n|\r|\.|\*|•/);
  
  // Look for patterns like "[Pick text] won/lost/push [score]" in each line
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    // Skip lines that are clearly not about results
    if (line.startsWith('I found') || line.startsWith('Here are') || 
        line.startsWith('Based on') || line.includes('search for')) {
      continue;
    }
    
    // Try to extract pick text
    let pickMatch = line.match(/"([^"]+)"|'([^']+)'|^([^:]+):|^(.+?)(?=won|lost|push)/i);
    if (!pickMatch) continue;
    
    const pickText = (pickMatch[1] || pickMatch[2] || pickMatch[3] || pickMatch[4] || '').trim();
    if (!pickText || pickText.length < 5) continue; // Skip too short matches
    
    // Try to find result
    const resultMatch = line.toLowerCase().match(/(won|lost|push)/);
    if (!resultMatch) continue;
    
    const result = resultMatch[1];
    
    // Try to extract score if present
    const scoreMatch = line.match(/\d+[-–]\d+|\(.*?\)/);
    const score = scoreMatch ? scoreMatch[0] : '';
    
    // Add to results
    results.push({
      pick: pickText,
      result: result,
      score: score
    });
  }
  
  // If we found any results, return them
  if (results.length > 0) {
    console.log(`Manually parsed ${results.length} results:`, results);
    return results;
  }
  
  // If manual parsing failed, throw error
  throw new Error('Manual parsing could not extract any valid results');
};

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
      
      // Extract only the essential pick information
      const simplifiedPicks = picks.map(pick => ({
        pick: pick.pick,
        league: pick.league,
        awayTeam: pick.awayTeam,
        homeTeam: pick.homeTeam,
        time: pick.time
      }));
      
      console.log('Simplified picks for Perplexity:', simplifiedPicks);
      
      // Create a formatted query for Perplexity with explicit instructions to search for real game results
      const query = `I need to check the REAL RESULTS for these sports picks from ${displayDate}. You MUST search the web to find the actual final scores and outcomes of these games.

IMPORTANT INSTRUCTIONS:
1. For each pick, search for the actual game that happened on ${displayDate} between the teams mentioned
2. Find the REAL final score of that game
3. Based on the final score, determine if the pick "won", "lost", or was a "push" according to sports betting rules
4. Include the actual final score for each game

Response format must be structured as a JSON array of objects, each with fields 'pick', 'result', and 'score'.

Picks: ${JSON.stringify(simplifiedPicks, null, 2)}`;
      
      console.log(`Using Perplexity API for checking results`);
      
      // Use the Perplexity service to make the API call
      const responseText = await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar-medium-online', // Better model for complex sports analysis
        temperature: 0.1,  // Very low temperature for more consistent factual responses
        maxTokens: 4000    // Doubled token limit to ensure all results are returned
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
      
      // Extract JSON from the response using multiple approaches
      let results;
      try {
        // First attempt: Direct parsing if it's clean JSON
        results = JSON.parse(assistantMessage.trim());
      } catch (e) {
        console.log('Direct JSON parsing failed, trying to extract JSON from text');
        try {
          // Second attempt: Find JSON array pattern [{ ... }] with regex
          const jsonArrayMatch = assistantMessage.match(/\[\s*\{.*\}\s*\]/s);
          if (jsonArrayMatch) {
            results = JSON.parse(jsonArrayMatch[0]);
          } else {
            // Third attempt: Look for JSON inside code blocks
            const codeBlockMatch = assistantMessage.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              results = JSON.parse(codeBlockMatch[1].trim());
            } else {
              // Fourth attempt: Find any sequence that looks like JSON objects
              const jsonObjectsMatch = assistantMessage.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
              if (jsonObjectsMatch && jsonObjectsMatch[0]) {
                results = JSON.parse(jsonObjectsMatch[0]);
              } else {
                // Fifth attempt: Parse manually if all else fails
                console.log('Attempting to manually parse the response');
                results = parseResultsManually(assistantMessage);
              }
            }
          }
        } catch (nestedError) {
          console.error('All JSON parsing attempts failed:', nestedError);
          throw new Error('Could not parse results from Perplexity response. Check console for details.');
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
