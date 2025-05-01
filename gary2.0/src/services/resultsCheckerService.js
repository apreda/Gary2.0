import { supabase } from '../supabaseClient';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';
import { sportsDbApiService } from './sportsDbApiService';

// Initialize services
sportsDbApiService.initialize();

/**
 * Manually parse results from text response when JSON parsing fails
 * @param {string} text - The text response from Perplexity
 * @returns {Array} - Array of pick results objects
 */
const parseResultsManually = (text) => {
  console.log('Manual parsing of:', text);
  
  // Try to extract JSON from a code block first
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      // Try parsing the JSON block content
      const jsonArray = JSON.parse(jsonBlockMatch[1]);
      if (Array.isArray(jsonArray) && jsonArray.length > 0 && jsonArray[0].pick) {
        console.log(`Successfully extracted ${jsonArray.length} results from JSON block`);
        // Ensure we're not using "result" as pick text
        return jsonArray.map(item => ({
          ...item,
          pick: item.pick === 'result' ? '' : item.pick // Replace 'result' with empty string if that's what we got
        }));
      }
    } catch (e) {
      console.log('Failed to parse JSON block, continuing with line-by-line parsing');
    }
  }
  
  // Initialize results array for manual parsing
  const results = [];
  
  // Split the text by lines
  const lines = text.split(/\n/);
  
  // Look for patterns in each line
  let currentPick = null;
  let currentLeague = null;
  let currentResult = null;
  let currentScore = null;
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    // Skip header/intro lines
    if (line.startsWith('I found') || line.startsWith('Here are') || 
        line.startsWith('Based on') || line.startsWith('Given the')) {
      continue;
    }
    
    // Try to match a pick description with quotes
    const pickMatch = line.match(/"([^"]+)"/);
    if (pickMatch) {
      // If we have a complete result ready, add it
      if (currentPick && currentResult) {
        results.push({
          pick: currentPick,
          league: currentLeague || '',
          result: currentResult,
          score: currentScore || 'N/A'
        });
      }
      
      // Start a new pick
      currentPick = pickMatch[1];
      
      // Try to extract league
      const leagueMatch = line.match(/(NBA|MLB|NHL)/);
      currentLeague = leagueMatch ? leagueMatch[1] : '';
      
      // Try to extract result
      const resultMatch = line.toLowerCase().match(/(won|lost|push|unknown)/);
      currentResult = resultMatch ? resultMatch[1] : null;
      
      // Try to extract score
      const scoreMatch = line.match(/([\w\s]+)\s+(\d+)\s*-\s*(\w+\s+\d+)|([\w\s]+\s+\d+\s*-\s*\d+)/);
      currentScore = scoreMatch ? (scoreMatch[0] || 'N/A') : 'N/A';
      
      // If we got everything in one line, add the result
      if (currentPick && currentResult) {
        results.push({
          pick: currentPick,
          league: currentLeague || '',
          result: currentResult,
          score: currentScore || 'N/A'
        });
        
        // Reset for next pick
        currentPick = null;
        currentLeague = null;
        currentResult = null;
        currentScore = null;
      }
    }
    // Check for result lines
    else if (currentPick && !currentResult) {
      const resultMatch = line.toLowerCase().match(/(won|lost|push|unknown)/);
      if (resultMatch) {
        currentResult = resultMatch[1];
        
        // Try to extract score
        const scoreMatch = line.match(/([\w\s]+)\s+(\d+)\s*-\s*(\w+\s+\d+)|([\w\s]+\s+\d+\s*-\s*\d+)/);
        currentScore = scoreMatch ? (scoreMatch[0] || 'N/A') : 'N/A';
        
        // Add the completed result
        results.push({
          pick: currentPick,
          league: currentLeague || '',
          result: currentResult,
          score: currentScore || 'N/A'
        });
        
        // Reset for next pick
        currentPick = null;
        currentLeague = null;
        currentResult = null;
        currentScore = null;
      }
    }
  }
  
  // Add the last result if it's complete
  if (currentPick && currentResult) {
    results.push({
      pick: currentPick,
      league: currentLeague || '',
      result: currentResult,
      score: currentScore || 'N/A'
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
   * Check results using the TheSportsDB API and match with Perplexity
   * @param {Array} picks - Array of picks to check
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @returns {Promise} Results of the check
   */
  checkResultsWithSportsDbApi: async (picks, date) => {
    try {
      console.log(`Checking results using TheSportsDB API for ${date}`);
      
      // Step 1: Fetch all sports events from TheSportsDB API for the specified date
      console.log(`Fetching all sports events for ${date}`);
      const allEvents = await sportsDbApiService.getAllSportsEvents(date);
      
      // Flatten the events from all leagues for easier processing
      const allGames = [];
      
      // Format all events for Perplexity to understand
      Object.entries(allEvents).forEach(([league, events]) => {
        events.forEach(event => {
          // Only include events with scores
          if (event.intHomeScore !== null && event.intAwayScore !== null) {
            allGames.push({
              league: league,
              homeTeam: event.strHomeTeam,
              homeScore: parseInt(event.intHomeScore, 10) || 0,
              awayTeam: event.strAwayTeam,
              awayScore: parseInt(event.intAwayScore, 10) || 0,
              date: event.dateEvent,
              rawEvent: event // Keep original event data for reference
            });
          }
        });
      });
      
      console.log(`Found ${allGames.length} games with scores across all sports for ${date}`);
      
      // If no games found, return empty results
      if (allGames.length === 0) {
        console.log(`No games with scores found for any sport on ${date}`);
        return { success: false, message: `No games with scores found for ${date}`, results: [] };
      }
      
      // Step 2: Use Perplexity to match our picks with the game results
      // Prepare a query for Perplexity with all the picks and scores
      const query = `I have the following sports results from ${date} and need to evaluate if specific betting picks won or lost:

📊 ACTUAL GAME RESULTS:
${allGames.map(game => `${game.league}: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore}`).join('\n')}

🎲 BETTING PICKS TO EVALUATE:
${picks.map((pick, i) => 
  `${i+1}. ${pick.league} | Pick: "${pick.pick}" | Game: ${pick.awayTeam} @ ${pick.homeTeam}`
).join('\n')}

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

      console.log('Using Perplexity to match picks with TheSportsDB API results');
      console.log(`Prepared Perplexity query with ${allGames.length} games and ${picks.length} picks`);
      
      // Call Perplexity API with the prepared query
      const responseText = await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar-medium-online',
        temperature: 0.1,
        maxTokens: 4000
      });
      
      console.log('Received response from Perplexity for pick matching');
      
      // Parse the results from Perplexity's response
      let results = [];
      
      try {
        // First try direct JSON parsing
        results = JSON.parse(responseText);
      } catch (jsonError) {
        console.log('Direct JSON parsing failed, trying to extract JSON from text');
        
        // Try to find and extract JSON from the response
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        
        if (jsonMatch && jsonMatch[1]) {
          try {
            results = JSON.parse(jsonMatch[1]);
          } catch (extractedJsonError) {
            console.error('Failed to parse extracted JSON:', extractedJsonError);
            // Fall back to manual parsing as a last resort
            results = parseResultsManually(responseText);
          }
        } else {
          console.log('Attempting to manually parse the response');
          results = parseResultsManually(responseText);
        }
      }
      
      console.log(`Processed ${results.length} of ${picks.length} picks with Perplexity + TheSportsDB API`);
      return { success: true, results };
    } catch (error) {
      console.error('Error checking results with TheSportsDB API + Perplexity:', error);
      return { success: false, message: error.message, results: [] };
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
        return picksResponse; // Return the error message
      }
      
      // Step 2: Check results using TheSportsDB API
      const sportsDbApiResponse = await resultsCheckerService.checkResultsWithSportsDbApi(
        picksResponse.data,
        picksResponse.date
      );
      
      let sportsDbApiResults = [];
      if (sportsDbApiResponse.success) {
        // Process TheSportsDB API results to ensure original pick texts are preserved
        sportsDbApiResults = sportsDbApiResponse.results
          .filter(r => r.result !== 'unknown')
          .map(result => {
            // Log raw result for debugging
            console.log(`Raw TheSportsDB API result item:`, JSON.stringify(result));
            
            // Find the original pick in the data
            const originalPick = picksResponse.data.find(p => {
              // Try exact match first
              if (p.pick === result.pick) return true;
              
              // Then try normalized comparison
              if (!p.pick || !result.pick) return false;
              const normalizedResultPick = result.pick.replace(/\s+/g, ' ').trim().toLowerCase();
              const normalizedOriginalPick = p.pick.replace(/\s+/g, ' ').trim().toLowerCase();
              
              return normalizedResultPick.includes(normalizedOriginalPick) || 
                     normalizedOriginalPick.includes(normalizedResultPick);
            });
            
            // Use the original pick text if found
            if (originalPick) {
              console.log(`Matched TheSportsDB result "${result.pick}" with original pick "${originalPick.pick}"`);
              return {
                ...result,
                pick: originalPick.pick,  // Use the exact original text
                originalPickText: originalPick.pick  // Store in backup field too
              };
            }
            
            // Add safeguard against 'result' placeholder
            if (result.pick === 'result') {
              console.log(`Detected 'result' placeholder in TheSportsDB output, attempting recovery`);
              // Try to find a matching pick based on other fields
              const matchingPick = picksResponse.data.find(p => {
                if (!p.homeTeam || !p.awayTeam) return false;
                return (result.homeTeam && p.homeTeam.includes(result.homeTeam)) || 
                       (result.awayTeam && p.awayTeam.includes(result.awayTeam));
              });
              
              if (matchingPick) {
                return {
                  ...result,
                  pick: matchingPick.pick,
                  originalPickText: matchingPick.pick
                };
              }
            }
            
            return result;
          });
        
        console.log(`Got ${sportsDbApiResults.length} valid results from TheSportsDB API`);
      } else {
        console.log(`TheSportsDB API check failed: ${sportsDbApiResponse.message}`);
      }
      
      // Step 3: Fall back to Perplexity for any picks that weren't resolved by TheSportsDB API
      const unresolvedPicks = picksResponse.data.filter(pick => {
        // Check if this pick wasn't resolved by TheSportsDB API using normalized comparison
        return !sportsDbApiResults.some(result => {
          if (!result.pick || !pick.pick) return false;
          // Normalize both strings for flexible comparison
          const normalizedResultPick = result.pick.replace(/\s+/g, ' ').trim().toLowerCase();
          const normalizedOriginalPick = pick.pick.replace(/\s+/g, ' ').trim().toLowerCase();
          
          // Check if either string includes the other for partial matching
          return normalizedResultPick.includes(normalizedOriginalPick) || 
                 normalizedOriginalPick.includes(normalizedResultPick);
        });
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
          // Ensure original pick texts are preserved from Perplexity
          perplexityResults = aiResponse.results
            .filter(r => r.result !== 'unknown')
            .map(result => {
              // Debug logging to track pick texts
              console.log(`Raw Perplexity result item:`, JSON.stringify(result));
              
              // Find the original pick text in unresolvedPicks
              const originalPick = unresolvedPicks.find(p => {
                // First try exact match
                if (p.pick === result.pick) return true;
                
                // Then try normalized comparison
                if (!p.pick || !result.pick) return false;
                const normalizedResultPick = result.pick.replace(/\s+/g, ' ').trim().toLowerCase();
                const normalizedOriginalPick = p.pick.replace(/\s+/g, ' ').trim().toLowerCase();
                
                return normalizedResultPick.includes(normalizedOriginalPick) || 
                       normalizedOriginalPick.includes(normalizedResultPick);
              });
              
              // Use the original pick text if found, otherwise keep what we got
              if (originalPick) {
                console.log(`Matched Perplexity result "${result.pick}" with original pick "${originalPick.pick}"`);
                return {
                  ...result,
                  pick: originalPick.pick,  // Use the exact original text
                  originalPickText: originalPick.pick  // Store in backup field too
                };
              }
              
              // Add safeguard against 'result' placeholder
              if (result.pick === 'result') {
                console.log(`Detected 'result' placeholder in Perplexity output, attempting recovery`);
                // Try to recover from picks array using the index
                const index = perplexityResults.indexOf(result);
                if (index >= 0 && index < unresolvedPicks.length) {
                  return {
                    ...result,
                    pick: unresolvedPicks[index].pick,
                    originalPickText: unresolvedPicks[index].pick
                  };
                }
              }
              
              return result;
            });
          
          console.log(`Got ${perplexityResults.length} additional results from Perplexity`);
        }
      }
      
      // Combine results from both sources
      const allResults = [...sportsDbApiResults, ...perplexityResults];
      console.log(`Combined results: ${allResults.length} total (${sportsDbApiResults.length} from TheSportsDB API, ${perplexityResults.length} from Perplexity)`);
      
      // Ensure each result has a league field and uses the original pick text
      const resultsWithLeague = allResults.map(result => {
        // Find the matching original pick using flexible matching
        const matchingPick = picksResponse.data.find(p => {
          if (!p.pick || !result.pick) return false;
          // Normalize both strings for comparison
          const normalizedResultPick = result.pick.replace(/\s+/g, ' ').trim().toLowerCase();
          const normalizedOriginalPick = p.pick.replace(/\s+/g, ' ').trim().toLowerCase();
          
          return normalizedResultPick.includes(normalizedOriginalPick) || 
                 normalizedOriginalPick.includes(normalizedResultPick);
        });
        
        if (matchingPick) {
          // Use the original pick text from the database to ensure consistency
          result.pick = matchingPick.pick;
          
          // If result doesn't have a league field, get it from the original pick
          if (!result.league) {
            result.league = matchingPick.league;
          }
          
          // Add home/away team info if available in the original pick
          if (matchingPick.homeTeam && !result.homeTeam) {
            result.homeTeam = matchingPick.homeTeam;
          }
          if (matchingPick.awayTeam && !result.awayTeam) {
            result.awayTeam = matchingPick.awayTeam;
          }
        }
        
        return result;
      });

      console.log('Final results with league field:', resultsWithLeague);
      
      // Log the raw results before any final processing
      console.log('Raw results before final processing:', JSON.stringify(resultsWithLeague, null, 2));
      
      // Deep clone and protect the results to prevent any reference issues or loss of pick text
      const finalResults = resultsWithLeague.map((result, index) => {
        // Check if result has pick text being lost/transformed to 'result'
        if (!result.pick || result.pick === 'result') {
          console.log(`WARNING: Detected missing or placeholder pick text at index ${index}`);
          
          // Try to recover the original pick text from any available field
          const originalPickFromField = result.originalPickText || result.originalPick || '';
          
          if (originalPickFromField && originalPickFromField !== 'result') {
            console.log(`Recovered pick text from backup field: "${originalPickFromField}"`);
            result.pick = originalPickFromField;
          } else {
            // Last resort - look for matching pick in original picks data by game teams
            const matchingOriginalPick = picksResponse.data.find(p => {
              if (!p.homeTeam || !p.awayTeam || !result.homeTeam || !result.awayTeam) return false;
              return p.homeTeam.includes(result.homeTeam) || p.awayTeam.includes(result.awayTeam);
            });
            
            if (matchingOriginalPick) {
              console.log(`Recovered pick text by team matching: "${matchingOriginalPick.pick}"`);
              result.pick = matchingOriginalPick.pick;
            } else {
              // If all recovery attempts fail, create a descriptive placeholder rather than just "result"
              result.pick = `Unidentified pick for ${result.homeTeam || ''} vs ${result.awayTeam || ''}`;
              console.log(`Created descriptive placeholder: "${result.pick}"`);
            }
          }
        }
        
        // Log each result object to ensure pick text is preserved
        console.log('Final pick object being sent to recordPickResults:', JSON.stringify(result));
        
        // Create a new object with all fields and backup fields
        return {
          ...result,
          originalPick: result.pick, // Add an extra field to preserve original pick text
          pickText: result.pick,     // Add another backup field
          rawResult: result,         // Store the entire object as a backup
          processedAt: new Date().toISOString() // Add timestamp for debugging
        };
      });
      
      if (finalResults.length > 0) {
        console.log('Sending results to garyPerformanceService:', JSON.stringify(finalResults));
        // Record the results in the database
        const savedResults = await garyPerformanceService.recordPickResults(picksResponse.date, finalResults);
        return { 
          success: true, 
          message: `Recorded ${savedResults.length} pick results for ${picksResponse.date} (${sportsDbApiResults.length} from TheSportsDB API, ${perplexityResults.length} from Perplexity)` 
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
      
      // Check TheSportsDB API key (used for results checking)
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
