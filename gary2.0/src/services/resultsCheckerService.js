import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { perplexityService } from './perplexityService';
import { openaiService } from './openaiService';
import { sportsDbApiService } from './sportsDbApiService';

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
          const events = await sportsDbApiService.getEventsByDate(league.id, date);
          console.log(`Found ${events.length} games for ${league.name}`);
          
          // Add each event to the scores object
          events.forEach(event => {
            if (event.intHomeScore && event.intAwayScore) {
              // Create matchup key for identifying games
              const matchup = `${event.strAwayTeam} @ ${event.strHomeTeam}`;
              
              scores[matchup] = {
                league: league.name,
                homeTeam: event.strHomeTeam,
                awayTeam: event.strAwayTeam,
                homeScore: parseInt(event.intHomeScore, 10),
                awayScore: parseInt(event.intAwayScore, 10),
                scoreText: `${event.strAwayTeam} ${event.intAwayScore} - ${event.strHomeTeam} ${event.intHomeScore}`
              };
            }
          });
        } catch (leagueError) {
          console.error(`Error fetching ${league.name} events:`, leagueError);
        }
      }
      
      const gameCount = Object.keys(scores).length;
      console.log(`Found a total of ${gameCount} games with scores`);
      
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
      const scoresText = Object.values(scores)
        .map(game => `${game.league}: ${game.scoreText}`)
        .join('\n');
      
      // Process picks in smaller batches to avoid token limits
      const BATCH_SIZE = 5;
      const allResults = [];
      
      for (let i = 0; i < picks.length; i += BATCH_SIZE) {
        const batchPicks = picks.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i/BATCH_SIZE + 1} with ${batchPicks.length} picks (${i+1}-${Math.min(i+BATCH_SIZE, picks.length)})`);
        
        // Format just this batch of picks for the prompt
        // Keep the original pick number for reference
        const batchPicksText = batchPicks.map((pick, j) =>
          `${i+j+1}. ${pick.league} | Pick: "${pick.pick}" | Game: ${pick.awayTeam} @ ${pick.homeTeam}`
        ).join('\n');
        
        // Create the Perplexity prompt for this batch - add a cache busting random number
        // This is critical to prevent Perplexity from returning cached responses
        const cacheKey = Math.random().toString().substring(2, 8);
        
        const prompt = `I have the following sports results from ${date} and need to evaluate if specific betting picks won or lost. Request ID: ${cacheKey}

📊 ACTUAL GAME RESULTS:
${scoresText}

🎲 BETTING PICKS TO EVALUATE (BATCH ${i/BATCH_SIZE + 1} ONLY):
${batchPicksText}

For each numbered pick IN THIS BATCH ONLY:
1. Find the corresponding game in the results
2. Determine if the pick "won", "lost", or was a "push" according to sports betting rules

Betting Rules:
- Spread bets (e.g. "Team +3.5"): Add the spread to the team's score. If that total exceeds the opponent's score, the bet wins.
- Moneyline bets (e.g. "Team ML"): Simply pick the winner of the game.
- Over/Under bets (e.g. "OVER 220.5"): If the total combined score is over the number, an OVER bet wins. If under, an UNDER bet wins.

Response format must be ONLY a JSON array of objects with ABSOLUTELY NO ADDITIONAL TEXT before or after the array. Each object must have these exact fields:
- 'pick': The original pick text as provided 
- 'league': The league (NBA, NHL, MLB) exactly as provided in the pick
- 'result': Whether the pick 'won', 'lost', 'push'
- 'final_score': The final score
- 'matchup': Team A vs Team B from the game scores

IMPORTANT: ONLY include picks from THIS BATCH (batch ${i/BATCH_SIZE + 1}) not previous batches. Response ID: ${cacheKey}`;
        
        console.log(`Sending batch ${i/BATCH_SIZE + 1} (${batchPicks.length} picks) to OpenAI for evaluation`);
        
        try {
          // Use OpenAI instead of Perplexity for better JSON handling and reliability
          const responseText = await openaiService.generateResponse([{
            role: 'user',
            content: prompt
          }], {
            model: 'gpt-3.5-turbo-1106', // Use a model with JSON mode capability
            temperature: 0.1, // Low temperature for more deterministic responses
            maxTokens: 1000 // Note the camelCase format to match the API
          });
          if (!responseText) {
            console.error(`No response from OpenAI for batch ${i/BATCH_SIZE + 1}`);
            continue; // Skip to the next batch if there's no response
          }
          
          // Parse the results from the response
          const batchResults = extractJsonFromText(responseText);
          
          if (!batchResults || batchResults.length === 0) {
            console.log(`No valid results parsed from OpenAI response for batch ${i/BATCH_SIZE + 1}`);
          } else {
            // Verify these results are for the current batch by checking pick content
            // This is critical to prevent duplicate results from being stored
            const batchResultsValid = batchResults.every(result => {
              // Find the corresponding pick 
              // If there's no pick property, consider it invalid
              if (!result.pick) return false;

              const pickText = extractPickText(result.pick);
              if (!pickText) return false;
              // Check if this pick text exists in any of the original picks for this batch
              return batchPicks.some(pick => pick.pick && pick.pick.includes(pickText));
            });
            
            if (batchResultsValid) {
              console.log(`Successfully validated ${batchResults.length} results from batch ${i/BATCH_SIZE + 1}`);
              allResults.push(...batchResults);
            } else {
              console.log(`Skipping invalid results for batch ${i/BATCH_SIZE + 1}`);
            }
            
            // Add a short delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < picks.length) {
              console.log('Waiting 2 seconds before processing next batch...');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (batchError) {
          console.error(`Error evaluating batch ${i/BATCH_SIZE + 1}:`, batchError);
          // Continue with the next batch even if this one failed
        }
      }
      
      console.log(`Total results across all batches: ${allResults.length}`);
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
   * @returns {Promise<Array>} Inserted records
   */
  recordResults: async (pickId, results, date) => {
    try {
      console.log(`Recording ${results.length} results for pick ID ${pickId}`);
      
      // Format results for insert
      let recordsToInsert = results.map(result => ({
        pick_id: pickId,
        game_date: date,
        league: result.league || '',
        result: result.result || 'unknown',
        final_score: result.final_score || result.score || '', // Support both new and old field names
        pick_text: result.pick || '',
        // Use provided matchup or extract from score
        matchup: result.matchup || (result.final_score ? result.final_score.split(' - ')[0].split(' ').slice(0, -1).join(' ') + ' @ ' + 
                                                       result.final_score.split(' - ')[1].split(' ').slice(0, -1).join(' ') : '')
      }));
      
      // Insert records into game_results table with RLS bypass using the service role key
      try {
        // First check if any of these picks already have results to avoid duplicates
        const { data: existingData } = await adminSupabase
          .from('game_results')
          .select('pick_id')
          .eq('game_date', date)
          .in('pick_id', recordsToInsert.map(r => r.pick_id));
          
        if (existingData && existingData.length > 0) {
          console.log(`Found ${existingData.length} existing results for these picks, skipping those`);
          // Filter out picks that already have results
          const existingPickIds = existingData.map(d => d.pick_id);
          const filteredRecordsToInsert = recordsToInsert.filter(r => !existingPickIds.includes(r.pick_id));
          // Insert new results with explicit created_at and updated_at timestamps
          const timestamp = new Date().toISOString();
          const recordsWithTimestamps = filteredRecordsToInsert.map(record => ({
            ...record,
            created_at: timestamp,
            updated_at: timestamp
          }));
          
          const { data, error } = await adminSupabase
            .from('game_results')
            .insert(recordsWithTimestamps)
            .select();
          
          if (error) {
            console.error('Database error inserting results:', error);
            throw new Error(`Error inserting results: ${error.message}`);
          }
          
          console.log(`Successfully recorded ${data.length} results`);
          return data;
        } else {
          // Insert new results with explicit created_at and updated_at timestamps
          const timestamp = new Date().toISOString();
          const recordsWithTimestamps = recordsToInsert.map(record => ({
            ...record,
            created_at: timestamp,
            updated_at: timestamp
          }));
          
          const { data, error } = await adminSupabase
            .from('game_results')
            .insert(recordsWithTimestamps)
            .select();
          
          if (error) {
            console.error('Database error inserting results:', error);
            throw new Error(`Error inserting results: ${error.message}`);
          }
          
          console.log(`Successfully recorded ${data.length} results`);
          return data;
        }
      } catch (dbError) {
        console.error('Error in database operation:', dbError);
        throw dbError;
      }
    } catch (error) {
      console.error('Error recording results:', error);
      return [];
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
      
      // Step 4: Record the results
      await resultsCheckerService.recordResults(data.id, results, date);
      
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
      
      // Optionally record performance stats
      if (resultsResponse.success && resultsResponse.results && resultsResponse.results.length > 0) {
        try {
          // Check if the function exists before calling it
          if (typeof garyPerformanceService.recordPickResults === 'function') {
            // Pass the actual results array to the recordPickResults function
            await garyPerformanceService.recordPickResults(resultsResponse.results);
            console.log('Successfully updated performance stats');
          } else {
            console.log('Performance stats update skipped - function not available');
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
