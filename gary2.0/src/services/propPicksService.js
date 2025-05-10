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
      
      // MLB-specific structured prompt for prop picks
      const prompt = `Analyze the upcoming MLB game: ${gameData.matchup}

Teams:
HOME_TEAM: ${gameData.homeTeam}
AWAY_TEAM: ${gameData.awayTeam}

Eligible Players:
${validatedPlayersText ? validatedPlayersText.replace('CONFIRMED CURRENT PLAYERS:', '').replace('GENERATE PICKS ONLY FOR THESE PLAYERS. Do not generate picks for any players not in this list.', '') : 'Use players from the prop odds below'}

Today's Lines:
${oddsText}

Recent Trends (last 10 games):
${perplexityText ? perplexityText.substring(0, 800) + '...' : 'Use statistical analysis for decision-making'}
Use these insights for 20% of your decision-making, and statistical analysis (80%) for the remainder.

Key Markets (focus):
- batter_home_runs
- batter_hits
- batter_total_bases
- batter_stolen_bases
- batter_runs_scored
- batter_rbi
- pitcher_strikeouts
- pitcher_outs

Combined Decision Framework:
Base each pick on a holistic evaluation that blends:
- Expected Value (EV): 60% weight
- Confidence Score: 20% weight
- Predictive Judgment: 20% weight, reflecting your forecast of true outcome chances

EV Calculation:
- Convert American odds to decimal odds
- implied_probability = 1 / decimal_odds
- true_probability = your estimated likelihood based on analysis
- EV = true_probability – implied_probability

Pick Criteria:
- Only include picks with confidence ≥ 0.78 (strong picks)
- IMPORTANT: Use the EXACT odds provided by The Odds API - do not modify or normalize them
- Evaluate all eligible props and compute a Combined Score:
  Combined Score = (0.6 × EV) + (0.2 × confidence) + (0.2 × true_probability)
- When multiple picks have similar Combined Scores (within 0.05 of each other), PREFER UNDERDOG PICKS with higher potential payouts (e.g., prefer +150 over -120 if both are good picks)
- Return the single pick that offers the best combination of value AND payout

RESPONSE FORMAT (return ONLY valid JSON array):
[
  {
    "player_name": "Full name",
    "team": "${gameData.homeTeam} | ${gameData.awayTeam}",
    "prop_type": "batter_home_runs | batter_hits | batter_total_bases | batter_stolen_bases | batter_runs_scored | batter_rbi | pitcher_strikeouts | pitcher_outs",
    "line": 0.5,
    "pick": "PLAYER_NAME PROP_TYPE OVER|UNDER LINE AMERICAN_ODDS",
    "odds": -110,
    "decimal_odds": 1.909,
    "implied_probability": 0.524,
    "true_probability": 0.65,
    "ev": 0.126,
    "confidence": 0.8,
    "homeTeam": "${gameData.homeTeam}",
    "awayTeam": "${gameData.awayTeam}",
    "matchup": "${gameData.matchup}",
    "time": "${gameData.time || '7:10 PM ET'}",
    "league": "MLB",
    "rationale": "3-4 sentence statistical breakdown with swagger, including EV calculation and matchup advantages."
  }
]`;    
      
      // Use OpenAI to generate player prop picks
      const messages = [
        { 
          role: 'system', 
          content: 'You are Gary, an expert sports analyst specializing in MLB player prop picks. You provide data-driven prop bets with swagger and personality. Focus on Expected Value (EV), analyzing player stats, matchups, and trends to find the highest-value opportunities. Evaluate all available markets (home_runs, hits, total_bases, etc.) and compute a Combined Score: (0.6 × EV) + (0.2 × confidence) + (0.2 × true_probability). When multiple picks have similar scores, PREFER UNDERDOG PICKS with higher payouts (e.g., choose +150 over -120). Return the single pick that offers the best combination of value AND payout with a confidence ≥ 0.78.'
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
