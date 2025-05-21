/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import { oddsService } from './oddsService';
import { propOddsService } from './propOddsService';
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { perplexityService } from './perplexityService';
import { sportsDbApiService } from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import { nbaSeason, formatSeason, getCurrentEST, formatInEST } from '../utils/dateUtils.js';

/**
 * Fetch active players for a team with their current season stats
 * Uses TheSportsDB for current rosters across all sports
 */
async function fetchActivePlayers(teamName, league) {
  try {
    console.log(`Fetching active ${league} players for ${teamName}...`);
    let leagueId;
    switch (league) {
      case 'NBA': leagueId = sportsDbApiService.leagueIds.NBA; break;
      case 'MLB': leagueId = sportsDbApiService.leagueIds.MLB; break;
      case 'NHL': leagueId = sportsDbApiService.leagueIds.NHL; break;
      default: throw new Error(`Unsupported league: ${league}`);
    }
    const team = await sportsDbApiService.lookupTeam(teamName, leagueId);
    if (!team?.idTeam) return [];
    const roster = await sportsDbApiService.getTeamPlayers(team.idTeam);
    console.log(`Got ${roster.length} players from TheSportsDB for ${teamName}`);
    return roster;
  } catch (error) {
    console.error(`Error fetching players for ${teamName} (${league}):`, error);
    return [];
  }
}

/**
 * Helper function to format player stats for text display
 */
function formatPlayerStats(players) {
  return players.map(player => {
    return `- ${player.name} (${player.position}): Team: ${player.team}, Height: ${player.height}, Weight: ${player.weight}`;
  }).join('\n');
}

/**
 * Levenshtein distance for name matching
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return Infinity;
  const dp = Array(b.length + 1).fill().map((_, i) => [i]);
  dp[0] = [...Array(a.length + 1).keys()];
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[b.length][a.length];
}

/**
 * Function to find best match for a player name in a team roster
 */
function findBestMatch(playerName, teamPlayers) {
  if (!teamPlayers || teamPlayers.length === 0) return null;
  
  // Get normalized player name using the Ball Don't Lie service
  let normalizedSearch = '';
  try {
    normalizedSearch = ballDontLieService.normalizePlayerName(playerName);
  } catch (e) {
    // If the normalize function isn't available, do simple normalization
    normalizedSearch = playerName.toLowerCase().replace(/\./g, '').trim();
  }
  
  // Calculate similarity score for each player
  let bestMatch = null;
  let bestScore = 100; // Lower is better
  
  for (const player of teamPlayers) {
    const fullName = `${player.first_name} ${player.last_name}`;
    
    // Normalize player name from roster
    let normalizedName = '';
    try {
      normalizedName = ballDontLieService.normalizePlayerName(fullName);
    } catch (e) {
      normalizedName = fullName.toLowerCase().replace(/\./g, '').trim();
    }
    
    // Use levenshteinDistance for name similarity
    const score = levenshteinDistance(normalizedName, normalizedSearch);
    
    if (score < bestScore) {
      bestScore = score;
      bestMatch = player;
    }
  }
  
  // Return the best match if score is good enough (lower is better)
  if (bestMatch && bestScore < 4) {
    return bestMatch;
  }
  
  return null;
}

/**
 * Creates a prompt for generating prop picks
 */
function createPropPicksPrompt(gameData, playerStatsText, propOddsData) {
  // Format the odds data
  const oddsText = propOddsData.map(prop => 
    `${prop.player}: ${prop.prop_type} ${prop.line} (O:${prop.over_odds}/U:${prop.under_odds})`
  ).join('\n');
  
  return `Analyze the upcoming ${gameData.league} game: ${gameData.matchup}\n\n` +
         `TEAMS:\n${gameData.homeTeam} vs ${gameData.awayTeam}\n\n` +
         `PLAYER STATISTICS:\n${playerStatsText}\n\n` +
         `AVAILABLE PROPS:\n${oddsText}\n\n` +
         `Generate high-confidence prop picks based on the stats and trends. For each pick, include:\n` +
         `1. Player name and team\n` +
         `2. Prop type and line\n` +
         `3. Your pick (over or under)\n` +
         `4. Confidence level (0.7-1.0 scale)\n` +
         `5. American odds value\n` +
         `6. EV (Expected Value) as a percentage return on $100 bet\n` +
         `7. Detailed rationale supporting the pick\n\n` +
         `IMPORTANT: Calculate EV (Expected Value) for each pick using this formula:\n` +
         `1. Convert American odds to decimal odds (d)\n` +
         `   - For positive odds: d = (odds/100) + 1\n` +
         `   - For negative odds: d = (100/abs(odds)) + 1\n` +
         `2. Estimate the true probability (p) of the pick winning based on your analysis\n` +
         `3. Calculate EV: p*(d-1)*100 - (1-p)*100\n` +
         `4. Express EV as a whole number (e.g., 22 for 22% return on $100)`;
}

/**
 * Parses OpenAI response into structured prop picks
 */
function parseOpenAIResponse(response) {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
    if (jsonMatch && jsonMatch[0]) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no valid JSON found, return empty array
    return [];
  } catch (error) {
    console.error('Error parsing OpenAI response:', error);
    return [];
  }
}

/**
 * Ensure we have a valid Supabase session
 */
async function ensureValidSupabaseSession() {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      console.warn('No session, signing in anonymously');
      await supabase.auth.signInAnonymously();
    }
  } catch (error) {
    console.error('Session error, fallback', error);
    await supabase.auth.signInAnonymously();
  }
}

const propPicksService = {
  /**
   * Generate player prop picks for today
   */
  generateDailyPropPicks: async () => {
    try {
        console.log('Generating daily MLB player prop picks');
        const date = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        // Focus exclusively on MLB props as requested
        const sportsToAnalyze = ['baseball_mlb']; // MLB only, skip NBA and NHL
        const allPropPicks = [];
        
        // Process one sport at a time to avoid overwhelming OpenAI API
        for (const sport of sportsToAnalyze) {
          console.log(`\n==== Processing ${sport} player props ====`);
          const today = date; // Use the date variable defined above
          
          try {
            console.log(`Getting prop picks for ${sport} on ${today}`);
            
            // Get games for this sport using getUpcomingGames instead of getGamesForDay
            console.log(`Using getUpcomingGames for ${sport} games...`);
            let games = await oddsService.getUpcomingGames(sport, { date: today });
            
            if (!games || games.length === 0) {
              console.log(`No games found for ${sport} on ${today}`);
              continue; // Skip to next sport rather than returning
            }
            
            // Filter games by date if needed
            let gameOdds = games.filter(game => {
              const gameDate = new Date(game.commence_time).toISOString().split('T')[0];
              return gameDate === today;
            });
            
            console.log(`Found ${games.length} total games, ${gameOdds.length} scheduled for ${today}`);
            
            if (gameOdds.length === 0) {
              console.log(`No games found for ${sport} on ${today} after date filtering`);
              continue; // Skip to next sport rather than returning
            }
            
            // Filter out games that have already started
            try {
              const currentTime = getCurrentEST();
              gameOdds = gameOdds.filter(game => {
                if (!game.commence_time) return true; // Keep games with no start time
                
                const gameStartTime = new Date(game.commence_time);
                const gameStartEST = new Date(gameStartTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
                const notStarted = gameStartEST > currentTime;
              
                if (!notStarted) {
                  console.log(`Skipping game ${game.home_team} vs ${game.away_team} - already started at ${formatInEST(gameStartTime, { hour: '2-digit', minute: '2-digit' })} EST`);
                }
                
                return notStarted;
              });
            } catch (error) {
              console.error('Error filtering games by start time:', error.message);
              // Continue with all games if time filtering fails
              console.log('Proceeding with all available games due to time filtering error');
            }
            
            if (gameOdds.length === 0) {
              console.log(`All games for ${sport} on ${today} have already started`);
              continue; // Skip to next sport rather than returning
            }
            
            console.log(`Found ${gameOdds.length} upcoming games for ${sport}`);
            
            // Map sport key to readable name
            const sportName = sport.includes('basketball') ? 'NBA' :
                             sport.includes('baseball') ? 'MLB' :
                             sport.includes('hockey') ? 'NHL' :
                             sport.includes('football') ? 'NFL' : 'Unknown';
            
            // For each game, generate player props
            for (const game of gameOdds) {
              try {
                console.log(`\n-- Analyzing game: ${game.home_team} vs ${game.away_team} --`);
                
                // Format the game data for prop picks analysis
                const gameData = {
                  homeTeam: game.home_team,
                  awayTeam: game.away_team,
                  matchup: `${game.home_team} vs ${game.away_team}`,
                  league: sportName,
                  sportKey: sport,
                  time: game.commence_time ? new Date(game.commence_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'TBD'
                };
                
                // Fetch player data for MLB teams from TheSportsDB
                try {
                  console.log(`Fetching team and player data for ${sportName} using TheSportsDB API...`);
                  
                  // Look up teams based on sport
                  let homeTeamData = null;
                  let awayTeamData = null;
                  let homeTeamPlayers = [];
                  let awayTeamPlayers = [];
                  
                  // Only handling MLB for props as configured
                  console.log(`Using TheSportsDB API for MLB teams and players`);
                  
                  // Look up MLB teams using TheSportsDB
                  const homeTeamSportsDb = await sportsDbApiService.lookupTeam(
                    game.home_team, 
                    sportsDbApiService.leagueIds.MLB
                  );
                  
                  const awayTeamSportsDb = await sportsDbApiService.lookupTeam(
                    game.away_team, 
                    sportsDbApiService.leagueIds.MLB
                  );
                  
                  // Set team data from SportsDB results
                  if (homeTeamSportsDb) {
                    homeTeamData = {
                      id: homeTeamSportsDb.idTeam,
                      name: homeTeamSportsDb.strTeam,
                      full_name: homeTeamSportsDb.strTeam,
                      city: homeTeamSportsDb.strTeam.split(' ').slice(0, -1).join(' ') || homeTeamSportsDb.strTeam
                    };
                    
                    // Get current MLB players for this team
                    const sportsDbHomePlayers = await sportsDbApiService.getTeamPlayers(homeTeamData.id);
                    
                    // Convert SportsDB player format to match our expected format
                    homeTeamPlayers = sportsDbHomePlayers.map(player => ({
                      id: player.idPlayer,
                      first_name: player.strPlayer.split(' ')[0],
                      last_name: player.strPlayer.split(' ').slice(1).join(' '),
                      position: player.strPosition,
                      height_feet: null,
                      height_inches: null,
                      weight_pounds: player.strWeight ? parseInt(player.strWeight) : null,
                      team: {
                        id: homeTeamData.id,
                        name: homeTeamData.name,
                        full_name: homeTeamData.full_name,
                        city: homeTeamData.city
                      },
                      seasons: [],
                      is_pitcher: player.strPosition === 'Pitcher' || 
                                player.strPosition === 'Starting Pitcher' || 
                                player.strPosition === 'Relief Pitcher'
                    }));
                    console.log(`Found ${homeTeamPlayers.length} current MLB players for ${homeTeamData.full_name}`);
                  } else {
                    console.warn(`Could not find MLB team data for ${game.home_team}`);
                  }
                  
                  if (awayTeamSportsDb) {
                    awayTeamData = {
                      id: awayTeamSportsDb.idTeam,
                      name: awayTeamSportsDb.strTeam,
                      full_name: awayTeamSportsDb.strTeam,
                      city: awayTeamSportsDb.strTeam.split(' ').slice(0, -1).join(' ') || awayTeamSportsDb.strTeam
                    };
                    
                    // Get current MLB players for this team
                    const sportsDbAwayPlayers = await sportsDbApiService.getTeamPlayers(awayTeamData.id);
                    
                    // Convert SportsDB player format to match our expected format
                    awayTeamPlayers = sportsDbAwayPlayers.map(player => ({
                      id: player.idPlayer,
                      first_name: player.strPlayer.split(' ')[0],
                      last_name: player.strPlayer.split(' ').slice(1).join(' '),
                      position: player.strPosition,
                      height_feet: null,
                      height_inches: null,
                      weight_pounds: player.strWeight ? parseInt(player.strWeight) : null,
                      team: {
                        id: awayTeamData.id,
                        name: awayTeamData.name,
                        full_name: awayTeamData.full_name,
                        city: awayTeamData.city
                      },
                      // Add MLB-specific fields
                      is_pitcher: player.strPosition === 'Pitcher' || 
                                player.strPosition === 'Starting Pitcher' || 
                                player.strPosition === 'Relief Pitcher'
                    }));
                    console.log(`Found ${awayTeamPlayers.length} current MLB players for ${awayTeamData.full_name}`);
                  } else {
                    console.warn(`Could not find MLB team data for ${game.away_team}`);
                  }
                  
                  
                  // Add player stats to the game data
                  gameData.playerStats = {
                    homeTeam: {
                      id: homeTeamData?.id || null,
                      name: homeTeamData?.full_name || game.home_team,
                      players: homeTeamPlayers
                    },
                    awayTeam: {
                      id: awayTeamData?.id || null,
                      name: awayTeamData?.full_name || game.away_team,
                      players: awayTeamPlayers
                    }
                  };
                  
                } catch (statsError) {
                  console.error(`Error fetching player stats: ${statsError.message}`);
                  // Proceed without player stats if there's an error
                }
                
                // Get player-specific data based on the league - using Ball Don't Lie for MLB
                try {
                  // Get team rosters first from SportsDB (only for player identification)
                  console.log('🔍 Fetching team rosters from SportsDB API...');
                  const teamRostersData = await sportsDbApiService.getPlayerStatsForProps(
                    gameData.homeTeam,
                    gameData.awayTeam,
                    gameData.league
                  );
                  
                  if (teamRostersData && !teamRostersData.error) {
                    console.log('✅ Successfully fetched team rosters from SportsDB API');
                    console.log(`📊 Found ${teamRostersData.homeTeam.players.length + teamRostersData.awayTeam.players.length} total players`);
                    
                    // Store basic roster data (we'll enrich it with stats)
                    gameData.teamRosters = teamRostersData;
                    
                    // If this is MLB, fetch detailed stats from Ball Don't Lie API
                    if (gameData.league === 'MLB') {
                      console.log('🏆 Using Ball Don\'t Lie API for detailed MLB player statistics (GOAT plan)...');
                      
                      // Step 1: Get full list of players for both teams
                      const allPlayerNames = [];
                      
                      // Collect home team players
                      teamRostersData.homeTeam.players.forEach(player => {
                        allPlayerNames.push(player.name);
                      });
                      
                      // Collect away team players
                      teamRostersData.awayTeam.players.forEach(player => {
                        allPlayerNames.push(player.name);
                      });
                      
                      // Step 2: Try multiple approaches to find players in Ball Don't Lie API
                      console.log('Approach 1: Searching for players by team first...');
                      
                      // First, try to get players by team name (often more reliable)
                      const homeTeamPlayers = await ballDontLieService.getPlayersByTeam(gameData.homeTeam)
                        .catch(error => {
                          console.warn(`Could not find players for team ${gameData.homeTeam}: ${error.message}`);
                          return []; // Return empty array on error
                        });
                      
                      const awayTeamPlayers = await ballDontLieService.getPlayersByTeam(gameData.awayTeam)
                        .catch(error => {
                          console.warn(`Could not find players for team ${gameData.awayTeam}: ${error.message}`);
                          return []; // Return empty array on error
                        });
                      
                      console.log(`Found ${homeTeamPlayers.length} players for ${gameData.homeTeam} and ${awayTeamPlayers.length} players for ${gameData.awayTeam}`);
                      
                      // Map of player names to Ball Don't Lie player IDs
                      const playerNameToId = {};
                      const playerIdToDetails = {};
                      
                      // Try to match each player from the roster using the team players
                      for (const playerName of allPlayerNames) {
                        // Skip if we've already matched this player
                        if (playerNameToId[playerName]) continue;
                        
                        // Determine which team this player belongs to
                        const isHomeTeam = teamRostersData.homeTeam.players.some(p => p.name === playerName);
                        const teamPlayers = isHomeTeam ? homeTeamPlayers : awayTeamPlayers;
                        
                        // Try to find the best match
                        const matchedPlayer = findBestMatch(playerName, teamPlayers);
                        
                        if (matchedPlayer) {
                          playerNameToId[playerName] = matchedPlayer.id;
                          playerIdToDetails[matchedPlayer.id] = matchedPlayer;
                          console.log(`✅ Matched "${playerName}" to ${matchedPlayer.first_name} ${matchedPlayer.last_name} (ID: ${matchedPlayer.id})`);
                        }
                      }
                      
                      // Approach 2: For players not matched by team, try direct name search
                      const unmatchedPlayers = allPlayerNames.filter(name => !playerNameToId[name]);
                      
                      if (unmatchedPlayers.length > 0) {
                        console.log(`Approach 2: Searching for ${unmatchedPlayers.length} remaining players by name...`);
                        
                        // Search for each unmatched player using enhanced name search
                        for (const playerName of unmatchedPlayers) {
                          try {
                            // Use the improved findPlayersByName with name variants
                            const players = await ballDontLieService.findPlayersByName(playerName);
                            
                            if (players && players.length > 0) {
                              // Use the first match (most relevant after sorting)
                              playerNameToId[playerName] = players[0].id;
                              playerIdToDetails[players[0].id] = players[0];
                              console.log(`✅ Found "${playerName}" via direct name search: ${players[0].first_name} ${players[0].last_name} (ID: ${players[0].id})`);
                            } else {
                              console.warn(`❌ No matches found for "${playerName}" after trying name variants`);
                            }
                          } catch (error) {
                            console.warn(`Could not find player ${playerName} in Ball Don't Lie: ${error.message}`);
                          }
                        }
                      }
                      
                      // Collect all player IDs found in the Ball Don't Lie API
                      const foundPlayerIds = Object.values(playerNameToId);
                      console.log(`Successfully identified ${foundPlayerIds.length} of ${allPlayerNames.length} players in Ball Don't Lie API`);
                      
                      console.log(`Found ${foundPlayerIds.length} players in Ball Don't Lie API`);
                      
                      // Step 3: Get detailed stats for all found players
                      if (foundPlayerIds.length > 0) {
                        const playerStatsReport = await ballDontLieService.generatePlayerStatsReport(foundPlayerIds);
                        
                        // Store the accurate stats in gameData
                        gameData.ballDontLieStats = playerStatsReport;
                        
                        // Create player insights from verified Ball Don't Lie data
                        gameData.perplexityStats = {
                          player_insights: playerStatsReport,
                          meta: { 
                            source: 'Ball Don\'t Lie API (GOAT Plan)', 
                            insight_weight: '40%',  // Higher weight for verified stats
                            verified: true
                          }
                        };
                        
                        console.log('✅ Successfully fetched detailed MLB player statistics from Ball Don\'t Lie API');
                      } else {
                        throw new Error('No players found in Ball Don\'t Lie API');
                      }
                    } else {
                      // For non-MLB leagues, use the roster data directly
                      // Use global formatPlayerStats helper instead of nested function
                      const homePlayersText = formatPlayerStats(teamRostersData.homeTeam.players);
                      const awayPlayersText = formatPlayerStats(teamRostersData.awayTeam.players);
                      
                      // Create structured insights from roster data
                      gameData.perplexityStats = {
                        player_insights: `VERIFIED PLAYER DATA:\n\n${gameData.homeTeam} PLAYERS:\n${homePlayersText}\n\n${gameData.awayTeam} PLAYERS:\n${awayPlayersText}`,
                        meta: { 
                          source: 'SportsDB API', 
                          insight_weight: '20%',
                          verified: true
                        }
                      };
                    }
                  } else {
                    throw new Error('Could not fetch team rosters from SportsDB API');
                  }
                } catch (error) {
                  console.error(`❌ Error fetching verified player data: ${error.message}`);
                  // Fall back to Perplexity for data if we can't get verified stats
                  try {
                    console.log('Falling back to Perplexity for contextual data...');
                    const perplexityData = await perplexityService.getPlayerPropInsights(gameData);
                    
                    gameData.perplexityStats = { 
                      player_insights: perplexityData.player_insights || 'No verified player data available',
                      meta: { 
                        source: 'Perplexity (fallback)', 
                        insight_weight: '10%',  // Lower weight for unverified data
                        verified: false 
                      }
                    };
                  } catch (perplexityError) {
                    console.error(`❌ Perplexity fallback also failed: ${perplexityError.message}`);
                    gameData.perplexityStats = { 
                      player_insights: 'No player data available from any source',
                      meta: { error: error.message, insight_weight: '0%', verified: false }
                    };
                  }
                }
                
                try {
                  // Generate prop picks for this game
                  // This will throw an error if we can't get current player prop data
                  const gamePropPicks = await propPicksService.generatePropBets(gameData);
                  
                  if (gamePropPicks.length > 0) {
                    console.log(`Generated ${gamePropPicks.length} prop picks for ${gameData.matchup}`);
                    allPropPicks.push(...gamePropPicks);
                  } else {
                    console.log(`No prop picks generated for ${gameData.matchup}`);
                  }
                } catch (propError) {
                  console.error(`❌ Failed to generate prop picks for ${gameData.matchup}: ${propError.message}`);
                  // We continue to the next game in case other games can still get prop picks
                  // But we properly log the error so we know exactly what went wrong
                  throw new Error(`Could not generate prop picks for ${gameData.matchup} because current player prop data is unavailable: ${propError.message}`);
                }
                
              } catch (gameError) {
                console.error(`Error processing game ${game.home_team} vs ${game.away_team}:`, gameError);
                // Continue with next game if there's an error
              }
            }
            
          } catch (sportError) {
            console.error(`Error processing ${sport}:`, sportError);
            // Continue with next sport if there's an error
          }
        }
        
        // Store the prop picks in the database
        if (allPropPicks.length > 0) {
          console.log(`Generated a total of ${allPropPicks.length} prop picks. Storing in database...`);
          // Use the module function instead of duplicating code
          await propPicksService.storePropPicksInDatabase(allPropPicks);
        } else {
          console.log('No prop picks were generated.');
        }
        
        return allPropPicks;
      } catch (error) {
        console.error('Error generating daily prop picks:', error);
        throw error;
    }
  },

  /**
   * Get today's player prop picks
   */
  getTodayPropPicks: async () => {
    const now = new Date();
    const dateString = now.toISOString().split('T')[0];
    return propPicksService.getPropPicksByDate(dateString);
  },

  /**
   * Get player prop picks by date
   */
  getPropPicksByDate: async (dateString) => {
    try {
      console.log(`Fetching prop picks for date: ${dateString}`);
      await ensureValidSupabaseSession();
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', dateString)
        .order('confidence', { ascending: false })
        .limit(10);
      if (error) throw new Error(`Fetch error: ${error.message}`);
      if (!data?.length) return [];
      console.log(`Found ${data.length} entries for ${dateString} (limited to top 10 by confidence)`);
      return data;
    } catch (error) {
      console.error(`Error fetching for ${dateString}:`, error);
      throw error;
    }
  },

  /**
   * Store player prop picks in the database
   */
  storePropPicksInDatabase: async (propPicks) => {
    try {
      console.log(`Storing ${propPicks.length} picks`);
      await ensureValidSupabaseSession();
      const date = new Date().toISOString().split('T')[0];
      const payload = { date, picks: propPicks, created_at: new Date().toISOString() };
      const { data, error } = await supabase.from('prop_picks').insert([payload]);
      if (error) throw error;
      console.log('Stored prop picks successfully');
      return data;
    } catch (error) {
      console.error('Error storing picks:', error);
      throw error;
    }
  },

  /**
   * Generate prop bet recommendations
   */
  generatePropBets: async (gameData) => {
    try {
      console.log(`Generating prop bets for ${gameData.matchup}`);
      
      // Format player statistics text
      let playerStatsText = 'No player statistics available';
      if (gameData.perplexityStats && gameData.perplexityStats.player_insights) {
        playerStatsText = gameData.perplexityStats.player_insights;
      }
      
      // Get prop odds data for the matchup
      const propOddsData = await propOddsService.getPlayerPropOdds(
        gameData.sportKey,
        gameData.homeTeam,
        gameData.awayTeam
      );
      
      if (!propOddsData || propOddsData.length === 0) {
        throw new Error('No prop odds data available for this matchup');
      }
      
      // Create prompt for OpenAI
      const prompt = createPropPicksPrompt(gameData, playerStatsText, propOddsData);
      
      // Call OpenAI to generate picks
      const response = await openaiService.generatePropPicks(prompt);
      
      // Parse the response and validate
      const playerProps = parseOpenAIResponse(response);
      
      // Log and filter by confidence
      if (playerProps?.length) {
        console.log(`Extracted ${playerProps.length} prop picks`);
      } else {
        console.log('No valid prop picks found');
        return [];
      }
      const valid = playerProps.filter(p => p.confidence >= 0.51);
      const highConf = valid.filter(p => p.confidence >= 0.78);
      
      // Sort by confidence (highest first) and take only the top 10
      const sortedByConfidence = [...highConf].sort((a, b) => b.confidence - a.confidence);
      const topTenPicks = sortedByConfidence.slice(0, 10);
      
      console.log(
        `Original: ${playerProps.length}, Valid: ${valid.length}, HighConf: ${highConf.length}, Top 10: ${topTenPicks.length}`
      );
      
      return topTenPicks;
    } catch (error) {
      console.error('Error generating prop picks:', error);
      return [];
    }
  }
};

export { propPicksService };