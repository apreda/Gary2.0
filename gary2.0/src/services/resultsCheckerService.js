import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';
import { openaiService } from './openaiService';
import { sportsDbApiService } from './sportsDbApiService';
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
 * Enhanced JSON parser to extract results from Perplexity response
 * @param {string} text - The text response from Perplexity
 * @returns {Array} Parsed results array
 */
const extractJsonFromText = (text) => {
  if (!text) {
    console.error('No text provided to parse');
    return [];
  }
  
  // Save full response to debug log for analysis
  console.log('FULL OPENAI RESPONSE:', text);
  console.log('Attempting to parse JSON from text:', text.substring(0, 200) + '...');
  
  try {
    // First approach: Try to find JSON within markdown code blocks (most common format from Perplexity)
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const jsonText = jsonBlockMatch[1].trim();
      console.log('Found JSON in code block:', jsonText.substring(0, 100) + '...');
      try {
        // Clean up any potential formatting issues
        const cleanedJson = jsonText.replace(/\\n/g, '\n').replace(/\\r/g, '');
        const parsedJson = JSON.parse(cleanedJson);
        console.log('Successfully parsed JSON from code block');
        return parsedJson;
      } catch (codeBlockError) {
        console.error('Error parsing JSON from code block:', codeBlockError);
        // Log more details to help debug the JSON parsing issue
        console.log('Code block content that failed parsing:\n', jsonText);
      }
    }
    
    // Second approach: Try to find JSON array with a direct regex match
    const arrayRegexMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/m);
    if (arrayRegexMatch) {
      const jsonArray = arrayRegexMatch[0];
      console.log('Found JSON array with regex:', jsonArray.substring(0, 100) + '...');
      try {
        // Clean up any potential issues with the JSON string
        const cleanedJson = jsonArray
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/([\{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Fix unquoted keys
          .replace(/:\s*'([^']*)'/g, ':"$1"'); // Fix single quotes around values
        const parsedArray = JSON.parse(cleanedJson);
        console.log('Successfully parsed JSON array with regex');
        return parsedArray;
      } catch (arrayRegexError) {
        console.error('Error parsing JSON array from regex:', arrayRegexError);
        console.log('JSON array that failed parsing:\n', jsonArray);
      }
    }
    
    // Third approach: Try to use direct string indexes to find JSON array
    const startPos = text.indexOf('[{');
    const endPos = text.lastIndexOf('}]');
    
    if (startPos !== -1 && endPos !== -1 && endPos > startPos) {
      // Use regex fallback to extract JSON array
      const jsonMatch = text.match(/\[(\s\S)*\]/); // This matches anything between [ and ]
      if (jsonMatch) {
        try {
          console.log('Found JSON array with regex:', jsonMatch[0].substring(0, 100) + '...');
          const jsonArray = JSON.parse(jsonMatch[0]);
          console.log('Successfully parsed JSON array with regex');
          return jsonArray;
        } catch (e) {
          console.log('Failed to parse JSON array with regex:', e.message);
        }
      }
    }
    
    // Fourth approach: Create an array manually by parsing each JSON object
    const objMatches = text.matchAll(/\{\s*"pick"\s*:\s*"([^"]+)"[\s\S]*?\}/g);
    if (objMatches) {
      const results = [];
      for (const match of objMatches) {
        try {
          const obj = JSON.parse(match[0]);
          results.push(obj);
        } catch (objError) {
          console.error('Failed to parse individual object:', objError);
        }
      }
      
      if (results.length > 0) {
        console.log(`Successfully parsed ${results.length} individual JSON objects`);
        return results;
      }
    }
    
    // Final fallback: Manual line-by-line parsing
    console.log('Attempting manual line-by-line extraction');
    const picks = [];
    const lines = text.split('\n');
    
    let currentPick = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines and code block markers
      if (!line || line === '```' || line === '```json') continue;
      
      // Look for pick information
      const pickMatch = line.match(/"pick"\s*:\s*"([^"]+)"/i);
      if (pickMatch) {
        currentPick = { pick: pickMatch[1] };
        
        // Look for other fields on the same line
        const leagueMatch = line.match(/"league"\s*:\s*"([^"]+)"/i);
        if (leagueMatch) currentPick.league = leagueMatch[1];
        
        const resultMatch = line.match(/"result"\s*:\s*"([^"]+)"/i);
        if (resultMatch) currentPick.result = resultMatch[1];
        
        const scoreMatch = line.match(/"final_score"\s*:\s*"([^"]+)"/i);
        if (scoreMatch) currentPick.final_score = scoreMatch[1];
        
        const matchupMatch = line.match(/"matchup"\s*:\s*"([^"]+)"/i);
        if (matchupMatch) currentPick.matchup = matchupMatch[1];
        
        // Check if this is a complete object
        if (line.includes('}')) {
          picks.push(currentPick);
          currentPick = null;
        }
      } 
      // Continue looking for fields if we have a current pick
      else if (currentPick) {
        const leagueMatch = line.match(/"league"\s*:\s*"([^"]+)"/i);
        if (leagueMatch) currentPick.league = leagueMatch[1];
        
        const resultMatch = line.match(/"result"\s*:\s*"([^"]+)"/i);
        if (resultMatch) currentPick.result = resultMatch[1];
        
        const scoreMatch = line.match(/"final_score"\s*:\s*"([^"]+)"/i);
        if (scoreMatch) currentPick.final_score = scoreMatch[1];
        
        const matchupMatch = line.match(/"matchup"\s*:\s*"([^"]+)"/i);
        if (matchupMatch) currentPick.matchup = matchupMatch[1];
        
        // Check if this object is complete
        if (line.includes('}')) {
          picks.push(currentPick);
          currentPick = null;
        }
      }
    }
    
    if (picks.length > 0) {
      console.log(`Manually extracted ${picks.length} picks line by line`);
      return picks;
    }
    
    // If all extraction methods fail, log error and return empty array
    console.error('All JSON extraction methods failed');
    return [];
  } catch (error) {
    console.error('Error in JSON extraction function:', error);
    return [];
  }
};

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
   * Get sports events and scores for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getGameScores: async (date) => {
    try {
      console.log(`Fetching sports events for ${date}`);
      const scores = {};
      
      // Get scores for each league (NBA, NHL, MLB)
      const leagues = [
        { id: sportsDbApiService.leagueIds.NBA, name: 'NBA' },
        { id: sportsDbApiService.leagueIds.NHL, name: 'NHL' },
        { id: sportsDbApiService.leagueIds.MLB, name: 'MLB' }
      ];
      
      for (const league of leagues) {
        try {
          const response = await sportsDbApiService.getEventsByDate(league.id, date);
          
          // Handle both 'events' and 'livescore' formats from TheSportsDB API
          let events = [];
          if (response.events && Array.isArray(response.events)) {
            events = response.events;
          } else if (response.livescore && Array.isArray(response.livescore)) {
            events = response.livescore;
          } else if (Array.isArray(response)) {
            events = response;
          }
          
          console.log(`Found ${events.length} games for ${league.name}`);
          
          // Log a sample event for debugging
          if (events.length > 0) {
            console.log(`Sample event data for ${league.name}:`, JSON.stringify(events[0], null, 2));
          }

          // Process each event to get the scores
          events.forEach(event => {
            // Check if the game is finished and has scores (allow 0 scores)
            const isFinished = event.strStatus === 'FT' || 
                               event.strStatus === 'Match Finished' || 
                               event.strStatus === 'Final' || 
                               event.strStatus?.includes('finish');

            const hasScores = event.intHomeScore !== undefined && 
                              event.intHomeScore !== null && 
                              event.intAwayScore !== undefined && 
                              event.intAwayScore !== null;

            if (isFinished && hasScores) {
              // Create a unique key for this matchup
              const matchup = `${event.strAwayTeam} @ ${event.strHomeTeam}`;
              
              // Parse scores safely handling zero scores
              const homeScore = parseInt(event.intHomeScore, 10);
              const awayScore = parseInt(event.intAwayScore, 10);
              
              // Add to the scores object with detailed score information
              scores[matchup] = {
                matchup,
                league: league.name,
                homeTeam: event.strHomeTeam,
                awayTeam: event.strAwayTeam,
                homeScore: homeScore,
                awayScore: awayScore,
                scoreText: `${event.strAwayTeam} ${event.intAwayScore} - ${event.strHomeTeam} ${event.intHomeScore}`,
                winner: homeScore > awayScore ? 'home' : (awayScore > homeScore ? 'away' : 'tie'),
                totalScore: homeScore + awayScore,
                status: event.strStatus
              };
            } else if (isFinished) {
              console.warn(`Game ${event.strAwayTeam} @ ${event.strHomeTeam} is finished but missing scores:`, 
                          event.intHomeScore, event.intAwayScore);
            }
          });
        } catch (leagueError) {
          console.error(`Error fetching ${league.name} events:`, leagueError);
        }
      }
      
      const gameCount = Object.keys(scores).length;
      console.log(`Found a total of ${gameCount} games with scores`);
      
      if (gameCount === 0) {
        console.warn('No games with scores found - results checking may fail');
      }
      
      return scores;
    } catch (error) {
      console.error('Error getting game scores:', error);
      return {};
    }
  },
  
  /**
   * Evaluate picks against game scores using Perplexity
   * @param {Array} picks - Array of pick objects
   * @param {Object} scores - Game scores mapped by matchup
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Evaluated results
   */
  evaluatePicks: async (picks, scores, date) => {
    try {
      console.log(`Evaluating ${picks.length} picks against ${Object.keys(scores).length} games`);
      
      // Format game scores for the prompt (used in all batches)
      // Include detailed score information for OpenAI to accurately determine winners
      const scoresText = Object.values(scores)
        .map(game => `${game.league}: ${game.awayTeam} ${game.awayScore} - ${game.homeTeam} ${game.homeScore}`)
        .join('\n');
        
      // If no scores found, make it explicit in the prompt
      const finalScoresText = scoresText.length > 0 
        ? scoresText 
        : 'No completed game scores available for this date. Treat all picks as "push" with "No score provided" as the final score.';
      
      // Process picks in smaller batches to ensure all picks get evaluated
      const BATCH_SIZE = 2; // Process just 2 picks at a time to ensure completeness
      const allResults = [];
      const batchCount = Math.ceil(picks.length / BATCH_SIZE);
      
      console.log(`Processing ${picks.length} picks in ${batchCount} batches of max ${BATCH_SIZE} picks each`);
      
      for (let i = 0; i < picks.length; i += BATCH_SIZE) {
        const batchPicks = picks.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`Processing batch ${batchNumber} with ${batchPicks.length} picks (${i+1}-${Math.min(i+BATCH_SIZE, picks.length)})`);
        
        // Format picks for prompt with more details
        const picksText = batchPicks.map((pick, index) => {
          const teamInfo = pick.homeTeam && pick.awayTeam ? `${pick.awayTeam} @ ${pick.homeTeam}` : '';
          const betValue = pick.bet || pick.pick;
          return `${i+index+1}. ${betValue} (${teamInfo}) - League: ${pick.league || 'Unknown'}`;
        }).join('\n');
        
        // Create the prompt for evaluation with improved betting rules explanation
        const prompt = `You are a sports betting analyst evaluating results of picks. Request ID: ${Math.random().toString().substring(2, 8)}

📊 ACTUAL GAME RESULTS for ${date}:
${finalScoresText}

🎲 BETTING PICKS TO EVALUATE:
${picksText}

For each numbered pick, determine if it won, lost, or pushed based on these betting rules:

Betting Rules:
- Spread bets with positive spread (e.g. "Team +3.5"): ADD the spread to the team's final score. If that total exceeds the opponent's score, the bet wins.
- Spread bets with negative spread (e.g. "Team -3.5"): SUBTRACT the spread from the team's final score. If that total still exceeds the opponent's score, the bet wins.
- Moneyline bets (e.g. "Team ML" or just "Team"): The bet wins if the team wins the game outright.
- Over/Under bets (e.g. "OVER 220.5"): If the total combined score is over the number, an OVER bet wins. If under, an UNDER bet wins.

Format your response ONLY as a JSON array with these properties for each pick:
[
  {
    "pick": "exact original pick text",
    "league": "league (NBA, MLB, NHL)",
    "result": "won/lost/push",
    "final_score": "AwayTeam Score - HomeTeam Score",
    "matchup": "AwayTeam @ HomeTeam"
  }
]

Include ONLY the picks from this batch. Provide detailed final scores to show how you determined the result.`;
        
        // Use OpenAI to evaluate picks
        console.log(`Sending batch ${batchNumber} (${batchPicks.length} picks) to OpenAI for evaluation`);
        const messages = [
          {
            role: 'user',
            content: prompt
          }
        ];
        
        const results = await openaiService.generateResponse(messages, {
          temperature: 0.1,
          maxTokens: 800
        });
        
        // Extract JSON from OpenAI response
        const batchResults = extractJsonFromText(results);
        
        if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
          console.error(`Batch ${batchNumber} produced no valid results`);
          continue;
        }
        
        // Extract the core text from a pick for comparison
        function extractPickText(pickString) {
          if (!pickString) return '';
          // Extract the team name or OVER/UNDER part
          const pattern = /(OVER|UNDER|\w+\s+\w+)(\s+[+-]?\d+(\.\d+)?)?/i;
          const match = pickString.match(pattern);
          return match ? match[0] : pickString;
        }

        // Verify batch results match our original picks
        // This ensures we haven't received results for the wrong batch
        const batchResultsValid = batchResults.every(result => {
          if (!result.pick) return false;
          
          const pickText = extractPickText(result.pick);
          if (!pickText) return false;
          
          // Check if this pick text exists in any of the original picks for this batch
          return batchPicks.some(originalPick => {
            const originalPickText = originalPick.pick || originalPick.bet;
            return originalPickText && originalPickText.includes(pickText);
          });
        });
        
        if (!batchResultsValid) {
          console.error(`Batch ${batchNumber} results don't match the sent picks`);
          continue;
        }
        
        console.log(`Successfully validated ${batchResults.length} results from batch ${batchNumber}`);
        
        // Store the valid results
        allResults.push(...batchResults);
        
        // Add a short delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < picks.length) {
          console.log('Waiting 2 seconds before processing next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`Total results across all batches: ${allResults.length}`);
      
      // Return all collected results
      return allResults;
    } catch (error) {
      console.error('Error evaluating picks:', error);
      return [];
    }
  },
  
  /**
 * Record results in the game_results table
 * @param {string} pickId - ID of the daily_picks record
 * @param {Array} results - Array of evaluated pick results
 * @param {string} date - Date of the picks in YYYY-MM-DD format
 * @param {Object} scores - Game scores from getGameScores
 * @returns {Promise<Array>} Inserted records
 */
recordResults: async (pickId, results, date, scores) => {
  try {
    console.log(`Recording ${results.length} results for pick ID ${pickId}`);
    // Log the full incoming results data for debugging
    console.log('Raw results to insert:', JSON.stringify(results, null, 2));
    
    // Format results for insert with null values for missing data instead of empty strings
    let recordsToInsert = results.map(result => {
      // Fix result values - only accept known values
      let resultValue = result.result || null;
      if (resultValue && !['won', 'lost', 'push'].includes(resultValue.toLowerCase())) {
        resultValue = null;
      }
      
      // Handle final score with proper fallbacks and empty value checks
      let finalScore = result.final_score || result.score || null;
      
      // Check for various empty/missing value indicators
      if (!finalScore || 
          finalScore === 'N/A' ||
          finalScore === 'EMPTY' ||
          finalScore.includes('No game') ||
          finalScore.includes('No score') ||
          finalScore.includes('not available')) {
        
        // Try to get the actual score from our scores object
        if (result.matchup && scores && Object.keys(scores).length > 0) {
          // Normalize matchup formats for comparison (handle both @ and vs formats)
          const normalizedMatchup1 = result.matchup.toLowerCase();
          const normalizedMatchup2 = result.matchup.replace(' @ ', ' vs ').toLowerCase();
          const reversedMatchup = result.matchup.split(' @ ').reverse().join(' @ ').toLowerCase();
          
          // Search for the matchup in our scores object
          for (const key in scores) {
            const normalizedKey = key.toLowerCase();
            if (normalizedKey.includes(normalizedMatchup1) || 
                normalizedKey.includes(normalizedMatchup2) || 
                normalizedKey.includes(reversedMatchup)) {
              finalScore = scores[key].score;
              console.log(`Found score from TheSportsDB for ${result.matchup}: ${finalScore}`);
              break;
            }
          }
        }
      }
      
      // Ensure we never store 'EMPTY' or similar placeholders
      if (!finalScore || 
          finalScore === 'N/A' ||
          finalScore === 'EMPTY' ||
          finalScore.includes('No game') ||
          finalScore.includes('No score')) {
        finalScore = null;
      }
      
      // Fix incorrect 'push' results when we have actual scores
      if (resultValue === 'push' && finalScore && 
          !finalScore.includes('N/A') && 
          !finalScore.includes('EMPTY') &&
          !finalScore.includes('No game')) {
        
        // Log for debugging
        console.log(`Validating 'push' result with score: ${finalScore}`);
      }
      
      return {
        pick_id: pickId,
        game_date: date,
        league: result.league || null,
        result: resultValue,
        final_score: finalScore,
        pick_text: result.pick || null,
        matchup: result.matchup || null
      };
    });
    
    // Print exact format of records we're inserting for debugging
    console.log('Formatted records for Supabase:', JSON.stringify(recordsToInsert, null, 2));
      
    try {
      // Check for existing results to avoid duplicates
      const { data: existingData, error: queryError } = await supabase
        .from('game_results')
        .select('id, pick_id, matchup')
        .eq('game_date', date)
        .eq('pick_id', pickId);
        
      if (queryError) {
        console.error('Error checking existing results:', queryError);
        throw new Error(`Database query error: ${queryError.message}`);
      }
        
      if (existingData && existingData.length > 0) {
        console.log(`Found ${existingData.length} existing results for these picks, skipping those`);
        // Filter out picks that already have results
        const existingMatchups = existingData.map(d => d.matchup);
        const filteredRecordsToInsert = recordsToInsert.filter(r => 
          !(r.matchup && existingMatchups.includes(r.matchup))
        );
        
        // Insert new results with explicit created_at and updated_at timestamps
        const timestamp = new Date().toISOString();
        const recordsWithTimestamps = filteredRecordsToInsert.map(record => ({
          ...record,
          created_at: timestamp,
          updated_at: timestamp
        }));
        
        const { data, error } = await supabase
          .from('game_results')
          .insert(recordsWithTimestamps)
          .select();
        
        if (error) {
          console.error('Database error inserting results:', error);
          throw new Error(`Error inserting results: ${error.message}`);
        }
        
        console.log(`Successfully recorded ${data.length} results`);
        console.log('Supabase response:', JSON.stringify(data, null, 2));
        return data;
      } else {
        // Insert new results with explicit created_at and updated_at timestamps
        const timestamp = new Date().toISOString();
        const recordsWithTimestamps = recordsToInsert.map(record => ({
          ...record,
          created_at: timestamp,
          updated_at: timestamp
        }));
        
        const { data, error } = await supabase
          .from('game_results')
          .insert(recordsWithTimestamps)
          .select();
        
        if (error) {
          console.error('Database error inserting results:', error);
          throw new Error(`Error inserting results: ${error.message}`);
        }
        
        console.log(`Successfully recorded ${data.length} results`);
        console.log('Supabase response:', JSON.stringify(data, null, 2));
        return data;
      }
    } catch (err) {
      console.error('Database error:', err);
      throw err;
    }
  } catch (err) {
    console.error('Error recording results:', err);
    throw err;
  }
},
  /**
   * Check results for picks from a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Results of the operation
   */
  checkResults: async (date) => {
    try {
      console.log(`Checking results for ${date}`);
      
      // Step 1: Get the picks from Supabase
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
      
      // Step 2: Get the game scores
      const scores = await resultsCheckerService.getGameScores(date);
      
      // Step 3: Evaluate the picks
      const results = await resultsCheckerService.evaluatePicks(picks, scores, date);
      
      if (results.length === 0) {
        return { success: false, message: 'No results could be evaluated' };
      }
      
      // Step 4: Record the results - pass scores object to help with missing data
      await resultsCheckerService.recordResults(data.id, results, date, scores);
      
      return { 
        success: true, 
        message: `Successfully processed ${results.length} results for ${date}`,
        results
      };
    } catch (error) {
      console.error('Error checking results:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Automate the whole process of getting picks and recording results
   * @returns {Promise<Object>} Results of the operation
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
      
      // Validate results to ensure all picks were processed
      if (resultsResponse.success && resultsResponse.results) {
        if (resultsResponse.results.length < picksResponse.data.length) {
          console.warn(`WARNING: Only processed ${resultsResponse.results.length} results out of ${picksResponse.data.length} picks`);
        }
      }
      
      // Optionally record performance stats
      if (resultsResponse.success && resultsResponse.results && resultsResponse.results.length > 0) {
        try {
          if (typeof garyPerformanceService.recordPickResults === 'function') {
            // Pass both the date and results array to the recordPickResults function
            await garyPerformanceService.recordPickResults(picksResponse.date, resultsResponse.results);
            console.log('Successfully updated performance stats');
          } else {
            console.log('Performance stats update skipped - function not available');
          }
          
          // Update user stats based on game results
          try {
            console.log('Updating user stats based on new game results...');
            const userStatsResults = await userPickResultsService.checkAndUpdateResults();
            console.log('User stats update complete:', userStatsResults);
          } catch (userStatsError) {
            console.error('Error updating user stats:', userStatsError);
          }
        } catch (statsError) {
          console.error('Error updating performance stats:', statsError);
        }
      }
      
      return resultsResponse;
    } catch (error) {
      console.error('Error automating results checking:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Check the status of the API keys
   * @returns {Promise} Status of each API key
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
            model: 'sonar-small-online',
            maxTokens: 10
          });
          status.perplexity = true;
          console.log('✅ Perplexity API key is valid');
        } catch (error) {
          console.error('Error checking Perplexity API key status:', error);
        }
      } else {
        console.log('❌ Perplexity API key is not configured');
      }
      
      // Check OpenAI API key
      try {
        const isValid = await openaiService.validateApiKey();
        status.openai = isValid;
        console.log(isValid ? '✅ OpenAI API key is valid' : '❌ OpenAI API key is invalid');
      } catch (error) {
        console.error('Error checking OpenAI API key status:', error);
        status.openai = false;
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
   * @returns {Object} Status of the operation
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
