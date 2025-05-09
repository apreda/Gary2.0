/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import { oddsService } from './oddsService';
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { perplexityService } from './perplexityService';
import { ballDontLieService } from './ballDontLieService';

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
                  // Get NBA team and player data
                  homeTeamData = await ballDontLieService.lookupNbaTeam(game.home_team);
                  awayTeamData = await ballDontLieService.lookupNbaTeam(game.away_team);
                  
                  if (homeTeamData) {
                    homeTeamPlayers = await ballDontLieService.getNbaTeamPlayers(homeTeamData.id);
                    console.log(`Found ${homeTeamPlayers.length} NBA players for ${homeTeamData.full_name}`);
                  }
                  
                  if (awayTeamData) {
                    awayTeamPlayers = await ballDontLieService.getNbaTeamPlayers(awayTeamData.id);
                    console.log(`Found ${awayTeamPlayers.length} NBA players for ${awayTeamData.full_name}`);
                  }
                  
                } else if (sportName === 'MLB') {
                  // Get MLB team and player data
                  homeTeamData = await ballDontLieService.lookupMlbTeam(game.home_team);
                  awayTeamData = await ballDontLieService.lookupMlbTeam(game.away_team);
                  
                  if (homeTeamData) {
                    homeTeamPlayers = await ballDontLieService.getMlbTeamPlayers(homeTeamData.id);
                    console.log(`Found ${homeTeamPlayers.length} MLB players for ${homeTeamData.full_name}`);
                  }
                  
                  if (awayTeamData) {
                    awayTeamPlayers = await ballDontLieService.getMlbTeamPlayers(awayTeamData.id);
                    console.log(`Found ${awayTeamPlayers.length} MLB players for ${awayTeamData.full_name}`);
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
              
              // Get additional insights from Perplexity if available
              try {
                console.log('Fetching additional insights from Perplexity...');
                const perplexityData = await perplexityService.getGameInsights(gameData);
                
                if (perplexityData) {
                  console.log('Successfully fetched data from Perplexity');
                  gameData.perplexityStats = perplexityData;
                }
              } catch (perplexityError) {
                console.error(`Error fetching data from Perplexity: ${perplexityError.message}`);
                // Proceed without Perplexity data if there's an error
              }
              
              // Generate prop picks for this game
              const gamePropPicks = await propPicksService.generatePropBets(gameData);
              
              if (gamePropPicks.length > 0) {
                console.log(`Generated ${gamePropPicks.length} prop picks for ${gameData.matchup}`);
                allPropPicks.push(...gamePropPicks);
              } else {
                console.log(`No prop picks generated for ${gameData.matchup}`);
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
        await storePropPicksInDatabase(allPropPicks);
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
   * Generate prop bet recommendations
   */
  generatePropBets: async (gameData) => {
    try {
      console.log(`Generating prop bets for ${gameData.league} game: ${gameData.matchup}`);
      
      const prompt = `Analyze this upcoming ${gameData.league} game: ${gameData.matchup}

TEAM DESIGNATIONS:
- HOME TEAM: ${gameData.homeTeam}
- AWAY TEAM: ${gameData.awayTeam}

${gameData.playerStats ? 'PLAYER STATISTICS:\n' + JSON.stringify(gameData.playerStats, null, 2) : 'No player statistics available'}

${gameData.perplexityStats ? 'RECENT PERFORMANCE (from Perplexity web search):\n' + JSON.stringify(gameData.perplexityStats, null, 2) : ''}

For ${gameData.league} games, focus on these specific markets:
${gameData.league === 'NBA' ? `- player_points (14+ points, 20+ points, etc.)  
- player_threes (especially 3+ or 4+ three-pointers made)
- player_assists (especially 7+ or 8+ assists)
- player_rebounds (especially 8+ or 10+ rebounds)
- player_pra (points+rebounds+assists)` : ''}
${gameData.league === 'MLB' ? `- batter_home_runs (especially for power hitters)
- batter_total_bases (especially 3+ or 4+ total bases)
- pitcher_strikeouts (especially high strikeout totals)
- batter_hits (especially for consistent contact hitters)
- pitcher_outs (innings pitched)` : ''}
${gameData.league === 'NHL' ? `- player_goal_scorer (focus on second-line players with good odds)
- player_points (especially 2+ or 3+ points)
- player_shots_on_goal (especially high shot totals)
- player_assists (especially for playmaking forwards and defensemen)
- player_power_play_points (when available with good odds)` : ''}

IMPORTANT NOTES ON PROP PICKS:
- Use the FULL confidence scale from 0.51 to 1.0 based on your statistical analysis
- 0.51-0.6: Slight edge
- 0.6-0.7: Moderate edge
- 0.7-0.8: Good statistical edge
- 0.8-0.9: Strong pick with excellent matchup advantages
- 0.9-1.0: Extremely high conviction pick

- Provide accurate line values based on current player performance
- Odds should be realistic (typically -120 to +120 for most prop bets)
- Only include props where you have identified a clear statistical advantage

Provide 2-3 high-quality player prop picks with detailed statistical rationale.

RESPONSE FORMAT (STRICT JSON — NO EXTRAS):
\`\`\`json
{
  "player_name": "Player's full name",
  "team": "Player's team",
  "prop_type": "points | rebounds | assists | threes | pts+reb+ast",
  "line": 25.5,
  "pick": "over | under",
  "odds": -110,
  "confidence": 0.75,
  "homeTeam": "Home team name",
  "awayTeam": "Away team name",
  "matchup": "Team vs Team",
  "time": "7:30 PM ET",
  "league": "NBA | MLB | NHL",
  "rationale": "1-2 sentence statistical breakdown with Gary's swagger. Mention recent performance trends, matchup advantages, and any key insights."  
}
\`\`\`

Generate your response as a JSON array with 2-3 prop picks, each following the exact format above.`;    
      
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
        maxTokens: 1500
      });
      
      // Extract the JSON response
      const playerProps = openaiService.extractJSONFromResponse(response);
      
      if (!playerProps || playerProps.length === 0) {
        console.log('No valid player prop picks generated from OpenAI response');
        return [];
      }
      
      console.log(`Generated ${playerProps.length} prop picks`);
      
      // Filter for picks with at least 51% confidence (lowered threshold)
      const highConfidencePicks = playerProps.filter(prop => prop.confidence >= 0.51);
      
      return highConfidencePicks;
    } catch (error) {
      console.error('Error generating prop picks:', error);
      return [];
    }
  }
};

/**
 * Store player prop picks in the database
 */
async function storePropPicksInDatabase(propPicks) {
  try {
    console.log(`Storing raw player prop picks in database`);
    
    // Ensure valid Supabase session
    await ensureValidSupabaseSession();
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Format data for Supabase - store the entire array as raw JSON
    const pickEntry = {
      date: today,
      picks: propPicks, // Store the raw array as is
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
    return { success: true, count: propPicks.length };
  } catch (error) {
    console.error('Error storing prop picks:', error);
    throw error;
  }
}

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
