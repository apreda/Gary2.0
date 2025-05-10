/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import { oddsService } from './oddsService';
import { propOddsService } from './propOddsService';
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { perplexityService } from './perplexityService';
import { ballDontLieService } from './ballDontLieService';
import { sportsDbApiService } from './sportsDbApiService';
import { nbaSeason, formatSeason } from '../utils/dateUtils';

/**
 * Fetch active players for an NBA team with their current season stats
 * Uses TheSportsDB for current roster and Ball Don't Lie for season stats
 * 
 * @param {string} teamName - The name of the NBA team
 * @returns {Promise<Array>} Array of active players with their season stats
 */
async function fetchActivePlayers(teamName) {
  try {
    console.log(`Fetching active players for ${teamName}`);
    
    // 1. Get current roster from TheSportsDB (only active players)
    const roster = await sportsDbApiService.getNbaTeamRoster(teamName);
    console.log(`Found ${roster.length} active players on the ${teamName} roster from TheSportsDB`);
    
    // Get the current NBA season
    const season = nbaSeason();
    console.log(`Using NBA season: ${season} (${formatSeason(season)})`);
    
    // 2. Enrich players with season stats from Ball Don't Lie
    const playersWithStats = await Promise.all(
      roster.map(async (player) => {
        try {
          // Convert TheSportsDB player ID to Ball Don't Lie player ID
          // This requires searching for the player by name in Ball Don't Lie
          const bdlPlayers = await ballDontLieService.searchNbaPlayer(player.strPlayer);
          
          if (bdlPlayers && bdlPlayers.length > 0) {
            const bdlPlayer = bdlPlayers[0]; // Use the first match
            
            // Get season stats for this player
            const seasonStats = await ballDontLieService.getSeasonAverages({
              season: season,
              player_ids: [bdlPlayer.id]
            });
            
            if (seasonStats && seasonStats.data && seasonStats.data.length > 0) {
              // Combine player info with stats
              return {
                ...bdlPlayer,
                sportsDbData: player,
                seasonStats: seasonStats.data[0]
              };
            }
          }
          return null; // No stats found, will be filtered out
        } catch (error) {
          console.error(`Error getting stats for player ${player.strPlayer}:`, error);
          return null;
        }
      })
    );
    
    // 3. Filter out null values (players with no stats)
    const activePlayers = playersWithStats.filter(player => player !== null);
    console.log(`Found ${activePlayers.length} active players with current season stats for ${teamName}`);
    
    return activePlayers;
  } catch (error) {
    console.error(`Error fetching active players for ${teamName}:`, error);
    return [];
  }
}

const propPicksService = {
  /**
   * Generate player prop picks for today
   */
  generateDailyPropPicks: async () => {
    try {
      console.log('Generating daily player prop picks with sequential processing');
      
      // Get active sports and their games (only NBA and MLB supported for player props)
      const sportsToAnalyze = ['basketball_nba', 'baseball_mlb'];
      const allPropPicks = [];
      
      // Process one sport at a time to avoid overwhelming OpenAI API
      for (const sport of sportsToAnalyze) {
        console.log(`\n==== Processing ${sport} player props ====`);
        
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
              
              // Fetch player stats from Ball Don't Lie API
              try {
                console.log(`Fetching team and player data for ${sportName} using Ball Don't Lie API...`);
                
                // Look up teams based on sport
                let homeTeamData = null;
                let awayTeamData = null;
                let homeTeamPlayers = [];
                let awayTeamPlayers = [];
                
                if (sportName === 'NBA') {
                  console.log(`Using TheSportsDB to fetch current NBA rosters...`);
                  
                  // Get team information for reference
                  homeTeamData = await ballDontLieService.lookupNbaTeam(game.home_team);
                  awayTeamData = await ballDontLieService.lookupNbaTeam(game.away_team);
                  
                  // Get active players with current season stats using TheSportsDB and Ball Don't Lie
                  console.log(`Fetching active players for ${game.home_team}...`);
                  homeTeamPlayers = await fetchActivePlayers(game.home_team);
                  console.log(`Found ${homeTeamPlayers.length} active players with current season stats for ${game.home_team}`);
                  
                  console.log(`Fetching active players for ${game.away_team}...`);
                  awayTeamPlayers = await fetchActivePlayers(game.away_team);
                  console.log(`Found ${awayTeamPlayers.length} active players with current season stats for ${game.away_team}`);
                  
                  const season = nbaSeason();
                  console.log(`Using ${formatSeason(season)} NBA season data`);
                } else if (sportName === 'MLB') {
                  // Don't use Ball Don't Lie for MLB - it doesn't have baseball coverage
                  // Instead use TheSportsDB API which has current MLB rosters
                  console.log(`Using TheSportsDB API for MLB teams and players (Ball Don't Lie doesn't cover MLB)`);
                  
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
                      // Add MLB-specific fields
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
              
              // Get player-specific prop insights from Perplexity (hot streaks, recent trends, etc.)
              try {
                console.log('🔍 Fetching player prop trends from Perplexity...');
                // Directly call the new player prop insights method
                const perplexityData = await perplexityService.getPlayerPropInsights(gameData);
                
                if (perplexityData && perplexityData.player_insights) {
                  console.log('✅ Successfully fetched player trend data from Perplexity');
                  console.log(`📊 Trend data length: ${perplexityData.player_insights.length} characters`);
                  gameData.perplexityStats = perplexityData;
                }
              } catch (perplexityError) {
                // If there's an error or the method doesn't exist
                console.error(`❌ Error fetching player trend data from Perplexity: ${perplexityError.message}`);
                gameData.perplexityStats = { 
                  player_insights: 'No player trend data available from Perplexity',
                  meta: { error: perplexityError.message, insight_weight: '20%' }
                };
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
          
          // Format the props for the prompt
          const relevantProps = validatedProps.slice(0, 15); // Show more props since we've validated them
          const formattedOdds = relevantProps.map(prop => 
            `${prop.player}: ${prop.prop_type} ${prop.line} (OVER: ${prop.over_odds || 'N/A'} / UNDER: ${prop.under_odds || 'N/A'})`
          ).join('\n');
          
          oddsText = `CURRENT PLAYER PROPS (TODAY'S ODDS):\n${formattedOdds}`;
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
      let perplexityText = '';
      if (gameData.perplexityStats) {
        // Extract player insights
        const propInsights = gameData.perplexityStats.player_insights || '';
        const insightWeight = gameData.perplexityStats.meta?.insight_weight || '20%';
        
        // Format the insights for the prompt
        if (propInsights && typeof propInsights === 'string') {
          perplexityText = `RECENT PLAYER TRENDS AND HEADLINES (LAST 10 GAMES):\n${propInsights}\n\nNOTE: These recent player trends should account for ${insightWeight} of your decision making, with statistical analysis accounting for 80%.`;
        }
      }
      
      // Specifically tell the model which players to generate picks for
      let validatedPlayersText = '';
      if (currentPropOdds && currentPropOdds.length > 0) {
        // Get unique players
        const uniquePlayers = [...new Set(currentPropOdds.map(prop => prop.player))];
        validatedPlayersText = `CONFIRMED CURRENT PLAYERS:\n${uniquePlayers.join('\n')}\n\nGENERATE PICKS ONLY FOR THESE PLAYERS. Do not generate picks for any players not in this list.\n`;
      }
      
      const prompt = `Analyze this upcoming ${gameData.league} game: ${gameData.matchup}

TEAM DESIGNATIONS:
- HOME TEAM: ${gameData.homeTeam}
- AWAY TEAM: ${gameData.awayTeam}

PLAYER STATISTICS:\n${playerStatsText}

${oddsText ? oddsText + '\n\n' : ''}${validatedPlayersText}${perplexityText}

For ${gameData.league} games, focus on these specific markets:
${gameData.league === 'NBA' ? `- player_points (14+ points, 20+ points, etc.)  
- player_threes (especially 3+ or 4+ three-pointers made)
- player_assists (especially 7+ or 8+ assists)
- player_rebounds (especially 8+ or 10+ rebounds)
- player_pra (points+rebounds+assists)
- player_blocks (especially 2+ blocks for rim protectors)
- player_steals (especially 2+ steals for defensive specialists)
- player_double_double (points + rebounds most common)
- player_first_basket (especially for centers and high-usage scorers)
- player_points_rebounds (combined totals for frontcourt players)` : ''}
${gameData.league === 'MLB' ? `- batter_home_runs (especially for power hitters)
- batter_total_bases (especially 3+ or 4+ total bases)
- pitcher_strikeouts (especially high strikeout totals)
- batter_hits (especially for consistent contact hitters)
- pitcher_outs (innings pitched)
- batter_stolen_bases (especially for speedsters with favorable matchups)
- batter_runs_scored (especially leadoff and top of order hitters)
- batter_rbi (especially for middle-order power hitters)
- batter_extra_base_hits (doubles, triples, homers combined)
- batter_to_record_a_hit (yes/no markets)
- pitcher_earned_runs (under markets for quality starters)` : ''}
${gameData.league === 'NHL' ? `- player_goal_scorer (focus on second-line players with good odds)
- player_points (especially 2+ or 3+ points)
- player_shots_on_goal (especially high shot totals)
- player_assists (especially for playmaking forwards and defensemen)
- player_power_play_points (when available with good odds)` : ''}

EXPECTED VALUE (EV) CALCULATION:
1. Convert American odds to decimal odds:
   - For positive odds (+110): Decimal = (American / 100) + 1
   - For negative odds (-110): Decimal = (100 / |American|) + 1
2. Calculate implied probability = 1 / decimal odds
   - For American odds -110: implied probability ≈ 0.524
3. Estimate true probability based on your analysis of player stats, matchups, and trends
4. Calculate EV = (true_probability - implied_probability) × 100%
   - Example: If true probability is 0.58 and implied probability is 0.524, EV = (0.58 - 0.524) × 100% = +5.6%
5. A positive EV (e.g., +5.6%) means your model thinks there's a 5.6 percentage points edge over the market

IMPORTANT NOTES ON PROP PICKS:
- Calculate and prioritize picks with positive Expected Value (EV)
- Use the FULL confidence scale from 0.1 to 1.0 based on your statistical analysis
- 0.1-0.3: Weak edge, speculative play
- 0.3-0.5: Slight edge, low conviction
- 0.5-0.65: Moderate edge
- 0.65-0.78: Good statistical edge
- 0.78-0.9: Strong pick with excellent matchup advantages (our preferred range)
- 0.9-1.0: Extremely high conviction pick

NOTE: We're focusing ONLY on high-quality picks with 0.78+ confidence ratings

- Provide accurate line values based on current player performance
- Odds should be realistic (typically -120 to +120 for most prop bets)
- Only include props where you have identified a clear statistical advantage
- Higher EV values should correlate with higher confidence

Generate player prop picks with detailed statistical rationale for this matchup.

RESPONSE FORMAT (STRICT JSON — NO EXTRAS):
\`\`\`json
{
  "player_name": "Player's full name",
  "team": "Player's team",
  "prop_type": "points | rebounds | assists | threes | pts+reb+ast",
  "line": 25.5,
  "pick": "LeBron James POINTS OVER 25.5 -110", // Format as: "PLAYER_NAME PROP_TYPE PICK BET_TYPE ODDS"
  "odds": -110,
  "decimal_odds": 1.91,  // Converted from American odds
  "implied_probability": 0.524,  // 1 / decimal_odds
  "true_probability": 0.65,  // Your estimated true probability
  "ev": 0.126,  // EV = (true_probability - implied_probability) = (0.65 - 0.524) × 100% = +12.6%
  "confidence": 0.75,
  "homeTeam": "Home team name",
  "awayTeam": "Away team name",
  "matchup": "Team vs Team",
  "time": "7:30 PM ET",
  "league": "NBA | MLB | NHL",
  "rationale": "3-4 sentence statistical breakdown with Gary's swagger. Include EV calculation justification, performance trends, matchup advantages, and recent player performance context. Be more thorough and detailed in your analysis."  
}
\`\`\`

Generate your response as a JSON array containing all valid prop picks, each following the exact format above. Don't limit the number of picks.`;    
      
      // Use OpenAI to generate player prop picks
      const messages = [
        { 
          role: 'system', 
          content: 'You are Gary, an expert sports analyst specializing in player prop picks. You provide data-driven prop bet picks with swagger and personality.'
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
      
      // Add our own JSON extraction implementation since it's missing
      try {
        console.log('Attempting to extract JSON from OpenAI response');
        
        // First try to find array pattern
        const arrayMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
        if (arrayMatch && arrayMatch[0]) {
          console.log('Found JSON array in response');
          const rawProps = JSON.parse(arrayMatch[0]);
          
          // Ensure prop_type is properly mapped to type field (if needed)
          playerProps = rawProps.map(prop => {
            // If the API returns prop_type but code expects type
            if (prop.prop_type && prop.type === undefined) {
              return {
                ...prop,
                type: prop.prop_type // Map prop_type to type for compatibility
              };
            }
            return prop;
          });
          
        } else {
          // Try to find individual JSON objects
          const objMatch = response.match(/\{[\s\S]*?\}/g);
          if (objMatch && objMatch.length > 0) {
            console.log('Found individual JSON objects in response');
            const parsedObjects = objMatch.map(obj => {
              try {
                return JSON.parse(obj);
              } catch (e) {
                return null;
              }
            }).filter(Boolean);
            
            // Map prop_type to type if needed
            playerProps = parsedObjects.map(prop => {
              if (prop.prop_type && prop.type === undefined) {
                return { ...prop, type: prop.prop_type };
              }
              return prop;
            });
          } else {
            // Try to find content inside code blocks
            const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch && codeBlockMatch[1]) {
              const content = codeBlockMatch[1].trim();
              console.log('Found JSON in code block');
              try {
                const parsedContent = JSON.parse(content);
                if (!Array.isArray(parsedContent)) {
                  // Make sure it's an array
                  const propArray = [parsedContent];
                  
                  // Map prop_type to type if needed
                  playerProps = propArray.map(prop => {
                    if (prop.prop_type && prop.type === undefined) {
                      return { ...prop, type: prop.prop_type };
                    }
                    return prop;
                  });
                } else {
                  // Already an array, just map the fields
                  playerProps = parsedContent.map(prop => {
                    if (prop.prop_type && prop.type === undefined) {
                      return { ...prop, type: prop.prop_type };
                    }
                    return prop;
                  });
                }
              } catch (e) {
                console.error('Error parsing JSON from code block:', e);
                playerProps = [];
              }
            } else {
              console.log('No JSON found in response');
              playerProps = [];
            }
          }
        }
      } catch (error) {
        console.error('Error extracting JSON from response:', error);
        playerProps = [];
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
      
      // Then filter for high confidence picks only (0.78+) - keeping prompt unaware of this threshold
      const highConfidencePicks = validPicks.filter(prop => prop.confidence >= 0.78);
      
      // Log how many picks were filtered out due to confidence threshold
      console.log(`Original picks: ${playerProps.length}, Valid picks (>0.51): ${validPicks.length}, High confidence picks (>0.78): ${highConfidencePicks.length}`);
      console.log(`Filtered out ${validPicks.length - highConfidencePicks.length} picks below 0.78 confidence threshold`);
      
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

export { propPicksService };
