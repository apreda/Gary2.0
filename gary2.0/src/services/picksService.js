/**
 * Enhanced Picks Service
 * Generates picks sequentially by sport using sports statistics from TheSportsDB
 * and stores raw OpenAI responses in Supabase.
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService';
import { supabase } from '../supabaseClient.js';
import { sportsDataService } from './sportsDataService.js';

const picksService = {
  /**
   * Generate daily picks sequentially by sport to avoid OpenAI rate limits
   */
  generateDailyPicks: async () => {
    try {
      console.log('Generating daily picks with sequential processing to avoid rate limits');
      
      // Get active sports and their games
      const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl']; // Fixed NHL sport key to match Odds API
      const allPicks = [];
      
      // Process one sport at a time to avoid overwhelming OpenAI API
      for (const sport of sportsToAnalyze) {
        console.log(`\n==== Processing ${sport} games ====`);
        
        try {
          // Get games for this sport
          const games = await oddsService.getUpcomingGames(sport);
          console.log(`Got ${games.length} games for ${sport}`);
          
          if (games.length === 0) {
            console.log(`No games found for ${sport}, skipping...`);
            continue;
          }
          
          // Map sport key to readable name
          const sportName = sport.includes('basketball') ? 'NBA' :
                          sport.includes('baseball') ? 'MLB' :
                          sport.includes('hockey') ? 'NHL' :
                          sport.includes('football') ? 'NFL' : 'Unknown';
          
          // Generate picks for each game in this sport, one at a time
          console.log(`Generating picks for ${games.length} ${sportName} games...`);
          
          for (const game of games) {
            try {
              console.log(`\n-- Analyzing game: ${game.home_team} vs ${game.away_team} --`);
              
              // Get comprehensive team statistics from TheSportsDB
              console.log(`Gathering detailed team statistics for ${game.home_team} vs ${game.away_team}...`);
              const statsContext = await sportsDataService.buildComprehensiveStatsContext(
                game.home_team,
                game.away_team,
                sportName,
                { // Basic odds data structure
                  homeOdds: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[0]?.price,
                  awayOdds: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[1]?.price,
                  pointSpread: game.bookmakers?.[0]?.markets?.[1]?.outcomes?.[0]?.point,
                }
              );
              
              // For MLB games, get additional pitcher data if available
              let pitcherData = '';
              if (sportName === 'MLB') {
                try {
                  console.log('Fetching additional MLB pitcher data...');
                  const homeTeamData = await sportsDataService.getTeamData(game.home_team);
                  const awayTeamData = await sportsDataService.getTeamData(game.away_team);
                  
                  // Ideally we would fetch specific pitcher data here
                  // This is a placeholder for future implementation
                  pitcherData = `PITCHING MATCHUP: Check starting pitchers' stats including ERA, WHIP, K/9, and recent performances.`;
                } catch (error) {
                  console.error('Error fetching MLB pitcher data:', error.message);
                }
              }
              
              // Format the game data for Gary's analysis with enhanced statistics
              const formattedGameData = {
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                matchup: `${game.home_team} vs ${game.away_team}`,
                league: sportName,
                odds: game.bookmakers || [],
                lineMovement: {
                  hasSignificantMovement: false,
                  movement: { spread: 0, moneyline: { home: 0, away: 0 } },
                  trend: 'stable'
                },
                sport: sportName,
                sportKey: sport,
                teamStats: statsContext,
                pitcherData: pitcherData
              };
              
              // Make the pick using Gary Engine
              console.log(`Getting stats-driven pick from Gary for ${formattedGameData.matchup}...`);
              console.log('Team statistics available:', !!formattedGameData.teamStats);
              const pick = await makeGaryPick(formattedGameData, {
                temperature: 0.7
              });
              
              if (pick && pick.success && pick.rawAnalysis?.rawOpenAIOutput) {
                // Strictly enforce the 0.75 confidence threshold
                const confidence = pick.rawAnalysis.rawOpenAIOutput.confidence || 0;
                console.log('Pick generated with confidence:', confidence);
                
                if (confidence >= 0.75) {
                  allPicks.push(pick);
                  console.log('Success! Pick added:', pick.rawAnalysis.rawOpenAIOutput.pick || 'No pick text');
                } else {
                  console.warn(`Filtering out pick for ${formattedGameData.matchup} - confidence ${confidence} below threshold of 0.75`);
                }
              } else {
                console.warn(`No pick generated for ${formattedGameData.matchup}. Likely confidence below threshold.`);
              }
              
              // Add a delay between API calls to avoid rate limiting
              console.log('Waiting 2 seconds before next analysis to avoid rate limits...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
            } catch (error) {
              console.error(`Error analyzing game ${game.home_team} vs ${game.away_team}:`, error.message);
              // Continue with the next game
            }
          }
          
          // Add a delay between sports to further reduce API load
          if (sportsToAnalyze.indexOf(sport) < sportsToAnalyze.length - 1) {
            console.log('\nFinished processing sport. Waiting 10 seconds before next sport...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
          
        } catch (sportError) {
          console.error(`Error processing sport ${sport}:`, sportError.message);
          // Continue with the next sport
        }
      }
      
      console.log(`Generated ${allPicks.length} picks across all sports`);
      
      // Store the picks in the database
      if (allPicks.length > 0) {
        try {
          console.log('Storing picks in database...');
          await picksService.storeDailyPicksInDatabase(allPicks);
          console.log('Picks stored successfully!');
        } catch (storeError) {
          console.error('Error storing picks in database:', storeError.message);
        }
      } else {
        console.log('No picks to store in database');
      }
      
      return allPicks;
    } catch (error) {
      console.error('Error in generateDailyPicks:', error.message);
      return [];
    }
  },
  
  /**
   * Ensure we have a valid Supabase session for database operations
   */
  ensureValidSupabaseSession: async () => {
    try {
      // Check if we already have a session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log('Using existing Supabase session');
        return true;
      }
      
      // If not, sign in anonymously
      console.log('No existing session, signing in anonymously...');
      
      const { error } = await supabase.auth.signInAnonymously();
      
      if (error) {
        console.error('Error signing in anonymously:', error.message);
        return false;
      }
      
      console.log('Successfully signed in anonymously');
      return true;
    } catch (error) {
      console.error('Error ensuring Supabase session:', error.message);
      return false;
    }
  },
  
  /**
   * Check if picks for today already exist in the database
   */
  checkForExistingPicks: async (dateString) => {
    try {
      const { data, error } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('date', dateString)
        .maybeSingle();
        
      if (error) {
        console.error('Error checking for existing picks:', error);
        return false;
      }
      
      return data !== null;
    } catch (err) {
      console.error('Error in checkForExistingPicks:', err);
      return false;
    }
  },
  
  /**
   * Store the daily picks in the database for persistence, with error handling for missing bankroll table
   */
  storeDailyPicksInDatabase: async (picks) => {
    try {
      console.log(`Initial picks array has ${picks?.length || 0} items`);
      
      // Guard against null or undefined picks array
      if (!picks || !Array.isArray(picks) || picks.length === 0) {
        console.error('ERROR: No picks provided to storeDailyPicksInDatabase');
        return { success: false, message: 'No picks provided' };
      }
      
      // Current date in YYYY-MM-DD format for database storage
      const currentDate = new Date();
      const currentDateString = currentDate.toISOString().split('T')[0];
      
      // Check if picks for today already exist
      const picksExist = await picksService.checkForExistingPicks(currentDateString);
      if (picksExist) {
        console.log(`Picks for ${currentDateString} already exist in database, skipping insertion`);
        return { success: true, count: 0, message: 'Picks already exist for today' };
      }
      
      // First pass: Extract all JSON data from all picks
      const allParsedOutputs = picks
        .filter(pick => {
          // Must have success flag and raw analysis with OpenAI output
          const isValid = pick.success && pick.rawAnalysis && pick.rawAnalysis.rawOpenAIOutput;
          if (!isValid) {
            console.warn(`Filtering out pick for ${pick.game || 'unknown game'}: missing required data`);
            if (!pick.success) console.warn('  - Pick marked as unsuccessful');
            if (!pick.rawAnalysis) console.warn('  - Missing rawAnalysis object');
            else if (!pick.rawAnalysis.rawOpenAIOutput) console.warn('  - Missing rawOpenAIOutput in rawAnalysis');
          }
          return isValid;
        })
        .map(pick => {
          // Extract the JSON data from the raw OpenAI response
          // The raw response from OpenAI contains the JSON directly
          const rawResponse = pick.rawAnalysis.rawOpenAIOutput;
          let jsonData;
          
          // Check if rawResponse is already an object (not a string)
          if (rawResponse && typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
            console.log(`Raw response for ${pick.game || 'unknown game'} is already an object, using directly`);
            jsonData = rawResponse;
          } else if (typeof rawResponse !== 'string') {
            // Handle case where rawResponse is not a string and not an object
            console.error(`Invalid raw response format for ${pick.game || 'unknown game'}: ${typeof rawResponse}`);
            return null;
          } else {
            // Process string response
            try {
              // First try to parse directly if it's already valid JSON
              jsonData = JSON.parse(rawResponse);
              console.log(`Successfully parsed JSON directly for ${pick.game || 'unknown game'}`);
            } catch (parseError) {
              // If that fails, try to extract JSON from markdown code blocks
              try {
                const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) {
                  try {
                    jsonData = JSON.parse(jsonMatch[1].trim());
                    console.log(`Extracted JSON from code block for ${pick.game || 'unknown game'}`);
                  } catch (nestedError) {
                    // Last resort: try to find anything that looks like JSON
                    const lastResortMatch = rawResponse.match(/\{[\s\S]*?"pick"[\s\S]*?"confidence"[\s\S]*?\}/);
                    if (lastResortMatch) {
                      try {
                        jsonData = JSON.parse(lastResortMatch[0]);
                        console.log(`Extracted JSON from regex match for ${pick.game || 'unknown game'}`);
                      } catch (finalError) {
                        console.error(`Failed to extract JSON from response for ${pick.game || 'unknown game'}`, finalError);
                        return null;
                      }
                    } else {
                      console.error(`No JSON pattern found in response for ${pick.game || 'unknown game'}`);
                      return null;
                    }
                  }
                } else {
                  console.error(`No code block found in response for ${pick.game || 'unknown game'}`);
                  return null;
                }
              } catch (matchError) {
                console.error(`Error attempting to match patterns in response for ${pick.game || 'unknown game'}:`, matchError);
                return null;
              }
            }
          }
          
          console.log(`Successfully extracted JSON for: ${pick.game}, confidence: ${jsonData.confidence || 'unknown'}`);
          return jsonData;
        })
        // Filter out null values
        .filter(jsonData => jsonData !== null);
        
      console.log(`Successfully extracted ${allParsedOutputs.length} valid JSON outputs from picks`);
      
      // First try to find picks with confidence >= 0.75 (primary threshold)
      let rawJsonOutputs = allParsedOutputs.filter(jsonData => {
        const confidence = jsonData.confidence || 0;
        const isAbovePrimaryThreshold = confidence >= 0.75;
        
        if (isAbovePrimaryThreshold) {
          console.log(`Pick for ${jsonData.homeTeam} vs ${jsonData.awayTeam} meets primary confidence threshold: ${confidence}`);
        }
        
        return isAbovePrimaryThreshold;
      });
      
      // If no picks meet the primary threshold, fall back to picks with confidence >= 0.6
      if (rawJsonOutputs.length === 0) {
        console.warn('No picks meet the 0.75 confidence threshold, falling back to 0.6+ confidence picks');
        
        rawJsonOutputs = allParsedOutputs.filter(jsonData => {
          const confidence = jsonData.confidence || 0;
          const isAboveFallbackThreshold = confidence >= 0.6;
          
          if (isAboveFallbackThreshold) {
            console.log(`Using fallback pick for ${jsonData.homeTeam} vs ${jsonData.awayTeam} with confidence: ${confidence}`);
          } else {
            console.warn(`Filtering out pick for ${jsonData.homeTeam} vs ${jsonData.awayTeam} - confidence ${confidence} below fallback threshold of 0.6`);
          }
          
          return isAboveFallbackThreshold;
        });
      }
      
      console.log(`After confidence filtering, storing ${rawJsonOutputs.length} valid picks`);
      
      // Skip if there are no valid picks
      if (rawJsonOutputs.length === 0) {
        console.warn('No valid picks with OpenAI output to store, even after fallback');
        return { success: false, message: 'No valid picks to store' };
      }
      
      // Create data structure for Supabase - only include fields that exist in the schema
      const pickData = {
        date: currentDateString,
        picks: rawJsonOutputs
      };
      
      // Ensure there's a valid Supabase session before database operation
      await picksService.ensureValidSupabaseSession();
      
      try {
        console.log(`Inserting raw JSON outputs directly into daily_picks table...`);
        const { error: insertError } = await supabase
          .from('daily_picks')
          .insert(pickData);
          
        if (insertError) {
          // Check if the error is specifically about the bankroll table
          if (insertError.code === '42P01' && insertError.message.includes('bankroll')) {
            console.warn('Bankroll table does not exist - using alternative approach without bankroll reference');
            
            // Alternative approach: Use a simplified object that doesn't trigger any bankroll references
            const simplifiedPickData = {
              date: currentDateString,
              picks: JSON.stringify(rawJsonOutputs) // Convert to string to ensure compatibility
            };
            
            // Try direct insert without any triggers/functions that might access bankroll
            const { error: simplifiedInsertError } = await supabase
              .from('daily_picks')
              .insert(simplifiedPickData);
              
            if (simplifiedInsertError) {
              console.error('Error inserting simplified picks:', simplifiedInsertError);
              throw new Error(`Failed to store simplified picks: ${simplifiedInsertError.message}`);
            }
            
            console.log('Picks stored successfully using simplified approach');
            return { success: true, count: rawJsonOutputs.length, method: 'simplified' };
          } else {
            // Some other database error occurred
            console.error('Error inserting picks:', insertError);
            throw new Error(`Failed to store picks in database: ${insertError.message}`);
          }
        }
        
        console.log('Picks stored successfully in database');
        return { success: true, count: rawJsonOutputs.length };
      } catch (dbError) {
        // Catch any errors during the database operations
        console.error('Database error while storing picks:', dbError);
        
        // If the error relates to the bankroll table, handle it specially
        if (dbError.message && dbError.message.includes('bankroll')) {
          console.warn('Detected bankroll table reference in error - attempting alternative storage method');
          
          try {
            // Try a simpler approach with the picks as a JSON string
            const backupPickData = {
              date: currentDateString,
              picks: JSON.stringify(rawJsonOutputs)
            };
            
            const { error: backupInsertError } = await supabase
              .from('daily_picks')
              .insert(backupPickData);
              
            if (backupInsertError) {
              console.error('Error with backup insert method:', backupInsertError);
              throw new Error(`Failed with backup method: ${backupInsertError.message}`);
            }
            
            console.log('Successfully stored picks using backup method');
            return { success: true, count: rawJsonOutputs.length, method: 'backup' };
          } catch (backupError) {
            console.error('Backup method also failed:', backupError);
            throw new Error(`All approaches failed to store picks: ${backupError.message}`);
          }
        }
        
        // Re-throw the original error
        throw new Error(`Failed to store picks in database: ${dbError.message}`);
      }
    } catch (error) {
      console.error('Error storing picks:', error);
      throw new Error(`Failed to store picks in database: ${error.message}`);
    }
  }
};

export { picksService };
