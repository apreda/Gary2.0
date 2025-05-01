import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { openaiService } from './openaiService';

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
      
      // Get the picks from the daily_picks table
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('created_at', formattedDate)
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
   * Check results for picks using OpenAI's API
   * @param {string} date - Date of the picks
   * @param {Array} picks - Array of picks to check
   * @returns {Promise} API response with results
   */
  checkResultsWithAI: async (date, picks) => {
    try {
      console.log(`Checking results for picks on ${date}:`, picks);
      
      // Format the date for the prompt
      const displayDate = new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      // Use the existing OpenAI API key from openaiService
      const apiKey = openaiService.API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured - please check the openaiService');
      }
      
      console.log('Using OpenAI API key from openaiService');
      
      // Prepare data for the OpenAI API call
      const data = {
        model: "gpt-4o", // or any model with web browsing capabilities
        messages: [
          {
            role: "system",
            content: "You are a sports betting analyst who can accurately determine if bets won and lost based on game results. Use the web browser tool to check actual game results from ESPN, CBS Sports, or other reliable sports sites."
          },
          {
            role: "user",
            content: `Here are my sports picks from ${displayDate}. I need you to check if each pick won, lost, or pushed.

For each pick, provide THE EXACT PICK TEXT followed by either "won", "lost", or "push", and the final score when applicable.

Response format must be structured as a JSON array of objects, each with fields 'pick', 'result', and 'score'.

Picks: ${JSON.stringify(picks, null, 2)}`
          }
        ],
        tools: [{ type: "web_browser" }]
      };
      
      // Make the API call
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // Parse the response to extract the results
      const assistantMessage = responseData.choices[0].message.content;
      console.log('OpenAI response:', assistantMessage);
      
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
          throw new Error('Could not parse results from OpenAI response');
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
        picksResponse.date, 
        picksResponse.data
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
