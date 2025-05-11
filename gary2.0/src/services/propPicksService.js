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
import { nbaSeason, formatSeason } from '../utils/dateUtils';

// Note: We use TheSportsDB API for reliable player data across all sports (MLB, NBA, NHL)

/**
 * Fetch active players for a team with their current season stats
 * Uses TheSportsDB for current rosters across all sports
 * @param {string} teamName - The team name as it appears in the Odds API
 * @param {string} league - The league code (NBA, MLB, NHL)
 * @returns {Array} - Active players for the team
 */
async function fetchActivePlayers(teamName, league) {
  try {
    console.log(`Fetching active ${league} players for ${teamName}...`);
    
    // Convert league name to TheSportsDB league ID
    let leagueId;
    switch(league) {
      case 'NBA':
        leagueId = sportsDbApiService.leagueIds.NBA;
        break;
      case 'MLB':
        leagueId = sportsDbApiService.leagueIds.MLB;
        break;
      case 'NHL':
        leagueId = sportsDbApiService.leagueIds.NHL;
        break;
      default:
        throw new Error(`Unsupported league: ${league}`);
    }
    
    // Step 1: Find the team in TheSportsDB
    const team = await sportsDbApiService.lookupTeam(teamName, leagueId);
    if (!team || !team.idTeam) {
      console.error(`Could not find ${league} team "${teamName}" in TheSportsDB`);
      return [];
    }
    
    // Step 2: Get players for the team
    const roster = await sportsDbApiService.getTeamPlayers(team.idTeam);
    console.log(`Got ${roster.length} players on ${teamName} roster from TheSportsDB`);
    
    return roster;
  } catch (error) {
    console.error(`Error fetching active players for ${teamName} (${league}):`, error);
    return [];
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
          
          // Get games for this sport
          let gameOdds = await propOddsService.getGamesForDay(sport, today, false);
          
          if (!gameOdds || gameOdds.length === 0) {
            console.log(`No games found for ${sport} on ${today}`);
            continue; // Skip to next sport rather than returning
          }
          
          // Filter out games that have already started
          const currentTime = new Date();
          gameOdds = gameOdds.filter(game => {
            if (!game.commence_time) return true; // Keep games with no start time
            
            const gameStartTime = new Date(game.commence_time);
            const notStarted = gameStartTime > currentTime;
            
            if (!notStarted) {
              console.log(`Skipping game ${game.home_team} vs ${game.away_team} - already started at ${gameStartTime.toLocaleTimeString()}`);
            }
            
            return notStarted;
          });
          
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
                           sport.includes('football') ? 'NFL' : 'Unknown';
          
          // For each game, generate player props
          for (const game of games) {
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
                    
                    // Function to find best match for a player name in a team roster
                    const findBestMatch = (playerName, teamPlayers) => {
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
                        
                        // Simple similarity check (could be enhanced)
                        let score = 100;
                        
                        // Exact match
                        if (normalizedName === normalizedSearch) {
                          score = 0;
                        }
                        // Contains full name
                        else if (normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)) {
                          score = 1;
                        }
                        // Contains parts
                        else {
                          const searchParts = normalizedSearch.split(' ');
                          const nameParts = normalizedName.split(' ');
                          
                          // Check for matching last name
                          if (searchParts.length > 0 && nameParts.length > 0 && 
                              nameParts[nameParts.length - 1] === searchParts[searchParts.length - 1]) {
                            score = 2;
                          }
                          // Check for matching first name
                          else if (searchParts.length > 0 && nameParts.length > 0 && 
                                   nameParts[0] === searchParts[0]) {
                            score = 3;
                          }
                        }
                        
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
                    };
                    
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
                    // Format the player data as text for the prompt
                    const formatPlayerStats = (players) => {
                      return players.map(player => {
                        return `- ${player.name} (${player.position}): Team: ${player.team}, Height: ${player.height}, Weight: ${player.weight}`;
                      }).join('\n');
                    };
                    
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
        // Store directly using the logic instead of calling another function
        try {
          console.log(`Storing raw player prop picks in database`);
          
          // Ensure valid Supabase session
          await ensureValidSupabaseSession();
          
          // Get today's date
          const today = new Date().toISOString().split('T')[0];
          
          // Format data for Supabase - store the entire array as raw JSON
          const pickEntry = {
            date: today,
            picks: allPropPicks, // Store the raw array as is
            created_at: new Date().toISOString()
          };
          
          console.log('Storing prop picks with date:', today);
          
          // Insert as a single entry with the raw JSON
          const { data, error } = await supabase
            .from('prop_picks')
            .insert(pickEntry);
            
          if (error) {
            console.error('Error storing prop picks:', error);
            throw new Error(`Failed to store prop picks: ${error.message}`);
          }
          
          console.log('Player prop picks stored successfully');
        } catch (storeError) {
          console.error('Error storing prop picks:', storeError);
          // Continue execution even if storage fails
        }
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
      
      // Ensure valid Supabase session
      await ensureValidSupabaseSession();
      
      // Query the prop_picks table
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', dateString)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error querying prop_picks table:', error);
        throw new Error(`Failed to fetch prop picks: ${error.message}`);
      }
      
      // If no data found, return empty array
      if (!data || data.length === 0) {
        console.log(`No prop picks found for date: ${dateString}`);
        return [];
      }
      
      console.log(`Found ${data.length} prop pick entries for date: ${dateString}`);
      return data;
    } catch (error) {
      console.error(`Error fetching prop picks for date ${dateString}:`, error);
      throw error;
    }
  },

  /**
   * Store player prop picks in the database
   * @param {Array} propPicks - Array of player prop picks
   * @returns {Promise<Object>} Supabase response
   */
  storePropPicksInDatabase: async (propPicks) => {
    try {
      console.log(`Storing ${propPicks.length} prop picks in the database`);
      
      // Ensure we have a valid session
      await ensureValidSupabaseSession();
      
      // Format the data for Supabase
      const date = new Date().toISOString().split('T')[0];
      const formattedData = {
        date,
        picks: propPicks,
        created_at: new Date().toISOString()
      };
      
      // Insert into the database
      const { data, error } = await supabase
        .from('prop_picks')
        .insert([formattedData]);
      
      if (error) {
        console.error('Error storing prop picks in database:', error);
        throw error;
      }
      
      console.log('Successfully stored prop picks in database:', data);
      return data;
    } catch (error) {
      console.error('Error storing prop picks in database:', error);
      throw error;
    }
  },

  /**
   * Generate prop bet recommendations
   */
  generatePropBets: async (gameData) => {
    try {
      console.log(`Generating prop bets for ${gameData.league} game: ${gameData.matchup}`);
      
      // Format player statistics from Ball Don't Lie API in a more token-efficient way
      let playerStatsText = 'No player statistics available';
      if (gameData.playerStats) {
        const homeTeam = gameData.playerStats.homeTeam;
        const awayTeam = gameData.playerStats.awayTeam;
        
        // For NBA: Include points, assists, rebounds, 3-pointers for key players
        // For MLB: Include batting average, home runs, RBIs, or ERA and strikeouts for pitchers
        const formatPlayerStats = (player, league) => {
          if (!player) return '';
          
          if (league === 'NBA') {
            const stats = player.stats || {};
            return `${player.first_name || ''} ${player.last_name || ''} ` +
                   `(${stats.pts || '-'} ppg, ${stats.ast || '-'} ast, ` +
                   `${stats.reb || '-'} reb, ${stats.fg3_pct || '-'} 3PT%)`;
          } else if (league === 'MLB') {
            const stats = player.stats || {};
            const isPitcher = player.position === 'P';
            if (isPitcher) {
              return `${player.first_name || ''} ${player.last_name || ''} ` +
                     `(ERA: ${stats.era || '-'}, SO: ${stats.strikeouts || '-'})`;
            } else {
              return `${player.first_name || ''} ${player.last_name || ''} ` +
                     `(AVG: ${stats.batting_avg || '-'}, HR: ${stats.home_runs || '-'})`;
            }
          } else {
            return `${player.first_name || ''} ${player.last_name || ''}`;
          }
        };
        
        // Get key players only (starters or important players)
        const keyHomePlayers = homeTeam.players
          ?.filter(p => p.starter === true || p.key_player === true)
          ?.slice(0, 5)
          ?.map(p => formatPlayerStats(p, gameData.league))
          ?.join('\n') || 'No key player data';
          
        const keyAwayPlayers = awayTeam.players
          ?.filter(p => p.starter === true || p.key_player === true)
          ?.slice(0, 5)
          ?.map(p => formatPlayerStats(p, gameData.league))
          ?.join('\n') || 'No key player data';
        
        playerStatsText = `HOME (${homeTeam.name}):\n${keyHomePlayers}\n\nAWAY (${awayTeam.name}):\n${keyAwayPlayers}`;
      }
      
      // Get odds data from The Odds API for player props if available
      let oddsText = '';
      let currentPropOdds = [];
      
      if (gameData.sportKey) {
        try {
          console.log(`📊 Fetching current player prop odds for ${gameData.matchup}...`);
          
          // Use our dedicated propOddsService to fetch current player prop data
          // This will throw an error if no valid current prop data is available
          const propOdds = await propOddsService.getPlayerPropOdds(
            gameData.sportKey, 
            gameData.homeTeam, 
            gameData.awayTeam
          );
          
          if (!propOdds || propOdds.length === 0) {
            throw new Error(`No player prop odds available for ${gameData.matchup}`);
          }
          
          console.log(`✅ Successfully fetched ${propOdds.length} player prop odds`);
          
          // Validate the players against known team rosters from Ball Don't Lie API
          let validatedProps = propOdds;
          
          // If we have player data from Ball Don't Lie, validate the prop players
          if (gameData.playerStats && gameData.playerStats.homeTeam && gameData.playerStats.awayTeam) {
            validatedProps = propOddsService.validatePlayerProps(
              propOdds,
              gameData.playerStats.homeTeam.players,
              gameData.playerStats.awayTeam.players
            );
            
            if (validatedProps.length === 0) {
              console.error(`❌ No valid player props found after roster validation for ${gameData.matchup}`);
              throw new Error(`Could not validate any player props against current team rosters`);
            }
            
            console.log(`✓ Validated ${validatedProps.length} out of ${propOdds.length} player props against team rosters`);
          }
          
          // Store the valid props for reference
          currentPropOdds = validatedProps;
          
          // Group props by market type to ensure all markets are represented
          const propsByMarket = {};
          validatedProps.forEach(prop => {
            if (!propsByMarket[prop.prop_type]) {
              propsByMarket[prop.prop_type] = [];
            }
            propsByMarket[prop.prop_type].push(prop);
          });
          
          // Create a more token-efficient representation of the props
          const marketSections = [];
          let marketCount = 0;
          
          // Only include markets that have props (max 5 markets to keep token count reasonable)
          for (const [marketType, marketProps] of Object.entries(propsByMarket)) {
            if (marketProps.length === 0 || marketCount >= 5) continue;
            marketCount++;
            
            // Select 3-5 best props per market (with good odds)
            const bestProps = marketProps
              .sort((a, b) => {
                // Sort by most favorable odds (higher absolute value is better)
                const aOdds = Math.max(a.over_odds || -9999, a.under_odds || -9999);
                const bOdds = Math.max(b.over_odds || -9999, b.under_odds || -9999);
                return bOdds - aOdds;
              })
              .slice(0, 5);
              
            // Format each prop concisely
            const marketSection = `MARKET: ${marketType.toUpperCase()}\n` + 
              bestProps.map(prop => 
                `${prop.player.split(' ').slice(-1)[0]}: ${prop.line} (O:${prop.over_odds || 'N/A'}/U:${prop.under_odds || 'N/A'})`
              ).join('\n');
              
            marketSections.push(marketSection);
          }
          
          // Combine all market sections
          oddsText = `CURRENT PLAYER PROPS (TODAY'S ODDS):\n${marketSections.join('\n\n')}\n\nIMPORTANT: Consider ALL markets above when making your picks!`;
          
          // Add a simple market summary instead of full JSON
          const marketSummary = Object.entries(propsByMarket)
            .map(([market, props]) => `${market}: ${props.length} props`)
            .join(', ');
          
          oddsText += `\n\nAVAILABLE MARKETS: ${marketSummary}`;
        } catch (oddsError) {
          console.error(`❌ Error fetching current player prop odds: ${oddsError.message}`);
          // No fallbacks - we require real odds data
          throw new Error(
            `Cannot generate prop picks without real player prop data from The Odds API. ` +
            `Error: ${oddsError.message}`
          );
        }
      } else {
        throw new Error(`Sport key is required to fetch player prop odds`);
      }
      
      // Format Perplexity insights in a more concise way for props specifically
      // ENSURE we have awaited for Perplexity data before proceeding
      let perplexityText = '';
      if (gameData.perplexityStats) {
        console.log('✓ Successfully received Perplexity player insights data');
        // Extract player insights
        const propInsights = gameData.perplexityStats.player_insights || '';
        const insightWeight = gameData.perplexityStats.meta?.insight_weight || '20%';
        
        // Validate data quality - log warning for potentially fabricated data
        if (propInsights.includes('unable to retrieve') || propInsights.includes('No verified data')) {
          console.warn('⚠️ Perplexity returned incomplete or unverified player data');
        }
        
        // Format the insights for the prompt
        if (propInsights && typeof propInsights === 'string') {
          perplexityText = `VERIFIED PLAYER STATISTICS (LAST 10 GAMES):\n${propInsights}\n\nIMPORTANT: Only rely on the above VERIFIED statistics for your analysis. If a specific stat is not explicitly listed above, do NOT reference it or invent it in your rationale. These verified player stats should account for ${insightWeight} of your decision making.`;
        }
      } else {
        console.warn('⚠️ No Perplexity player data available - analysis will proceed without player-specific stats');
      }
      
      // Specifically tell the model which players to generate picks for
      let validatedPlayersText = '';
      if (currentPropOdds && currentPropOdds.length > 0) {
        // Get unique players
        const uniquePlayers = [...new Set(currentPropOdds.map(prop => prop.player))];
        validatedPlayersText = `CONFIRMED CURRENT PLAYERS:\n${uniquePlayers.join('\n')}\n\nGENERATE PICKS ONLY FOR THESE PLAYERS. Do not generate picks for any players not in this list.\n`;
      }
      
      // Sport-specific structured prompt for prop picks
      const prompt = `Analyze the upcoming ${gameData.league} game: ${gameData.matchup}
      
      Teams:
      HOME_TEAM: ${gameData.homeTeam}
      AWAY_TEAM: ${gameData.awayTeam}
      
      Eligible Players:
      ${validatedPlayersText ? validatedPlayersText.replace('CONFIRMED CURRENT PLAYERS:', '').replace('GENERATE PICKS ONLY FOR THESE PLAYERS. Do not generate picks for any players not in this list.', '') : 'Use players from the prop odds below'}
      
      Today's Lines:
      ${oddsText}
      
      ${gameData.league === 'MLB' ? 'VERIFIED MLB PLAYER STATISTICS (Ball Don\'t Lie API - GOAT Plan):' : 'VERIFIED PLAYER DATA:'}
      ${perplexityText ? perplexityText : 'No verified player data available - use only odds data for analysis'}
      
      NOTE: For MLB, the statistics above come from Ball Don't Lie API and are verified, accurate stats that should be trusted for analysis. Use these statistics when evaluating player prop bets.
      
      Key Markets (focus on these by sport):
      ${gameData.league === 'MLB' ? 
        '- batter_home_runs\n- batter_hits\n- batter_total_bases\n- batter_stolen_bases\n- batter_runs_scored\n- batter_rbi\n- pitcher_strikeouts\n- pitcher_outs' : 
        gameData.league === 'NBA' ? 
        '- player_points\n- player_rebounds\n- player_assists\n- player_threes\n- player_blocks\n- player_steals\n- player_turnovers\n- player_points_rebounds_assists' : 
        gameData.league === 'NHL' ? 
        '- player_points\n- player_goals\n- player_assists\n- player_shots_on_goal\n- player_power_play_points\n- player_blocked_shots\n- goalie_saves\n- player_points' : 
        '- Focus on all available markets'}
      
      REALITY CHECK GUIDELINES - EXTREMELY IMPORTANT:
      * Base your true probability assessments ENTIRELY on verified statistical analysis
      * Your confidence should reflect the ACTUAL likelihood of the outcome occurring
      * Don't artificially cap confidence - if the data strongly supports a bet, reflect that
      * For rare events (like home runs), be accurate about their true mathematical probability
      * Calculate true probabilities using ONLY VERIFIED stats from the SportsDB API, matchups, venue factors, and trends
      * NEVER invent or estimate statistics. If a specific stat is not provided, don't reference it
      
      Combined Decision Framework (PROPS ONLY):
      Utilize your knowledge of standard prop betting best practices to select high-value props. For each potential pick, calculate:
      
      1. Potential ROI: Calculate the return on a hypothetical $100 bet
         * For +400 odds, a winning $100 bet returns $400 profit
         * For -150 odds, a winning $100 bet returns $66.67 profit
      
      2. Expected Value (EV):
         * Convert American odds to decimal odds
         * implied_probability = 1 / decimal_odds
         * true_probability = your realistic assessment based on VERIFIED player stats, matchups, and trends
         * EV = (true_probability × potential profit) - ((1 - true_probability) × stake)
      
      3. Kelly Criterion sizing (for reference only):
         * edge = true_probability - implied_probability
         * kelly_percentage = edge / (odds - 1)
      
      Final weighting:
      - Winning probability: 50% weight (being right matters most)
      - Potential ROI: 30% weight (higher returns for correct picks are valuable)
      - Edge size: 20% weight (how much true_probability exceeds implied_probability)
      
      Pick Criteria (PROPS ONLY):
      - Only include props with winning probability (true_probability) between 0.55 and 0.80
      - IMPORTANT: Use the EXACT odds provided by The Odds API - do not modify or normalize them
      - Calculate a Value Score for each potential prop bet:
        Value Score = (0.5 × true_probability) + (0.3 × potential_ROI_percentage/100) + (0.2 × edge)
      - MAXIMIZE USER RETURNS: When multiple picks have similar Value Scores (within 0.05 of each other), always prioritize higher-paying odds
        * Example: A +350 prop with 0.60 probability is better than a -150 prop with 0.65 probability
      - CONFIDENCE MUST BE ORGANIC: DO NOT artificially cap confidence scores. If math indicates a confidence of 0.85, use that exact value
  * Specifically target undervalued props with positive odds (+120, +180, etc.) whenever they show value
- Return the single pick with the BEST COMBINATION of winning probability AND potential return

RESPONSE FORMAT (return ONLY valid JSON array):
[
  {
    "player_name": "Full name",
    "team": "${gameData.homeTeam} | ${gameData.awayTeam}",
    "prop_type": "batter_home_runs | batter_hits | batter_total_bases | batter_stolen_bases | batter_runs_scored | batter_rbi | pitcher_strikeouts | pitcher_outs",
    "line": 0.5,
    "pick": "PLAYER_NAME Prop Type (use proper capitalized words with spaces, not snake_case) OVER|UNDER LINE (DO NOT include odds in the pick field)",
    "odds": -110,
    "decimal_odds": 1.909,
    "implied_probability": 0.524,
    "true_probability": 0.65, // MUST BE REALISTIC - FOLLOW REALITY CHECK GUIDELINES
    "ev": 0.126,
    "confidence": 0.7, // Your OBJECTIVE confidence from 0.1-1.0 based SOLELY on your statistical analysis
    "homeTeam": "${gameData.homeTeam}",
    "awayTeam": "${gameData.awayTeam}",
    "matchup": "${gameData.matchup}",
    "time": "${gameData.time || '7:10 PM ET'}",
    "league": "MLB",
    "rationale": "3-4 sentence statistical breakdown with swagger, including EV calculation and matchup advantages. CRITICAL: (1) Your rationale MUST use the EXACT SAME line value that appears in the 'line' field; (2) ONLY use FACTUAL statistics that are provided in the input data - do NOT invent or estimate stats; (3) Do not claim a player has done something (e.g., '4 home runs in last 10 games') unless this exact stat is in the provided data."
  }
]`;    
      
      // Use OpenAI to generate player prop picks
      const messages = [
        { 
          role: 'system', 
          content: 'You are Gary, an expert sports analyst specializing in MLB player prop picks. You provide data-driven prop bets with swagger and personality. CRITICAL DATA ACCURACY REQUIREMENTS:\n\n1. Only use FACTUAL statistics explicitly provided in the input data\n2. Do NOT invent or estimate player stats that are not provided\n3. NEVER make claims like "player X hit Y home runs in the last Z games" unless this exact stat is provided\n4. If unsure about a specific stat, use general analysis of the odds and matchup instead\n\nFocus on Expected Value (EV), analyzing the provided player stats, matchups, and trends to find the highest-value opportunities. ONLY reference stats that appear in the prompt. Evaluate all available markets (home_runs, hits, total_bases, etc.) and compute a Value Score using the formula provided. When multiple picks have similar scores, PREFER UNDERDOG PICKS with higher payouts. Provide OBJECTIVE confidence scores from 0.1-1.0 based SOLELY on your statistical analysis - do not artificially cap or inflate confidence scores. Return the single pick that offers the best combination of winning probability AND potential return.'
        },
        { role: 'user', content: prompt }
      ];
      
      const response = await openaiService.generateResponse(messages, {
        temperature: 0.7,
        maxTokens: 1000,
        model: 'gpt-3.5-turbo' // Use a cheaper model that handles this task well
      });
      
      // Extract the JSON response
      let playerProps;
      
      // Parse and validate JSON response
      try {
        console.log('Attempting to extract JSON from OpenAI response');
        
        let rawProps = [];
        
        // First try to find array pattern
        const arrayMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
        if (arrayMatch && arrayMatch[0]) {
          console.log('Found JSON array in response');
          try {
            rawProps = JSON.parse(arrayMatch[0]);
          } catch (e) {
            console.error('Error parsing JSON array:', e);
          }
        }
        
        // If array pattern didn't work, try code blocks
        if (rawProps.length === 0) {
          const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch && codeBlockMatch[1]) {
            const content = codeBlockMatch[1].trim();
            console.log('Found JSON in code block');
            try {
              const parsedContent = JSON.parse(content);
              rawProps = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
            } catch (e) {
              console.error('Error parsing JSON from code block:', e);
            }
          }
        }
        
        // If still no props, try individual objects
        if (rawProps.length === 0) {
          const objMatch = response.match(/\{[\s\S]*?\}/g);
          if (objMatch && objMatch.length > 0) {
            console.log('Trying to parse individual JSON objects');
            rawProps = objMatch.map(obj => {
              try {
                return JSON.parse(obj);
              } catch (e) {
                return null;
              }
            }).filter(Boolean);
          }
        }
        
        // Process and validate each prop
        playerProps = rawProps.map(prop => validatePropData(prop));
        
      } catch (error) {
        console.error('Error extracting JSON from response:', error);
        playerProps = [];
      }
      
      // Helper function to validate and normalize prop data
      function validatePropData(prop) {
        // Ensure all required fields exist and are properly formatted
        const validatedProp = {
          ...prop,
          // Essential fields
          player_name: prop.player_name || 'Unknown Player',
          team: prop.team || 'Unknown Team',
          // Ensure prop_type exists and is mapped to type field
          prop_type: normalizePropType(prop.prop_type),
          type: normalizePropType(prop.prop_type),
          // Validate numeric fields
          line: validateLineValue(prop.line, prop.prop_type),
          odds: validateAndFormatOdds(prop.odds),
          // Ensure confidence is within range (0.78 minimum per user requirements)
          confidence: Math.max(0.78, Math.min(1, Number(prop.confidence) || 0.78)),
          ev: Number(prop.ev) || 0.05,
          // Add any missing fields
          decimal_odds: prop.decimal_odds || calculateDecimalOdds(prop.odds),
          implied_probability: prop.implied_probability || calculateImpliedProbability(prop.odds),
          true_probability: prop.true_probability || (Number(prop.implied_probability) + Number(prop.ev) || 0.6),
          // Game metadata
          homeTeam: prop.homeTeam || 'Home Team',
          awayTeam: prop.awayTeam || 'Away Team',
          matchup: prop.matchup || `${prop.homeTeam || 'Home'} vs ${prop.awayTeam || 'Away'}`,
          time: prop.time || '7:00 PM ET',
          league: prop.league || 'MLB',
        };
        
        // Fix pick format
        const betType = (prop.pick && prop.pick.includes('UNDER')) ? 'UNDER' : 'OVER';
        validatedProp.pick = `${validatedProp.player_name} ${validatedProp.prop_type.replace('batter_', '').replace('pitcher_', '')} ${betType} ${validatedProp.line} ${validatedProp.odds}`;
        
        return validatedProp;
      }
      
      function normalizePropType(propType) {
        if (!propType || propType === 'undefined') {
          return 'batter_home_runs'; // Default if missing
        }
        
        // Make sure it has the proper prefix (batter_ or pitcher_)
        if (!propType.includes('batter_') && !propType.includes('pitcher_')) {
          if (propType.includes('strikeout') || propType.includes('earned_runs') || propType.includes('outs')) {
            return `pitcher_${propType}`;
          } else {
            return `batter_${propType}`;
          }
        }
        
        return propType;
      }
      
      function validateLineValue(line, propType) {
        // Default to 0.5 if invalid
        if (!line || isNaN(Number(line))) return 0.5;
        
        // Convert to number
        const numLine = Number(line);
        
        // Common MLB prop lines
        const validBatterLines = [0.5, 1.5, 2.5];
        const validPitcherStrikeoutLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5];
        
        // Check if prop type is pitcher strikeouts
        if (propType && propType.includes('strikeout')) {
          // Find nearest valid line for pitcher strikeouts
          return findClosestValidLine(numLine, validPitcherStrikeoutLines);
        }
        
        // For batter props, be more conservative with lines
        return findClosestValidLine(numLine, validBatterLines);
      }
      
      function findClosestValidLine(line, validLines) {
        // Find the closest valid line value
        return validLines.reduce((prev, curr) => 
          Math.abs(curr - line) < Math.abs(prev - line) ? curr : prev
        );
      }
      
      function validateAndFormatOdds(odds) {
        // If odds is a string with a text format instead of numeric
        if (typeof odds === 'string') {
          // Fix formatting like "plus140" to "+140"
          if (odds.startsWith('plus')) return `+${odds.substring(4)}`;
          if (odds.startsWith('minus')) return `-${odds.substring(5)}`;
          
          // Already formatted correctly with +/- prefix
          if (odds.startsWith('+') || odds.startsWith('-')) {
            return odds;
          }
          
          // Try to parse as a number
          const numOdds = parseInt(odds);
          if (!isNaN(numOdds)) {
            // Format with proper +/- prefix
            return numOdds > 0 ? `+${numOdds}` : `${numOdds}`;
          }
        }
        
        // If odds is a number, preserve the value but format correctly
        if (typeof odds === 'number') {
          // Format with proper +/- prefix
          return odds > 0 ? `+${odds}` : `${odds}`;
        }
        
        // Default to standard odds only if nothing else works
        return '-110';
      }
      
      function calculateDecimalOdds(americanOdds) {
        if (typeof americanOdds === 'string') {
          americanOdds = parseInt(americanOdds.replace(/^\+/, ''));
        }
        
        if (isNaN(americanOdds)) return 1.91; // Default for -110
        
        if (americanOdds > 0) {
          return +(((americanOdds / 100) + 1).toFixed(2));
        } else {
          return +(((100 / Math.abs(americanOdds)) + 1).toFixed(2));
        }
      }
      
      function calculateImpliedProbability(americanOdds) {
        const decimalOdds = calculateDecimalOdds(americanOdds);
        return +(1 / decimalOdds).toFixed(3);
      }
      
      // Log the results for debugging
      if (playerProps && playerProps.length > 0) {
        console.log(`Successfully extracted ${playerProps.length} prop picks from response`);
      } else {
        console.log('No valid prop picks found in response');
      }
      
      if (!playerProps || playerProps.length === 0) {
        console.log('No valid player prop picks generated from OpenAI response');
        return [];
      }
      
      console.log(`Generated ${playerProps.length} prop picks`);
      
      // First get all prop picks that have at least 51% confidence
      const validPicks = playerProps.filter(prop => prop.confidence >= 0.51);
      
      // Then filter for high confidence picks only (0.75+) - we only show users high-confidence picks
      const highConfidencePicks = validPicks.filter(prop => prop.confidence >= 0.75);
      
      // Log how many picks were filtered out due to confidence threshold
      console.log(`Original picks: ${playerProps.length}, Valid picks (>0.51): ${validPicks.length}, High confidence picks (>0.75): ${highConfidencePicks.length}`);
      console.log(`Filtered out ${validPicks.length - highConfidencePicks.length} picks below 0.75 confidence threshold`);
      
      return highConfidencePicks;
    } catch (error) {
      console.error('Error generating prop picks:', error);
      return [];
    }
  }
};

// Removing duplicate storePropPicksInDatabase function since it's already defined in the module exports

/**
 * Ensure we have a valid Supabase session
 */
async function ensureValidSupabaseSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.warn('No valid session found, creating anonymous session');
      await supabase.auth.signInAnonymously();
    }
  } catch (error) {
    console.error('Error ensuring valid session:', error);
    // Try to create an anonymous session
    await supabase.auth.signInAnonymously();
  }
}

// Levenshtein distance function for name similarity (used in player matching)
function levenshteinDistance(a, b) {
  if (!a || !b) return 100; // Return high distance for empty strings
  
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

export default propPicksService;
