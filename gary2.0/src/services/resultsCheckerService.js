import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';
import { sportsDbApiService } from './sportsDbApiService';

// Initialize services
sportsDbApiService.initialize();

/**
 * Parse JSON results from Perplexity response
 * @param {string} text - The text response from Perplexity
 * @returns {Array} - Array of pick results objects
 */
const parseResultsFromText = (text) => {
  console.log('Parsing results from text:', text.substring(0, 200) + '...');
  
  // Try to extract JSON from a code block first (most common format from Perplexity)
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      const jsonArray = JSON.parse(jsonBlockMatch[1]);
      if (Array.isArray(jsonArray) && jsonArray.length > 0) {
        console.log(`Successfully extracted ${jsonArray.length} results from JSON block`);
        return jsonArray;
      }
    } catch (e) {
      console.log('Failed to parse JSON block:', e.message);
    }
  }
  
  // If we couldn't extract JSON from a code block, try to find it elsewhere in the text
  try {
    // Look for arrays in the text that might be JSON
    const possibleJson = text.match(/\[\s*\{[\s\S]*\}\s*\]/g);
    if (possibleJson && possibleJson[0]) {
      const jsonArray = JSON.parse(possibleJson[0]);
      if (Array.isArray(jsonArray) && jsonArray.length > 0) {
        console.log(`Found and parsed JSON array with ${jsonArray.length} results`);
        return jsonArray;
      }
    }
  } catch (e) {
    console.log('Failed to find JSON array in text:', e.message);
  }
  
  console.log('Could not parse results as JSON, returning empty array');
  return [];
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
      const formattedDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log(`Fetching picks for yesterday (${formattedDate})`);
      
      // Query the database for yesterday's picks
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
   * Get sports events data from TheSportsDB API
   * @param {string} date - The date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Game events data
   */
  getSportsEventsByDate: async (date) => {
    try {
      console.log(`Fetching all sports events for ${date}`);
      const events = await sportsDbApiService.getMultiSportEvents(date);
      return { 
        success: true, 
        events: events
      };
    } catch (error) {
      console.error('Error fetching events from TheSportsDB API:', error);
      return { 
        success: false, 
        message: error.message, 
        events: [] 
      };
    }
  },
  
  /**
   * Evaluate picks against game results using Perplexity
   * @param {Array} picks - The original picks array
   * @param {string} date - The date in YYYY-MM-DD format
   * @param {Array} gameEvents - The game events from TheSportsDB API
   * @returns {Promise<Object>} - Results of the evaluation
   */
  checkAllResultsWithPerplexity: async (picks, date, gameEvents) => {
    try {
      console.log(`Evaluating ${picks.length} picks against ${gameEvents.length} games for ${date}`);
      
      // Prepare a simple format of picks for Perplexity
      const simplifiedPicks = picks.map(pick => {
        // Extract just the essential information
        return {
          pick: pick.pick,
          league: pick.league,
          homeTeam: pick.homeTeam,
          awayTeam: pick.awayTeam,
          time: pick.time || '7:00 PM ET'
        };
      });
      
      // Format game events for the prompt
      let gameResultsText = '';
      if (gameEvents && gameEvents.length > 0) {
        gameResultsText = '📊 ACTUAL GAME RESULTS:\\n';
        gameEvents.forEach(event => {
          // Only include events with scores
          if (event.intHomeScore && event.intAwayScore) {
            gameResultsText += `${event.strLeague}: ${event.strAwayTeam} ${event.intAwayScore} @ ${event.strHomeTeam} ${event.intHomeScore}\\n`;
          }
        });
      }
      
      // Build the query for Perplexity that preserves original pick text
      const query = `I have the following sports results from ${date} and need to evaluate if specific betting picks won or lost:

${gameResultsText}
🎲 BETTING PICKS TO EVALUATE:
${simplifiedPicks.map((pick, index) => {
  return `${index + 1}. ${pick.league} | Pick: "${pick.pick}" | Game: ${pick.awayTeam} @ ${pick.homeTeam}`;
}).join('\\n')}

For each numbered pick:
1. Find the corresponding game in the results
2. Determine if the pick "won", "lost", or was a "push" according to sports betting rules
3. Provide the actual final score that determined the result

Betting Rules:
- Spread bets (e.g. "Team +3.5"): Add the spread to the team's score. If that total exceeds the opponent's score, the bet wins.
- Moneyline bets (e.g. "Team ML"): Simply pick the winner of the game.
- Over/Under bets (e.g. "OVER 220.5"): If the total combined score is over the number, an OVER bet wins. If under, an UNDER bet wins.

VERY IMPORTANT INSTRUCTIONS:
1. The 'pick' field in your response MUST EXACTLY MATCH the original pick text I provided (e.g., "UNDER 204.5 -110")
2. DO NOT replace the pick text with any generic value like "result" or anything else
3. Copy the exact pick text from the "🎲 BETTING PICKS TO EVALUATE" section when creating your response

Response format must be a JSON array of objects, each with these fields:
- 'pick': The EXACT original pick text as provided (copy it directly from the list above)
- 'league': The league (NBA, NHL, MLB)
- 'result': Whether the pick 'won', 'lost', 'push', or 'unknown'
- 'score': The final score in format 'Team A score - Team B score'`;
      
      console.log('Sending query to Perplexity for pick evaluation');
      
      // Send the query to Perplexity
      const response = await perplexityService.fetchRealTimeInfo(query);
      if (!response || !response.text) {
        throw new Error('No response from Perplexity API');
      }
      
      console.log('Received response from Perplexity');
      
      // Parse the results from the response
      const results = parseResultsFromText(response.text);
      
      if (!results || results.length === 0) {
        console.log('No valid results parsed from Perplexity response');
        return { success: false, message: 'Failed to parse results', results: [] };
      }
      
      console.log(`Successfully parsed ${results.length} results`);
      
      // Ensure the results maintain the original pick text by comparing with original picks
      const finalResults = results.map(result => {
        // Find the matching original pick
        const originalPick = picks.find(p => p.pick === result.pick);
        
        if (originalPick) {
          // Use the original pick data for consistency
          return {
            ...result,
            pick: originalPick.pick,  // Use the exact original text
            league: result.league || originalPick.league || '',
            homeTeam: originalPick.homeTeam,
            awayTeam: originalPick.awayTeam
          };
        }
        
        return result;
      });
      
      console.log(`Finalized ${finalResults.length} results with original pick texts preserved`);
      
      return {
        success: true,
        results: finalResults
      };
    } catch (error) {
      console.error('Error checking results with Perplexity:', error);
      return { success: false, message: error.message, results: [] };
    }
  },
  
  /**
   * Check results for picks from a specific date
   * @param {string} date - The date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Results of the check
   */
  checkResults: async (date) => {
    try {
      console.log(`Checking results for picks on ${date}`);

      // Step 1: Get the picks from the daily picks table
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      
      if (error) {
        console.error(`Error fetching picks for ${date}:`, error);
        return { success: false, message: error.message };
      }
      
      if (!data || !data.picks || data.picks.length === 0) {
        console.log(`No picks found for ${date}`);
        return { success: false, message: `No picks found for ${date}` };
      }
      
      const picks = data.picks;
      console.log(`Found ${picks.length} picks for ${date}`);
      
      // Step 2: Get game events from TheSportsDB API
      const gamesResponse = await resultsCheckerService.getSportsEventsByDate(date);
      
      let games = [];
      if (gamesResponse.success) {
        games = gamesResponse.events;
        console.log(`Retrieved ${games.length} games from TheSportsDB API`);
      } else {
        console.log(`Warning: Could not fetch games from TheSportsDB API: ${gamesResponse.message}`);
        // Continue anyway, Perplexity might be able to handle it
      }
      
      // Step 3: Use Perplexity to evaluate the picks
      const resultsResponse = await resultsCheckerService.checkAllResultsWithPerplexity(picks, date, games);
      
      if (!resultsResponse.success) {
        return { success: false, message: resultsResponse.message };
      }
      
      // Step 4: Record the results using garyPerformanceService
      console.log(`Recording ${resultsResponse.results.length} pick results`);
      await garyPerformanceService.recordPickResults(date, resultsResponse.results);
      
      return { 
        success: true, 
        message: `Successfully processed ${resultsResponse.results.length} results for ${date}`, 
        results: resultsResponse.results 
      };
    } catch (error) {
      console.error('Error checking results:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Automate the whole process of getting picks and recording results
   * @returns {Promise<Object>} - Results of the operation
   */
  automateResultsChecking: async () => {
    try {
      // Step 1: Get yesterday's picks
      const picksResponse = await resultsCheckerService.getYesterdaysPicks();
      if (!picksResponse.success) {
        return picksResponse; // Return the error message
      }
      
      // Step 2: Check results for those picks
      const resultsResponse = await resultsCheckerService.checkResults(picksResponse.date);
      
      return resultsResponse;
    } catch (error) {
      console.error('Error automating results checking:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Check the status of the API keys
   * @returns {Promise<Object>} - Status of each API key
   */
  checkApiKeyStatus: async () => {
    try {
      const status = {
        perplexity: false,
        sportsDb: false
      };
      
      // Check Perplexity API key
      if (perplexityService.API_KEY) {
        try {
          await perplexityService.fetchRealTimeInfo('Hello', {
            model: 'sonar-small-online', // Use smallest model for quick check
            maxTokens: 10 // Minimal tokens needed
          });
          status.perplexity = true;
          console.log('✅ Perplexity API key is valid');
        } catch (error) {
          console.error('Error checking Perplexity API key status:', error);
        }
      } else {
        console.log('❌ Perplexity API key is not configured');
      }
      
      // Check TheSportsDB API key
      if (sportsDbApiService.API_KEY) {
        try {
          const isValid = await sportsDbApiService.checkApiKey();
          status.sportsDb = isValid;
          console.log(isValid ? '✅ TheSportsDB API key is valid' : '❌ TheSportsDB API key is invalid');
        } catch (error) {
          console.error('Error checking TheSportsDB API key status:', error);
        }
      } else {
        console.log('❌ TheSportsDB API key is not configured');
      }
      
      return status;
    } catch (error) {
      console.error('Error checking API key status:', error);
      return { perplexity: false, sportsDb: false };
    }
  },
  
  /**
   * Start a daily job to check results automatically
   * @returns {Object} - Status of the operation
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
