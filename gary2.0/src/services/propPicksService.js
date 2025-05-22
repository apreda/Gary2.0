/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import axios from 'axios';
import OpenAI from 'openai';
import { propOddsService } from './propOddsService.js';
import { oddsService } from './oddsService.js';
import { mlbStatsApiService } from './mlbStatsApiService.enhanced2.js';

// Helper function to find player ranking in leaderboard
function findPlayerRanking(leaders, playerId) {
  for (let i = 0; i < leaders.length; i++) {
    if (leaders[i].person && leaders[i].person.id === playerId) {
      return i + 1; // Return 1-based rank
    }
  }
  return 0; // Not found in leaders
}
import { openaiService } from './openaiService.js';
import { ballDontLieService } from './ballDontLieService.js';
import configLoader from './configLoader.js';
import supabaseClient from '../supabaseClient.js';
import { nbaSeason, formatSeason, getCurrentEST, formatInEST } from '../utils/dateUtils.js';

// In-memory storage for browser environments
// We don't need actual file paths for browser usage as we'll use Supabase instead
const USE_FILE_STORAGE = false; // Set to false for browser compatibility

/**
 * Fetch active players for a team with their current season stats
 * Uses MLB Stats API for MLB players and SportsDB for other leagues
 */
async function fetchActivePlayers(teamName, league) {
  try {
    console.log(`Fetching active ${league} players for ${teamName}...`);
    
    if (league === 'MLB') {
      // Use MLB Stats API for MLB players
      console.log(`Using MLB Stats API to fetch ${teamName} roster`);
      
      // Get today's games to find the game for this team
      const todaysGames = await mlbStatsApiService.getTodaysGames();
      let teamGameId = null;
      
      // Find the game ID for this team
      for (const game of todaysGames) {
        if (game.homeTeam.includes(teamName) || game.awayTeam.includes(teamName)) {
          teamGameId = game.gameId;
          break;
        }
      }
      
      if (!teamGameId) {
        console.log(`No game found today for ${teamName}, fetching most recent roster data`);
        // If no game today, we can try to get team roster directly
        // This would require implementing a getTeamRoster function in mlbStatsApiService
        // For now, return an empty array
        return [];
      }
      
      // Get hitter stats for the game
      const hitterStats = await mlbStatsApiService.getHitterStats(teamGameId);
      
      // Process home or away hitters based on team name
      let players = [];
      if (hitterStats.home.length > 0 && hitterStats.home[0].team.includes(teamName)) {
        players = hitterStats.home;
      } else if (hitterStats.away.length > 0 && hitterStats.away[0].team.includes(teamName)) {
        players = hitterStats.away;
      }
      
      console.log(`Got ${players.length} players from MLB Stats API for ${teamName}`);
      return players.map(p => ({
        idPlayer: p.id,
        strPlayer: p.name,
        strPosition: p.position,
        strTeam: p.team,
        stats: p.stats
      }));
    } else {
      // For non-MLB leagues, continue using SportsDB API
      let leagueId;
      switch (league) {
        case 'NBA': leagueId = sportsDbApiService.leagueIds.NBA; break;
        case 'NHL': leagueId = sportsDbApiService.leagueIds.NHL; break;
        default: throw new Error(`Unsupported league: ${league}`);
      }
      const team = await sportsDbApiService.lookupTeam(teamName, leagueId);
      if (!team?.idTeam) return [];
      const roster = await sportsDbApiService.getTeamPlayers(team.idTeam);
      console.log(`Got ${roster.length} players from TheSportsDB for ${teamName}`);
      return roster;
    }
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
 * Create a prompt for OpenAI to generate prop picks with enhanced MLB stats
 * @param {Array} props - Array of available props
 * @param {string} playerStats - Formatted player statistics text
 * @returns {string} - The prompt for OpenAI
 */
function createPropPicksPrompt(props, playerStats) {
  // Format the props into a clear text format
  const propsText = props.map(prop => {
    const formattedOutcomes = prop.outcomes.map(outcome => {
      return `${outcome.name}: ${outcome.price}`;
    }).join(', ');
    
    return `${prop.playerName} ${prop.propType}: ${prop.point} | ${formattedOutcomes}`;
  }).join('\n');
  
  // Build the complete prompt with enhanced guidance
  const prompt = `You are Gary, an expert sports analyst specialized in player prop betting.
  
I will provide you with player props and comprehensive statistics. Your task is to identify the most valuable bets based on the statistics.
  
COMPREHENSIVE PLAYER STATISTICS:
${playerStats}
  
AVAILABLE PROPS:
${propsText}
  
Analyze each player prop and select the BEST 3 bets that offer the most value based on the statistics provided. Pay special attention to:

1. Player performance relative to league leaders (rankings are provided)
2. Starting pitcher matchups and their statistics
3. Recent player performance trends
4. Value opportunities where the odds are better than -150
  
Prioritize bets with a combination of winning probability (50%), potential ROI (30%), and edge size (20%). Look for undervalued props, especially those with positive odds.
  
For each bet you recommend:
1. State the player name, prop type, and your pick (over/under)
2. Explain your reasoning with specific statistical evidence
3. Assign a confidence score (0.5-1.0) where higher means more confident
  
Respond in this exact format for EACH pick:
  
PICK: [Player Name] [Prop Type] [Over/Under] [Line] ([American Odds])
CONFIDENCE: [Score between 0.5-1.0]
REASONING: [Your detailed analysis using specific stats and league context]

Make exactly 3 picks, ordered from highest to lowest confidence.`;
  
  return prompt;
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
    const { error } = await supabaseClient.auth.getSession();
    if (error) {
      console.warn('No session, signing in anonymously');
      await supabaseClient.auth.signInAnonymously();
    }
  } catch (error) {
    console.error('Session error, fallback', error);
    await supabaseClient.auth.signInAnonymously();
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
      const { data, error } = await supabaseClient
        .from('prop_picks')
        .select('*')
        .eq('date', dateString)
        .order('created_at', { ascending: false });
      if (error) throw new Error(`Fetch error: ${error.message}`);
      if (!data?.length) return [];
      
      // Process each entry to filter picks by confidence
      const processedEntries = data.map(entry => {
        // If the entry has picks and they're in an array format
        if (entry.picks && Array.isArray(entry.picks)) {
          // Filter by confidence threshold (>= 0.85)
          const highConfidencePicks = entry.picks.filter(pick => 
            typeof pick.confidence === 'number' && pick.confidence >= 0.85
          );
          
          // For debugging
          const originalCount = entry.picks.length;
          const filteredCount = highConfidencePicks.length;
          if (originalCount !== filteredCount) {
            console.log(`Filtered ${entry.id || 'entry'}: ${originalCount} -> ${filteredCount} picks (85%+ confidence)`); 
          }
          
          // Return the entry with filtered picks
          return {
            ...entry,
            picks: highConfidencePicks,
            originalPickCount: originalCount
          };
        }
        return entry;
      });
      
      console.log(`Found ${data.length} entries for ${dateString}, filtered to 85%+ confidence threshold`);
      return processedEntries;
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
      const { data, error } = await supabaseClient.from('prop_picks').insert([payload]);
      if (error) throw error;
      console.log('Stored prop picks successfully');
      return data;
    } catch (error) {
      console.error('Error storing picks:', error);
      throw error;
    }
  },

  /**
   * Format player statistics from MLB Stats API data with comprehensive information
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<string>} - Formatted player statistics text
   */
  formatMLBPlayerStats: async (homeTeam, awayTeam) => {
    try {
      console.log(`Formatting comprehensive MLB player stats for ${homeTeam} vs ${awayTeam}`);
      
      // Get today's date
      const today = new Date().toISOString().slice(0, 10);
      
      // Get today's games
      const games = await mlbStatsApiService.getGamesByDate(today);
      if (!games || games.length === 0) {
        console.log('No MLB games found for today');
        return '';
      }
      
      // Find the game for these teams
      let targetGame = null;
      for (const game of games) {
        const homeMatches = game.teams?.home?.team?.name?.includes(homeTeam);
        const awayMatches = game.teams?.away?.team?.name?.includes(awayTeam);
        if (homeMatches && awayMatches) {
          targetGame = game;
          break;
        }
      }
      
      if (!targetGame) {
        console.log(`No game found for ${homeTeam} vs ${awayTeam}`);
        return '';
      }
      
      // Get enhanced data using our MLB Stats API service
      console.log(`Getting comprehensive stats for game ${targetGame.gamePk}`);
      
      // 1. Get starting pitchers with enhanced stats
      let startingPitchers;
      try {
        startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
      } catch (error) {
        console.error('Error getting enhanced starting pitchers, falling back to regular method:', error);
        startingPitchers = await mlbStatsApiService.getStartingPitchers(targetGame.gamePk);
      }
      
      // 2. Get team roster stats
      const homeTeamId = targetGame.teams?.home?.team?.id;
      const awayTeamId = targetGame.teams?.away?.team?.id;
      
      let homeRoster = [];
      let awayRoster = [];
      
      if (homeTeamId) {
        try {
          // Try to get enhanced roster data if available
          if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
            const rosterData = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
            if (rosterData && rosterData.hitters) {
              homeRoster = rosterData.hitters;
            }
          }
        } catch (error) {
          console.log(`Error getting enhanced home roster: ${error.message}`);
        }
      }
      
      if (awayTeamId) {
        try {
          // Try to get enhanced roster data if available
          if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
            const rosterData = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);
            if (rosterData && rosterData.hitters) {
              awayRoster = rosterData.hitters;
            }
          }
        } catch (error) {
          console.log(`Error getting enhanced away roster: ${error.message}`);
        }
      }
      
      // 3. Get league leaders data
      let homeRunLeaders = [];
      let battingAvgLeaders = [];
      let eraLeaders = [];
      let strikeoutLeaders = [];
      
      try {
        // Try to get league leaders if the enhanced function is available
        if (typeof mlbStatsApiService.getLeagueLeaders === 'function') {
          homeRunLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 10);
          battingAvgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 10);
          eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 10);
          strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 10);
        }
      } catch (error) {
        console.log(`Error getting league leaders: ${error.message}`);
      }
      
      // 4. Fallback to basic hitter stats if enhanced data not available
      let hitterStats = { home: [], away: [] };
      if (homeRoster.length === 0 || awayRoster.length === 0) {
        hitterStats = await mlbStatsApiService.getHitterStats(targetGame.gamePk);
      }
      
      // Format all the data into a comprehensive stats text
      let statsText = '';
      
      // SECTION 1: Starting Pitchers
      statsText += 'STARTING PITCHERS:\n';
      
      if (startingPitchers?.homeStarter) {
        const hp = startingPitchers.homeStarter;
        const hpStats = hp.seasonStats || {};
        statsText += `${homeTeam} - ${hp.fullName}: ERA ${hpStats.era || 'N/A'}, ` +
                   `${hpStats.wins || 0}W-${hpStats.losses || 0}L, ` +
                   `${hpStats.inningsPitched || '0.0'} IP, ` +
                   `${hpStats.strikeouts || 0} K, ` +
                   `WHIP ${hpStats.whip || 'N/A'}, ` +
                   `BAA ${hpStats.battingAvgAgainst || '.000'}\n`;
        
        // Add league ranking for ERA and strikeouts if available
        if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
          statsText += `RANKINGS: `;
          
          // Check ERA ranking
          const eraRank = findPlayerRanking(eraLeaders, hp.id);
          if (eraRank > 0) {
            statsText += `ERA #${eraRank} in MLB, `;
          }
          
          // Check strikeout ranking
          const soRank = findPlayerRanking(strikeoutLeaders, hp.id);
          if (soRank > 0) {
            statsText += `Strikeouts #${soRank} in MLB, `;
          }
          
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
      }
      
      if (startingPitchers?.awayStarter) {
        const ap = startingPitchers.awayStarter;
        const apStats = ap.seasonStats || {};
        statsText += `${awayTeam} - ${ap.fullName}: ERA ${apStats.era || 'N/A'}, ` +
                   `${apStats.wins || 0}W-${apStats.losses || 0}L, ` +
                   `${apStats.inningsPitched || '0.0'} IP, ` +
                   `${apStats.strikeouts || 0} K, ` +
                   `WHIP ${apStats.whip || 'N/A'}, ` +
                   `BAA ${apStats.battingAvgAgainst || '.000'}\n`;
        
        // Add league ranking for ERA and strikeouts if available
        if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
          statsText += `RANKINGS: `;
          
          // Check ERA ranking
          const eraRank = findPlayerRanking(eraLeaders, ap.id);
          if (eraRank > 0) {
            statsText += `ERA #${eraRank} in MLB, `;
          }
          
          // Check strikeout ranking
          const soRank = findPlayerRanking(strikeoutLeaders, ap.id);
          if (soRank > 0) {
            statsText += `Strikeouts #${soRank} in MLB, `;
          }
          
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
      }
      
      // SECTION 2: Home Team Hitters
      statsText += `\n${homeTeam} HITTERS:\n`;
      
      // Use enhanced roster data if available, otherwise fall back to basic hitter stats
      if (homeRoster.length > 0) {
        for (const hitter of homeRoster) {
          const s = hitter.stats;
          statsText += `${hitter.fullName} (${hitter.position}): ` +
                     `AVG ${s.avg || '.000'}, ` +
                     `${s.hits || 0} H, ` +
                     `${s.homeRuns || 0} HR, ` +
                     `${s.rbi || 0} RBI, ` +
                     `${s.runs || 0} R, ` +
                     `${s.strikeouts || 0} K, ` +
                     `${s.walks || 0} BB, ` +
                     `OPS ${s.ops || '.000'}\n`;
          
          // Add league rankings if available
          if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
            const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
            const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
            
            if (hrRank > 0 || avgRank > 0) {
              statsText += `  RANKINGS: `;
              
              if (hrRank > 0) {
                statsText += `HR #${hrRank} in MLB, `;
              }
              
              if (avgRank > 0) {
                statsText += `AVG #${avgRank} in MLB, `;
              }
              
              statsText = statsText.replace(/, $/, '');
              statsText += '\n';
            }
          }
        }
      } else if (hitterStats?.home?.length > 0) {
        for (const hitter of hitterStats.home) {
          const s = hitter.stats;
          statsText += `${hitter.name} (${hitter.position}): ` +
                     `AVG ${s.avg || '.000'}, ` +
                     `${s.hits || 0} H, ` +
                     `${s.homeRuns || 0} HR, ` +
                     `${s.rbi || 0} RBI, ` +
                     `${s.runs || 0} R, ` +
                     `${s.strikeouts || 0} K, ` +
                     `${s.walks || 0} BB\n`;
        }
      } else {
        statsText += 'No hitter data available\n';
      }
      
      // SECTION 3: Away Team Hitters
      statsText += `\n${awayTeam} HITTERS:\n`;
      
      // Use enhanced roster data if available, otherwise fall back to basic hitter stats
      if (awayRoster.length > 0) {
        for (const hitter of awayRoster) {
          const s = hitter.stats;
          statsText += `${hitter.fullName} (${hitter.position}): ` +
                     `AVG ${s.avg || '.000'}, ` +
                     `${s.hits || 0} H, ` +
                     `${s.homeRuns || 0} HR, ` +
                     `${s.rbi || 0} RBI, ` +
                     `${s.runs || 0} R, ` +
                     `${s.strikeouts || 0} K, ` +
                     `${s.walks || 0} BB, ` +
                     `OPS ${s.ops || '.000'}\n`;
          
          // Add league rankings if available
          if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
            const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
            const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
            
            if (hrRank > 0 || avgRank > 0) {
              statsText += `  RANKINGS: `;
              
              if (hrRank > 0) {
                statsText += `HR #${hrRank} in MLB, `;
              }
              
              if (avgRank > 0) {
                statsText += `AVG #${avgRank} in MLB, `;
              }
              
              statsText = statsText.replace(/, $/, '');
              statsText += '\n';
            }
          }
        }
      } else if (hitterStats?.away?.length > 0) {
        for (const hitter of hitterStats.away) {
          const s = hitter.stats;
          statsText += `${hitter.name} (${hitter.position}): ` +
                     `AVG ${s.avg || '.000'}, ` +
                     `${s.hits || 0} H, ` +
                     `${s.homeRuns || 0} HR, ` +
                     `${s.rbi || 0} RBI, ` +
                     `${s.runs || 0} R, ` +
                     `${s.strikeouts || 0} K, ` +
                     `${s.walks || 0} BB\n`;
        }
      } else {
        statsText += 'No hitter data available\n';
      }
      
      // SECTION 4: League Leaders Summary
      if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0 || eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
        statsText += `\nLEAGUE LEADERS:\n`;
        
        if (homeRunLeaders.length > 0) {
          statsText += `HOME RUNS: `;
          for (let i = 0; i < Math.min(3, homeRunLeaders.length); i++) {
            const leader = homeRunLeaders[i];
            statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
          }
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
        
        if (battingAvgLeaders.length > 0) {
          statsText += `BATTING AVG: `;
          for (let i = 0; i < Math.min(3, battingAvgLeaders.length); i++) {
            const leader = battingAvgLeaders[i];
            statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
          }
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
        
        if (eraLeaders.length > 0) {
          statsText += `ERA: `;
          for (let i = 0; i < Math.min(3, eraLeaders.length); i++) {
            const leader = eraLeaders[i];
            statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
          }
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
        
        if (strikeoutLeaders.length > 0) {
          statsText += `STRIKEOUTS: `;
          for (let i = 0; i < Math.min(3, strikeoutLeaders.length); i++) {
            const leader = strikeoutLeaders[i];
            statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
          }
          statsText = statsText.replace(/, $/, '');
          statsText += '\n';
        }
      }
      
      return statsText;
    } catch (error) {
      console.error('Error formatting MLB player stats:', error);
      return 'Error retrieving MLB player statistics';
    }
  },
  
  // Helper function to find player ranking in leaderboard
  findPlayerRanking(leaders, playerId) {
    for (let i = 0; i < leaders.length; i++) {
      if (leaders[i].person && leaders[i].person.id === playerId) {
        return i + 1; // Return 1-based rank
      }
    }
    return 0; // Not found in leaders
  },

  /**
   * Generate prop bet recommendations with enhanced MLB stats
   */
  generatePropBets: async (gameData) => {
    try {
      console.log(`Generating prop bets for ${gameData.matchup}`);
      
      // Format player statistics text
      let playerStatsText = 'No player statistics available';
      
      // For MLB games, use enhanced MLB Stats API data
      if (gameData.league === 'MLB') {
        try {
          console.log('Using enhanced MLB Stats API for comprehensive player statistics');
          const mlbStats = await propPicksService.formatMLBPlayerStats(gameData.homeTeam, gameData.awayTeam);
          if (mlbStats) {
            console.log('Successfully retrieved enhanced MLB stats with league rankings');
            playerStatsText = mlbStats;
          }
        } catch (err) {
          console.error('Error getting enhanced MLB Stats API data, falling back to existing stats:', err);
        }
      }
      
      // Fall back to existing stats if MLB Stats API data not available or for other leagues
      if (playerStatsText === 'No player statistics available' && gameData.perplexityStats && gameData.perplexityStats.player_insights) {
        console.log('Falling back to Perplexity stats');
        playerStatsText = gameData.perplexityStats.player_insights;
      }
      
      // Get prop odds data for the matchup
      console.log(`Getting prop odds for ${gameData.homeTeam} vs ${gameData.awayTeam}`);
      const propOddsData = await propOddsService.getPlayerPropOdds(
        gameData.sportKey,
        gameData.homeTeam,
        gameData.awayTeam
      );
      
      if (!propOddsData || propOddsData.length === 0) {
        throw new Error('No prop odds data available for this matchup');
      }
      
      console.log(`Found ${propOddsData.length} prop markets for this matchup`);
      
      // Format the props into a structured format for the OpenAI prompt
      const formattedProps = propOddsData.map(prop => {
        return {
          playerName: prop.player,
          propType: prop.prop_type,
          point: prop.line,
          outcomes: [
            { name: 'OVER', price: prop.over_odds },
            { name: 'UNDER', price: prop.under_odds }
          ]
        };
      });
      
      // Create prompt for OpenAI using the enhanced prompt format
      console.log('Creating enhanced prop picks prompt with comprehensive stats');
      const prompt = propPicksService.createPropPicksPrompt(formattedProps, playerStatsText);
      
      // Call OpenAI to generate picks
      console.log('Calling OpenAI to generate prop picks');
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
      
      // Filter by confidence
      const valid = playerProps.filter(p => p.confidence >= 0.51);
      
      // Filter by odds value - removing any with odds worse than -150
      const validOdds = valid.filter(p => {
        // Extract odds from the pick format, e.g. "Gunnar Henderson OVER Hits 0.5 -265"
        const oddsMatch = p.pick?.match(/([+-]\d+)\s*$/);
        if (oddsMatch) {
          const odds = parseInt(oddsMatch[1]);
          // Only keep picks with odds better than -150
          const oddsOK = odds > -150;
          if (!oddsOK) {
            console.log(`Filtering out prop pick with poor odds: ${p.pick} (${odds} is worse than -150)`);
          }
          return oddsOK;
        }
        return true; // Keep picks where we can't determine odds
      });
      
      // Further filter by high confidence threshold - reduced to 0.7 for prop picks
      const highConf = validOdds.filter(p => p.confidence >= 0.7);
      
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