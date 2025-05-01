import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';
import { oddsApiService } from './oddsApiService';

// Initialize the Odds API service
oddsApiService.initialize();

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
      
      // Create a formatted query for Perplexity with explicit instructions on finding results with date navigation
      const query = `I need to find REAL RESULTS for these sports picks from ${displayDate}. Search for the actual final scores for these games.

VERY IMPORTANT - FOLLOW THESE EXACT STEPS TO FIND REAL RESULTS:
1. Go to https://www.espn.com/scores
2. Look for a date picker/calendar and select ${displayDate} specifically
3. If ESPN doesn't have it, try the same process with the date picker on these sites:
   - https://www.cbssports.com/scores/ (look for calendar icon)
   - https://sports.yahoo.com/scores/ (has date navigation)
   - https://www.sportingnews.com/us/scores (has date selector)
   - https://www.scoresandodds.com/ (shows multiple dates)
   - League-specific sites with date selection:
     * NBA: https://www.nba.com/games (use date picker)
     * MLB: https://www.mlb.com/scores (click calendar icon)
     * NHL: https://www.nhl.com/scores (use date selector)

KEY INSTRUCTIONS:
1. You MUST use the date navigation on these sites to go to ${displayDate} specifically
2. For each pick, find the actual game played on that date between the exact teams mentioned
3. Spend more time searching for each pick - check ALL sites for each game
4. For each game with real results, determine if the pick "won", "lost", or was a "push" according to sports betting rules
5. Include the actual final score for each game with format "Team A score - Team B score"
6. DO NOT make up or estimate any results
7. VERY IMPORTANT: Each response MUST include the original league (NBA, MLB, NHL) from the pick

Response format must be structured as a JSON array of objects, each with these REQUIRED fields:
- 'pick': The original pick text
- 'league': The league of the game (NBA, MLB, NHL)
- 'result': Whether the pick 'won', 'lost', 'push', or 'unknown' 
- 'score': The final score in format 'Team A score - Team B score'

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
   * Check results using the Odds API directly
   * @param {Array} picks - Array of picks to check
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @returns {Promise} Results of the check
   */
  checkResultsWithOddsApi: async (picks, date) => {
    try {
      console.log(`Checking results for ${picks.length} picks on ${date} using Odds API`);
      
      // Map to store all the results
      const resultsMap = new Map();
      
      // Group picks by league for efficient API calls
      const picksByLeague = {};
      for (const pick of picks) {
        const league = pick.league || 'UNKNOWN';
        if (!picksByLeague[league]) {
          picksByLeague[league] = [];
        }
        picksByLeague[league].push(pick);
      }
      
      console.log('Grouped picks by league:', picksByLeague);
      
      // Process each league
      for (const league in picksByLeague) {
        // Map the league to the correct Odds API sport key
        const sportKey = {
          'NBA': 'basketball_nba',
          'MLB': 'baseball_mlb',
          'NHL': 'icehockey_nhl',
          'NFL': 'americanfootball_nfl'
        }[league] || null;
        
        if (!sportKey) {
          console.log(`No sport key mapping for league ${league}, skipping`);
          continue;
        }
        
        // Get scores from the Odds API
        try {
          const games = await oddsApiService.getScores(sportKey, date);
          console.log(`Retrieved ${games.length} games for ${league} on ${date}`, games);
          
          // Process each pick for this league
          for (const pick of picksByLeague[league]) {
            // Find a matching game for this pick
            // We need to match based on the teams in the pick
            let matchingGame = null;
            for (const game of games) {
              const homeTeamLower = game.home_team.toLowerCase();
              const awayTeamLower = game.away_team.toLowerCase();
              const pickLower = pick.pick.toLowerCase();
              const hasHomeTeam = homeTeamLower.includes(pick.homeTeam.toLowerCase()) || pick.homeTeam.toLowerCase().includes(homeTeamLower);
              const hasAwayTeam = awayTeamLower.includes(pick.awayTeam.toLowerCase()) || pick.awayTeam.toLowerCase().includes(awayTeamLower);
              
              if (hasHomeTeam && hasAwayTeam) {
                matchingGame = game;
                break;
              }
            }
            
            if (matchingGame) {
              // Found a matching game, evaluate the pick
              const evaluation = oddsApiService.evaluatePick(matchingGame, pick.pick);
              
              // Create result object
              const result = {
                pick: pick.pick,
                league: league,
                result: evaluation.result,
                score: evaluation.score
              };
              
              resultsMap.set(pick.pick, result);
              console.log(`Evaluated ${league} pick: ${pick.pick} => ${evaluation.result}`);
            } else {
              console.log(`No matching game found for pick: ${pick.pick}`);
            }
          }
        } catch (error) {
          console.error(`Error fetching ${league} games:`, error);
        }
      }
      
      // Convert results map to array
      const results = Array.from(resultsMap.values());
      console.log(`OddsAPI results: Found ${results.length} results for ${picks.length} picks`);
      
      return {
        success: true,
        results: results
      };
    } catch (error) {
      console.error('Error checking results with Odds API:', error);
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
      
      // Step 2: Try to check results with Odds API first
      let resultsResponse = await resultsCheckerService.checkResultsWithOddsApi(
        picksResponse.data, 
        picksResponse.date
      );
      
      let oddsApiResults = [];
      
      if (resultsResponse.success && resultsResponse.results.length > 0) {
        // Store valid Odds API results
        oddsApiResults = resultsResponse.results.filter(r => r.result !== 'unknown');
        console.log(`Got ${oddsApiResults.length} valid results from Odds API`);
      }
      
      // Step 3: Fall back to Perplexity for any picks that weren't resolved by Odds API
      const unresolvedPicks = picksResponse.data.filter(pick => {
        // Check if this pick wasn't resolved by Odds API
        return !oddsApiResults.some(result => result.pick === pick.pick);
      });
      
      let perplexityResults = [];
      
      if (unresolvedPicks.length > 0) {
        console.log(`Checking ${unresolvedPicks.length} unresolved picks with Perplexity`);
        
        // Call Perplexity for remaining picks
        const aiResponse = await resultsCheckerService.checkResultsWithAI(
          unresolvedPicks, 
          picksResponse.date
        );
        
        if (aiResponse.success) {
          perplexityResults = aiResponse.results.filter(r => r.result !== 'unknown');
          console.log(`Got ${perplexityResults.length} additional results from Perplexity`);
        }
      }
      
      // Combine results from both sources
      const allResults = [...oddsApiResults, ...perplexityResults];
      console.log(`Combined results: ${allResults.length} total (${oddsApiResults.length} from Odds API, ${perplexityResults.length} from Perplexity)`);
      
      // Ensure each result has a league field
      const resultsWithLeague = allResults.map(result => {
        // If result doesn't have a league field, find the original pick to get its league
        if (!result.league) {
          const originalPick = picksResponse.data.find(p => p.pick === result.pick);
          if (originalPick) {
            result.league = originalPick.league;
          }
        }
        return result;
      });

      console.log('Final results with league field:', resultsWithLeague);
      
      if (resultsWithLeague.length > 0) {
        // Record the results in the database
        const savedResults = await garyPerformanceService.recordPickResults(picksResponse.date, resultsWithLeague);
        return { 
          success: true, 
          message: `Recorded ${savedResults.length} pick results for ${picksResponse.date} (${oddsApiResults.length} from Odds API, ${perplexityResults.length} from Perplexity)` 
        };
      } else {
        return { success: false, message: 'No valid results to record' };
      }
    } catch (error) {
      console.error('Error automating results checking:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Check the status of the API keys
   * @returns {Promise<Object>} Status of each API key
   */
  checkApiKeyStatus: async () => {
    try {
      const status = {
        perplexity: false,
        oddsApi: false
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
      
      // Check Odds API key
      if (oddsApiService.API_KEY) {
        try {
          const isValid = await oddsApiService.checkApiKey();
          status.oddsApi = isValid;
          console.log(isValid ? '✅ Odds API key is valid' : '❌ Odds API key is invalid');
        } catch (error) {
          console.error('Error checking Odds API key status:', error);
        }
      } else {
        console.log('❌ Odds API key is not configured');
      }
      
      return status;
    } catch (error) {
      console.error('Error checking API key status:', error);
      return { perplexity: false, oddsApi: false };
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
