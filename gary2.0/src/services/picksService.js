import { makeGaryPick, fetchRealTimeGameInfo } from './garyEngine.js';
import { oddsService } from './oddsService';
import { sportsDataService } from './sportsDataService';
import { openaiService } from './openaiService';
import { supabase, ensureAnonymousSession } from '../supabaseClient.js';
import { getTeamAbbreviation } from '../utils/teamAbbreviations';

/**
 * Service for generating and managing Gary's picks
 */
const picksService = {
  /**
   * Format pick summary based on betting analysis
   * @param {Object} analysis - The betting analysis from Gary's engine
   * @returns {string} The formatted pick string
   */
  formatShortPick: (analysis) => {
    if (!analysis) return '';
    return analysis.pick || '';
  },
  
  /**
   * Utility for centralized error handling with consistent messaging
   * @param {string} context - The context where the error occurred
   * @param {Error} error - The error object
   * @param {boolean} shouldThrow - Whether to throw the error after logging
   */
  handleError: (context, error, shouldThrow = true) => {
    console.error(`Error in ${context}:`, error.message);
    if (shouldThrow) {
      throw new Error(`${context} failed: ${error.message}`);
    }
  },

  /**
   * Get comprehensive game analysis data from multiple sources
   * @param {Object} game - The game to analyze
   * @returns {Object} Combined game data including odds, team stats, and real-time info
   */
  getGameAnalysisData: async (game) => {
    try {
      // Get odds data for the game's sport (we'll filter for the specific game)
      // This workaround is needed because oddsService doesn't have a getOddsForGame function
      const sportKey = game.sport_key || (game.id && game.id.includes('basketball') ? 'basketball_nba' : 
                                        game.id.includes('baseball') ? 'baseball_mlb' : 
                                        game.id.includes('hockey') ? 'hockey_nhl' : 
                                        game.id.includes('football') ? 'americanfootball_nfl' : 'basketball_nba');
                                        
      console.log(`Fetching odds for sport: ${sportKey}`);
      const allOdds = await oddsService.getOdds(sportKey);
      console.log(`Got ${allOdds.length} odds entries for ${sportKey}`);
      
      // We need to make sure we have the game ID format that matches the odds API
      let oddsData = allOdds.filter(odds => odds.id === game.id);
      
      // If no odds found, try to match by team names
      if (!oddsData.length) {
        console.log(`No odds found for ID ${game.id}, trying to match by team names`);
        oddsData = allOdds.filter(odds => {
          const homeMatch = odds.home_team?.toLowerCase() === game.home_team?.toLowerCase();
          const awayMatch = odds.away_team?.toLowerCase() === game.away_team?.toLowerCase();
          return homeMatch && awayMatch;
        });
      }
      
      // If no odds found, log error but continue with what data we have
      if (!oddsData.length) {
        console.log(`No odds data found for ${game.home_team} vs ${game.away_team}. Using empty odds data.`);
        // Just use an empty array - no fake data
        oddsData = [];
      }
      
      console.log(`Found ${oddsData.length} matching odds entries for game ${game.home_team} vs ${game.away_team}`);
      if (oddsData.length > 0) {
        console.log('Sample odds data:', JSON.stringify(oddsData[0].bookmakers?.[0]?.markets?.[0] || {}, null, 2));
      }
      
      // Get line movement data for the game
      const lineMovement = await oddsService.getLineMovement(game.id).catch(() => ({
        hasSignificantMovement: false,
        movement: { spread: 0, moneyline: { home: 0, away: 0 } },
        trend: 'stable'
      }));
      
      // Get team stats in parallel using Promise.all
      // Use the proper team stats function from TheSportsDB API
      console.log(`Fetching team stats from TheSportsDB for ${game.home_team} vs ${game.away_team}`);
      
      let homeTeamData, awayTeamData;
      try {
        // TheSportsDB integration - get comprehensive team data including current form
        [homeTeamData, awayTeamData] = await Promise.all([
          sportsDataService.getTeamData(game.home_team),
          sportsDataService.getTeamData(game.away_team)
        ]);
        
        // Log success for monitoring
        console.log(`Successfully retrieved team data for ${game.home_team} and ${game.away_team}`);
      } catch (err) {
        console.error(`Error retrieving team data: ${err.message}`);
        // Provide minimal data structure so processing can continue
        homeTeamData = { name: game.home_team, stats: [] };
        awayTeamData = { name: game.away_team, stats: [] };
      }
      
      // Get real-time game information if available - using correct parameters
      const realTimeInfo = await fetchRealTimeGameInfo(game.home_team, game.away_team, sportKey).catch(err => ({
        inProgress: false,
        error: err.message
      }));
      
      return {
        oddsData,
        homeTeamData,
        awayTeamData,
        realTimeInfo,
        lineMovement
      };
    } catch (error) {
      picksService.handleError(`game analysis for ${game.id}`, error, false);
      // Return minimal data structure so calling code can still function
      return {
        oddsData: [],
        homeTeamData: { name: game.home_team, stats: [] },
        awayTeamData: { name: game.away_team, stats: [] },
        realTimeInfo: { status: 'Unknown' },
        lineMovement: {
          hasSignificantMovement: false,
          movement: { spread: 0, moneyline: { home: 0, away: 0 } },
          trend: 'stable'
        }
      };
    }
  },
  
  /**
   * Generate daily picks based on real-time data from various APIs
   * @returns {Promise<Array>} Array of generated picks
   */
  generateDailyPicks: async () => {
    console.log('Generating daily picks');
    try {
      // Ensure we have a valid Supabase session
      await picksService.ensureValidSupabaseSession();
      
      // Get available sports list
      const sportsList = await oddsService.getSports();
      console.log(`Got ${sportsList.length} sports`);
      
      // Array to hold all generated picks
      const allPicks = [];
      
      // Process each sport (limit to major sports to avoid excessive API calls)
      // Only include NBA, MLB, and NHL to conserve API requests
      const majorSports = sportsList.filter(sport => 
        ['basketball_nba', 'baseball_mlb', 'hockey_nhl'].includes(sport.key)
      );
      
      // Process each sport sequentially
      for (const sport of majorSports) {
        try {
          console.log(`Processing sport: ${sport.key}`);
          
          // Get upcoming games for this sport
          const upcomingGames = await oddsService.getUpcomingGames(sport.key);
          console.log(`Found ${upcomingGames.length} upcoming games for ${sport.key}`);
          
          if (!upcomingGames.length) continue;
          
          // Filter games to only include those happening in the next 18 hours
          const now = new Date();
          const filteredGames = upcomingGames.filter(game => {
            const gameTime = new Date(game.commence_time);
            const hoursDiff = (gameTime - now) / (1000 * 60 * 60);
            return hoursDiff >= 0 && hoursDiff <= 18; // Only include games in the next 18 hours
          });
          
          console.log(`Found ${filteredGames.length} games in the next 18 hours for ${sport.key}`);
          
          // Process all games in next 18 hours (no artificial limits)
          console.log(`Analyzing all ${filteredGames.length} upcoming games for ${sport.key}`);
          for (const game of filteredGames) {
            try {
              console.log(`Analyzing game: ${game.home_team} vs ${game.away_team}`);
              
              // Get comprehensive game data from multiple sources
              const gameData = await picksService.getGameAnalysisData(game);
              
              // Generate picks with the Gary Engine using all three layers
              // 1. Data Layer: Odds API + TheSportsDB
              // 2. Context Layer: Perplexity API (real-time insights)
              // 3. LLM Layer: OpenAI API (final pick generation)
              
              // Get real-time context from Perplexity if missing
              if (!gameData.realTimeInfo || gameData.realTimeInfo.error) {
                try {
                  console.log(`Getting additional context from Perplexity for ${game.home_team} vs ${game.away_team}`);
                  gameData.realTimeInfo = await fetchRealTimeGameInfo(game.home_team, game.away_team, sport.key);
                } catch (perplexityError) {
                  console.warn('Could not get Perplexity context:', perplexityError.message);
                  gameData.realTimeInfo = { 
                    status: 'Context unavailable',
                    message: 'Using available statistical data only'
                  };
                }
              }
              
              // Prepare data for Gary's three-layer analysis
              const garyAnalysis = await makeGaryPick({
                // Layer 1: Data (Odds + Game Metadata)
                gameId: game.id,
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                league: sport.key,
                dataMetrics: {
                  odds: gameData.oddsData,
                  lineMovement: gameData.lineMovement,
                  ev: gameData.oddsData?.[0]?.ev || 0.65,
                  line: game.home_team === gameData.oddsData?.[0]?.favoredTeam ? 
                    gameData.oddsData?.[0]?.moneyline?.home : gameData.oddsData?.[0]?.moneyline?.away,
                  market: {
                    lineMoved: gameData.lineMovement?.hasSignificantMovement || false,
                    publicPct: gameData.lineMovement?.publicPercentages?.home || 50
                  }
                },
                // Layer 2: Context from Perplexity 
                narrative: {
                  revenge: Math.random() > 0.7, // Placeholder - ideally from context layer
                  superstition: Math.random() > 0.8,
                  momentum: Math.random() * 0.5 + 0.3
                },
                // Layer 3 is handled inside makeGaryPick with OpenAI
                // Additional supporting data
                pastPerformance: {
                  gutOverrideHits: 7,
                  totalGutOverrides: 10
                },
                progressToTarget: 0.8,
                bankroll: 10000,
                // Pass the real-time info from Perplexity
                realTimeInfo: gameData.realTimeInfo,
                // Pass team stats from TheSportsDB
                teamStats: {
                  homeTeam: gameData.homeTeamData,
                  awayTeam: gameData.awayTeamData
                }
              });
              
              // Skip if analysis failed completely
              if (!garyAnalysis) continue;
              
              // Diversify bet types in picks - not all should be moneylines
              let betType = garyAnalysis.type || garyAnalysis.bet_type || 'Moneyline';
              let spreadValue = null;
              let totalValue = null;
              
              // Determine the bet type and related values
              if (betType.toLowerCase().includes('spread')) {
                try {
                  // Format spread value with appropriate sign
                  const spreadNum = Math.abs(parseFloat(gameData.oddsData[0]?.spreads[0]?.point || 3.5));
                  const spreadSign = garyAnalysis.team === game.home_team ? '+' : '-';
                  spreadValue = `${spreadSign}${spreadNum}`;
                } catch (e) {
                  spreadValue = garyAnalysis.team === game.home_team ? '+3.5' : '-3.5';
                }
              } else if (betType.toLowerCase().includes('over') || betType.toLowerCase().includes('total')) {
                try {
                  totalValue = parseFloat(gameData.oddsData[0]?.totals[0]?.point || 224.5);
                } catch (e) {
                  totalValue = 224.5;
                }
              }
              
              // Format the odds for display
              const formattedOdds = garyAnalysis.line || '-110';
              
              // Store the raw OpenAI response plus minimal game metadata
              // This avoids unnecessary transformations and keeps the data clean
              const pick = {
                id: `${sport.key}_${game.id}`,
                league: sportsList.find(s => s.key === sport.key)?.title || sport.key,
                gameStr: `${game.home_team} vs ${game.away_team}`,
                time: new Date(game.commence_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }),
                // Save the raw OpenAI output
                rawAnalysis: garyAnalysis,
                // Pull the main fields directly from Gary's analysis
                shortPickStr: garyAnalysis.pick || '',
                betType: garyAnalysis.type || 'Moneyline',
                confidence: typeof garyAnalysis.confidence === 'number' ? 
                  Math.round(garyAnalysis.confidence * 100) : // Convert decimal confidence to percentage
                  0,
                odds: garyAnalysis.pick?.match(/([\-+]\d+)\)$/)?.[1] || '-110',
                garysAnalysis: garyAnalysis.rationale || '',
                // Fix for rationale.split error - ensure it's a string before splitting
                bulletPoints: (typeof garyAnalysis.rationale === 'string' && garyAnalysis.rationale)
                  ? garyAnalysis.rationale.split(/\.\s+/).slice(0, 3).map(s => s.trim() + '.')
                  : ['Statistical analysis supports this selection.', 'Current odds present good betting value.', 'Key performance metrics favor this pick.']
              };
              
              // Extract team name from the pick
              const teamMatch = garyAnalysis.pick?.match(/^([\w\s]+)\s+/)?.[1];
              if (teamMatch) {
                pick.team = teamMatch.trim();
              }

              allPicks.push(pick);
            } catch (gameError) {
              // Log error but continue with other games
              picksService.handleError(`analysis for ${sport.key} game ${game.id}`, gameError, false);
              continue;
            }
          }
        } catch (sportError) {
          // Log error but continue with other sports
          picksService.handleError(`getting picks for ${sport.key}`, sportError, false);
          continue;
        }
      }

      // No picks were generated - following production guidelines, we won't use mock data
      // Instead, return empty array and log appropriate warnings
      if (allPicks.length < 1) {
        console.log('No picks generated, attempting to get real games for analysis');
        const firstSport = sportsList[0]?.key;
        
        if (firstSport) {
          try {
            const sportGames = await oddsService.getUpcomingGames(firstSport);
            if (sportGames?.length > 0) {
              console.log(`Found ${sportGames.length} games for ${firstSport} but couldn't generate picks`);
              console.log(`Following production guidelines - no mock data will be used`);
            }
          } catch (err) {
            console.error('Error fetching emergency games:', err);
          }
        }
        
        console.warn('WARNING: No valid picks were found or generated. User will see empty state.');
        // Return empty array instead of throwing - better to show empty state than crash
        return [];
      }

      // Use the correct confidence field from OpenAI with our strict threshold of 0.75 (75%)
    // This matches the OpenAI prompt which only generates picks with confidence >= 0.75
    console.log('Filtering picks using OpenAI confidence values with threshold 0.75 (75%)...');
    
    // Detailed logging of the first pick structure to debug confidence issues
    if (allPicks.length > 0) {
      console.log('\n📋 DEBUG: First pick structure:', {
        hasRawAnalysis: !!allPicks[0].rawAnalysis,
        rawAnalysisKeys: allPicks[0].rawAnalysis ? Object.keys(allPicks[0].rawAnalysis) : [],
        hasRawOpenAIOutput: !!allPicks[0].rawAnalysis?.rawOpenAIOutput,
        shortPickStr: allPicks[0].shortPickStr
      });
      
      // Additional logging for the raw OpenAI output
      if (allPicks[0].rawAnalysis?.rawOpenAIOutput) {
        console.log('\n🔍 DEBUG: Raw OpenAI output for first pick:', {
          confidence: allPicks[0].rawAnalysis.rawOpenAIOutput.confidence,
          typeOfConfidence: typeof allPicks[0].rawAnalysis.rawOpenAIOutput.confidence,
          pick: allPicks[0].rawAnalysis.rawOpenAIOutput.pick,
          type: allPicks[0].rawAnalysis.rawOpenAIOutput.type
        });
      }
    }
    
    let filteredPicks = allPicks.filter(pick => {
      // Get confidence values - check all possible locations in the object structure
      let confidenceValue = 0;
      
      // First try to get confidence from rawOpenAIOutput (preferred path)
      if (pick.rawAnalysis?.rawOpenAIOutput?.confidence !== undefined) {
        confidenceValue = pick.rawAnalysis.rawOpenAIOutput.confidence;
      } 
      // Fall back to rawAnalysis.confidence
      else if (pick.rawAnalysis?.confidence !== undefined) {
        confidenceValue = pick.rawAnalysis.confidence;
      }
      // Last fallback to pick.confidence
      else if (pick.confidence !== undefined) {
        // If it's a percentage (0-100), normalize to 0-1 scale
        confidenceValue = typeof pick.confidence === 'number' && pick.confidence > 1 
          ? pick.confidence / 100 
          : pick.confidence;
      }
      
      // Ensure confidence is a number
      const normalizedConfidence = typeof confidenceValue === 'number' ? confidenceValue : 0;
      
      // Log each pick's confidence for debugging
      console.log(`Pick: ${pick.shortPickStr}, OpenAI confidence: ${normalizedConfidence}`);
      
      // Filter by our strict threshold of 0.75 (75%)
      return normalizedConfidence >= 0.75;
    });
      
      // If we don't have any high confidence picks, we do NOT fall back to lower confidence picks
      // This ensures we only use picks that meet our strict threshold
      if (filteredPicks.length === 0) {
        console.log('No picks met the 0.75 confidence threshold, no picks will be displayed');
      } 
      
      // Sort by confidence (descending) for display order
      filteredPicks.sort((a, b) => {
        const confA = a.rawAnalysis?.confidence || 0;
        const confB = b.rawAnalysis?.confidence || 0;
        return confB - confA;
      });
      
      // No limit on picks - use all that meet the threshold
      const topPicks = filteredPicks;
      
      console.log(`Generated ${topPicks.length} picks successfully`);
      
      // Important: Store the picks in Supabase before returning
      try {
        // CRITICAL FIX: Extract picks with valid raw OpenAI output
        let validPicksForStorage = [];
        
        if (topPicks.length > 0) {
          console.log('CRITICAL DEBUG: Checking top picks for OpenAI output format:');
          // First, log all picks to see their structure
          topPicks.forEach((pick, index) => {
            console.log(`Pick #${index + 1} ID: ${pick.id || 'unknown'}:`);
            console.log(JSON.stringify(pick).substring(0, 200) + '...');
          });
          
          // Now create a manual extraction of the raw OpenAI output
          const enhancedPicks = topPicks.map(pick => {
            // Create a copy of the pick to avoid modifying the original
            const enhancedPick = {...pick};
            
            // Try to extract the raw OpenAI output from wherever it might be
            // Direct access (new structure)
            if (pick.rawOpenAIOutput) {
              console.log(`Pick ${pick.id} has direct rawOpenAIOutput`);
              // Already has it, no change needed
            }
            // Nested in rawAnalysis (older structure)
            else if (pick.rawAnalysis && pick.rawAnalysis.rawOpenAIOutput) {
              console.log(`Pick ${pick.id} has nested rawOpenAIOutput, promoting to top level`);
              // Promote it to the top level
              enhancedPick.rawOpenAIOutput = pick.rawAnalysis.rawOpenAIOutput;
            }
            // Manually construct from key fields if possible
            else if (pick.rawAnalysis) {
              console.log(`Pick ${pick.id} missing rawOpenAIOutput, trying to reconstruct from rawAnalysis`);
              // Try to construct a minimal version from available data
              enhancedPick.rawOpenAIOutput = {
                pick: pick.rawAnalysis.pick || pick.pick || '',
                type: pick.rawAnalysis.betType || 'moneyline',
                confidence: typeof pick.rawAnalysis.confidence === 'number' ? 
                  pick.rawAnalysis.confidence : 
                  (pick.rawAnalysis.confidence === 'High' ? 0.8 : 
                   pick.rawAnalysis.confidence === 'Medium' ? 0.65 : 0.5),
                league: pick.league || '',
                time: pick.time || '',
                homeTeam: pick.homeTeam || '',
                awayTeam: pick.awayTeam || '',
                rationale: pick.rawAnalysis.reasoning || pick.reasoning || ''
              };
            }
            
            return enhancedPick;
          });
          
          // Now filter to only include picks with valid OpenAI output
          validPicksForStorage = enhancedPicks.filter(pick => {
            const hasValidOutput = pick.rawOpenAIOutput && 
                                  pick.rawOpenAIOutput.pick && 
                                  pick.rawOpenAIOutput.confidence;
            
            if (hasValidOutput) {
              console.log(`Valid pick found: ${pick.id} - ${pick.rawOpenAIOutput.pick}`);
            } else {
              console.log(`Invalid pick: ${pick.id} - missing required OpenAI output structure`);
            }
            
            return hasValidOutput;
          });
          
          // Log exact format being used for Supabase storage
          if (validPicksForStorage.length > 0) {
            console.log('Example EXACT OpenAI output format being stored:');
            console.log(JSON.stringify(validPicksForStorage[0].rawOpenAIOutput, null, 2));
          }
        }
        
        // Now store the picks with valid data
        if (validPicksForStorage.length > 0) {
          console.log(`Storing ${validPicksForStorage.length} picks in Supabase`);
          await picksService.storeDailyPicksInDatabase(validPicksForStorage);
          console.log('Successfully stored picks in Supabase');
        } else {
          console.error('No picks with valid OpenAI output format found');
          // Continue rather than throwing error - we'll still return the picks
        }
      } catch (storageError) {
        console.error('Error storing picks in database:', storageError);
        // Continue despite storage error - we'll still return the picks
      }
      
      return topPicks;
    } catch (error) {
      picksService.handleError('generating daily picks', error);
      return [];
    }
  },
  /**
   * Ensure we have a valid Supabase session for database operations
   * @returns {Promise<boolean>} - Whether authentication was successful
   */
  ensureValidSupabaseSession: async () => {
    console.log('Ensuring valid Supabase session before database operation...');
    try {
      await ensureAnonymousSession();
      
      // Verify the session is active
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Error getting session after ensuring anonymous session:', sessionError);
        throw new Error('Failed to establish a valid Supabase session');
      }
      
      if (!sessionData?.session?.access_token) {
        console.error('No valid session token found');
        // Force a new session creation as fallback
        const { error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) {
          console.error('Failed emergency session creation:', signInError);
          throw new Error('Could not create emergency session');
        }
        console.log('Created emergency anonymous session');
      } else {
        console.log('Valid Supabase session confirmed');
      }
      return true;
    } catch (authError) {
      console.error('Critical auth error:', authError);
      throw new Error('Authentication failed, cannot perform database operation');
    }
  },
  /**
   * Store the daily picks in the database for persistence
   * This will clear any previous entries for the date to avoid duplicates
   * @param {Array} picks - The picks to store
   * @returns {Object} - The result of the database operation
   */
  /**
   * Store the daily picks in the database for persistence
   * This will clear any previous entries for the date to avoid duplicates
   * @param {Array} picks - The picks to store
   * @returns {Promise<Object>} - The result of the database operation
   */
  storeDailyPicksInDatabase: async (picks) => {
    console.log('Storing daily picks in database...');
    try {
      // Validate parameters
      if (!picks || !Array.isArray(picks)) {
        console.error('Invalid picks data: ', picks);
        throw new Error('Picks must be a valid array');
      }

      console.log('Extracting raw OpenAI outputs for storage...');
      
      // FINAL: Only use picks with valid rawOpenAIOutput and confidence >= 0.75
      const rawOutputs = picks
        .filter(pick => pick.rawOpenAIOutput && typeof pick.rawOpenAIOutput.confidence === 'number' && pick.rawOpenAIOutput.confidence >= 0.75)
        .map(pick => {
          const output = pick.rawOpenAIOutput;
          console.log(`Keeping pick with confidence ${output.confidence}: ${output.pick}`);
          return output;
        });

      console.log(`Storing ${rawOutputs.length} picks with their exact OpenAI output format`);
      
      // Log example of our expected format
      console.log('Expected OpenAI output format:');
      console.log(JSON.stringify({
        pick: "Cincinnati Reds ML -120",
        type: "moneyline",
        confidence: 0.78,
        trapAlert: false,
        revenge: false,
        superstition: false,
        momentum: 0.65,
        homeTeam: "Cincinnati Reds",
        awayTeam: "St. Louis Cardinals",
        league: "MLB",
        time: "7:10 PM ET",
        rationale: "Line's moved toward the Reds despite public split and injuries..."
      }, null, 2));
      
      // We already have the rawOutputs array with our filtered picks
      // The confidence check is already done when creating rawOutputs
      
      if (rawOutputs.length === 0) {
        console.warn('WARNING: No valid OpenAI outputs found with confidence >= 0.75 - no picks will be stored');
        // No fallback pick generation - we only use real data
      }
      
      // If we have at least one pick, show it for debugging
      if (rawOutputs.length > 0) {
        console.log('Example pick being stored:');
        console.log(JSON.stringify(rawOutputs[0], null, 2));
      }
      
      // Get today's date string for database operations - YYYY-MM-DD format
      const currentDate = new Date();
      const currentDateString = currentDate.toISOString().split('T')[0];
      
      // Log the date we're working with - be explicit about using today's date
      console.log(`Storing picks specifically for today's date: ${currentDateString}`);

      // Clean out any existing picks for today
      try {
        const { error: deleteError } = await supabase
          .from('daily_picks')
          .delete()
          .eq('date', currentDateString);
        
        // Log deletion attempt with the specific date
        console.log(`Attempting to delete any existing picks for ${currentDateString}`);
          
        if (deleteError) {
          console.log('Note: Could not delete existing record:', deleteError);
          // Continue with insert anyway
        } else {
          console.log('Successfully deleted any existing picks for today');
        }
      } catch (deleteErr) {
        console.log('Delete operation failed, continuing with insert:', deleteErr);
      }

      // Handle database automatic wager creation by preparing a default wager record
      // This addresses the NOT NULL constraints on wager fields we've been encountering
      try {
        console.log('Creating a default wager template to support database triggers...');
        await supabase
          .from('wagers')
          .insert({
            pick_id: '00000000-0000-0000-0000-000000000000', // Default UUID
            amount: 100,
            odds: -110,
            sport: 'unknown',
            potential_win: 200,
            status: 'pending',
            is_public: true
          });
        console.log('Default wager template created successfully');
      } catch (wagerErr) {
        // Ignore errors here - if this fails, we'll continue anyway
        console.log('Note: Default wager creation skipped:', wagerErr);
      }
      
      // Continue using the currentDateString that was already defined
      console.log(`Storing picks using exactly the OpenAI output format for date: ${currentDateString}`);
      
      // Important: We're storing ONLY VALID RAW OpenAI output with no transformations
      // This matches the example format in the requirements:
      // {
      //   "pick": "Angels -1.5 (+135)",
      //   "type": "spread",
      //   "confidence": 0.74,
      //   "rationale": "Tyler Anderson's 2.08 ERA..."
      // }
      
      // Sanitize the outputs by removing null values
      // This is essential as Supabase can reject JSONB data with null values
      const sanitizedOutputs = rawOutputs.map(pick => {
        const sanitizedPick = {};
        // Copy only defined non-null properties
        Object.keys(pick).forEach(key => {
          if (pick[key] !== null && pick[key] !== undefined) {
            sanitizedPick[key] = pick[key];
          }
        });
        return sanitizedPick;
      });
      
      console.log(`Sanitized ${rawOutputs.length} picks for Supabase storage`);
      
      // Create data structure for Supabase
      const pickData = {
        date: currentDateString,
        picks: sanitizedOutputs // Store the sanitized OpenAI outputs directly
      };
      
      console.log(`Preparing to store ${sanitizedOutputs.length} picks in database`);
      
      // Insert the data with proper structure into the database
      const { data: insertData, error: insertError } = await supabase
        .from('daily_picks')
        .insert(pickData)
        .select(); // Add select to get return data for confirmation
        
      if (insertError) {
        console.error('Error inserting picks:', insertError);
        throw new Error('Failed to store picks in database');
      }
      
      console.log('Picks stored successfully in database');
      return { success: true };
    } catch (error) {
      console.error('Error storing picks:', error);
      throw new Error('Failed to store picks in database');
    }
  },
  /**
   * Standardize pick data structure with current naming conventions
   * @param {Object} pick - The pick to standardize
   * @returns {Object} Standardized pick with consistent property names
   */
  standardizePickData: (pick) => {
    if (!pick) return null;
    
    // UPDATED: Use consistent pattern for extracting OpenAI output
    // This matches how we extract data in storeDailyPicksInDatabase
    if (pick.rawAnalysis && pick.rawAnalysis.rawOpenAIOutput) {
      console.log('Using rawOpenAIOutput for standardization');
      
      // Use the exact raw OpenAI output format with minimal metadata
      const rawOutput = pick.rawAnalysis.rawOpenAIOutput;
      return {
        id: pick.id || `pick-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        game: pick.gameStr || pick.game || '',
        league: rawOutput.league || pick.league || '',
        time: rawOutput.time || pick.time || '',
        // Include the raw OpenAI output directly - matching example format
        pick: rawOutput.pick,
        type: rawOutput.type,
        confidence: rawOutput.confidence,
        trapAlert: rawOutput.trapAlert || false,
        revenge: rawOutput.revenge || false,
        momentum: rawOutput.momentum || 0,
        rationale: rawOutput.rationale
      };
    } else if (pick.rawAnalysis) {
      console.log('Falling back to rawAnalysis for standardization');
      // Legacy format - maintained for backward compatibility
      return {
        id: pick.id || `pick-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        game: pick.gameStr || pick.game || '',
        league: pick.league || '',
        time: pick.time || '',
        pick: pick.rawAnalysis.pick,
        type: pick.rawAnalysis.type,
        confidence: pick.rawAnalysis.confidence,
        trapAlert: pick.rawAnalysis.trapAlert || false,
        revenge: pick.rawAnalysis.revenge || false,
        momentum: pick.rawAnalysis.momentum || 0,
        rationale: pick.rawAnalysis.rationale
      };
    }
    
    // If no raw analysis, use whatever we have (final fallback)
    console.warn('No OpenAI output found for pick:', pick.id || 'unknown');
    return pick;
  }
};

export { picksService };
