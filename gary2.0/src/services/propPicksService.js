/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService';
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { sportsDbApiService } from './sportsDbApiService';
import { perplexityService } from './perplexityService';

const propPicksService = {
  /**
   * Generate player prop picks for today
   */
  generateDailyPropPicks: async () => {
    try {
      console.log('Generating daily player prop picks with sequential processing');
      
      // Get active sports and their games
      const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
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
              
              // Format the game data for Gary's analysis
              const gameData = {
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                matchup: `${game.home_team} vs ${game.away_team}`,
                league: sportName,
                sportKey: sport,
                requestType: 'player_props' // Signal to OpenAI we want player props
              };
              
              // Fetch player stats from SportsDB API
              const leagueIdMap = {
                'NBA': '4387',
                'MLB': '4424',
                'NHL': '4380'
              };
              
              try {
                // Get teams and players data
                const leagueId = leagueIdMap[sportName];
                if (leagueId) {
                  console.log(`Fetching team and player data for ${sportName}...`);
                  
                  // First, look up team IDs
                  const homeTeamData = await sportsDbApiService.lookupTeam(game.home_team, leagueId);
                  const awayTeamData = await sportsDbApiService.lookupTeam(game.away_team, leagueId);
                  
                  if (homeTeamData && awayTeamData) {
                    // Then get player stats for both teams
                    const homeTeamId = homeTeamData.idTeam;
                    const awayTeamId = awayTeamData.idTeam;
                    
                    const homeTeamPlayers = await sportsDbApiService.getTeamPlayers(homeTeamId);
                    const awayTeamPlayers = await sportsDbApiService.getTeamPlayers(awayTeamId);
                    
                    // Add player stats to game data
                    gameData.playerStats = {
                      homeTeam: {
                        players: homeTeamPlayers || [],
                        teamId: homeTeamId
                      },
                      awayTeam: {
                        players: awayTeamPlayers || [],
                        teamId: awayTeamId
                      }
                    };
                    
                    console.log(`Found ${homeTeamPlayers?.length || 0} home team players and ${awayTeamPlayers?.length || 0} away team players`);
                  }
                }
              } catch (statsError) {
                console.warn(`Error fetching player stats from SportsDB: ${statsError.message}`);
                // Continue without SportsDB player stats if there's an error
              }
              
              // LAYER 2: Fetch recent player stats from Perplexity (web search)
              try {
                console.log('Fetching recent player stats from Perplexity (layer 2)...');
                
                // Identify key players to get stats for
                let keyPlayers = [];
                
                // Use players from SportsDB if available
                if (gameData.playerStats) {
                  // Get top 3 players from each team
                  const homeTeamPlayers = gameData.playerStats.homeTeam.players || [];
                  const awayTeamPlayers = gameData.playerStats.awayTeam.players || [];
                  
                  // Select up to 3 players from each team
                  const homePlayers = homeTeamPlayers.slice(0, 3).map(p => `${p.strPlayer} ${gameData.homeTeam}`);
                  const awayPlayers = awayTeamPlayers.slice(0, 3).map(p => `${p.strPlayer} ${gameData.awayTeam}`);
                  
                  keyPlayers = [...homePlayers, ...awayPlayers];
                } 
                // If no SportsDB data, use team names to get top players
                else {
                  keyPlayers = [
                    `top players ${gameData.homeTeam} ${gameData.league}`,
                    `top players ${gameData.awayTeam} ${gameData.league}`
                  ];
                }
                
                // Get recent stats for each player from Perplexity
                const perplexityStats = {};
                
                for (const player of keyPlayers) {
                  try {
                    // Query based on league and stat type
                    let query = '';
                    if (gameData.league === 'NBA') {
                      query = `${player} recent stats points rebounds assists last 5 games`;
                    } else if (gameData.league === 'MLB') {
                      query = `${player} recent batting stats home runs hits rbi last 5 games`;
                    } else if (gameData.league === 'NHL') {
                      query = `${player} recent stats goals assists points shots last 5 games`;
                    }
                    
                    const stats = await perplexityService.query(query);
                    perplexityStats[player] = stats;
                    console.log(`Got recent stats for ${player} from Perplexity`);
                    
                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                  } catch (error) {
                    console.warn(`Error getting Perplexity stats for ${player}: ${error.message}`);
                  }
                }
                
                // Add to gameData
                gameData.perplexityStats = perplexityStats;
                console.log(`Added Perplexity stats for ${Object.keys(perplexityStats).length} players/queries`);
              } catch (perplexityError) {
                console.warn(`Error fetching player stats from Perplexity: ${perplexityError.message}`);
                // Continue without Perplexity stats if there's an error
              }
              
              // Request player prop suggestions from OpenAI
              const playerProps = await generatePlayerPropPicks(gameData);
              
              if (playerProps && playerProps.length > 0) {
                allPropPicks.push(...playerProps);
                console.log(`Added ${playerProps.length} player prop picks for ${gameData.matchup}`);
              } else {
                console.log(`No high-confidence player props generated for ${gameData.matchup}`);
              }
              
              // Add a delay between API calls to avoid rate limiting
              console.log('Waiting 2 seconds before next analysis to avoid rate limits...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
            } catch (error) {
              console.error(`Error analyzing player props for ${game.home_team} vs ${game.away_team}:`, error.message);
            }
          }
        } catch (error) {
          console.error(`Error processing ${sport} games:`, error.message);
        }
      }
      
      // Store the player prop picks
      if (allPropPicks.length > 0) {
        await storePropPicksInDatabase(allPropPicks);
        return { success: true, count: allPropPicks.length };
      } else {
        console.log('No player prop picks were generated');
        return { success: false, count: 0 };
      }
      
    } catch (error) {
      console.error('Error generating player prop picks:', error);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get today's player prop picks
   */
  getTodayPropPicks: async () => {
    try {
      // Get today's date in correct format
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      
      return propPicksService.getPropPicksByDate(dateString);
    } catch (error) {
      console.error('Error fetching today\'s prop picks:', error);
      throw error;
    }
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
      
      if (!data || data.length === 0) {
        console.log(`No prop picks found for ${dateString}`);
        return [];
      }
      
      console.log(`Found ${data.length} prop picks for ${dateString}`);
      return data;
    } catch (error) {
      console.error('Error fetching prop picks by date:', error);
      throw error;
    }
  }
};

/**
 * Generate player prop picks for a specific game
 */
async function generatePlayerPropPicks(gameData) {
  try {
    console.log(`Generating player prop picks for ${gameData.matchup}`);
    
    // Create a prompt that specifically asks for high-odds player props based on statistical analysis
    const prompt = `
      Analyze the upcoming ${gameData.league} game: ${gameData.matchup}.
      
      Generate 2-3 high-upside player prop bets with preferred odds between -120 and +800.
      
      IMPORTANT: All picks must be based 100% on rigorous statistical analysis, not on gut feelings or narrative-based reasoning.
      
      I've provided you with multiple layers of data to analyze:
      ${gameData.playerStats ? '- Layer 1: SportsDB player statistics from the official database' : ''}
      ${gameData.perplexityStats ? '- Layer 2: Recent player performance data from web searches via Perplexity' : ''}
      
      Use this comprehensive data to identify statistically-backed prop opportunities with clear numerical advantages.
      
      For ${gameData.league} games, focus on these specific markets:
      ${gameData.league === 'NBA' ? `
      - player_points_alternate (14+ points, 20+ points, etc.)  
      - player_threes (especially 3+ or 4+ three-pointers made)
      - player_assists_alternate (especially 7+ or 8+ assists)
      - player_rebounds_alternate (especially 8+ or 10+ rebounds)
      - player_double_double or player_triple_double (for star players)` : ''}
      ${gameData.league === 'MLB' ? `
      - batter_home_runs (especially for underdogs to hit a home run)
      - batter_total_bases_alternate (especially 3+ or 4+ total bases)
      - pitcher_strikeouts_alternate (especially high strikeout totals)
      - batter_rbis_alternate (especially 2+ or 3+ RBIs)
      - pitcher_record_a_win (for underdog pitchers)` : ''}
      ${gameData.league === 'NHL' ? `
      - player_goal_scorer_anytime (focus on second-line players with good odds)
      - player_points_alternate (especially 2+ or 3+ points)
      - player_shots_on_goal_alternate (especially high shot totals)
      - player_assists_alternate (especially for defensemen)
      - player_power_play_points (when available with good odds)` : ''}
      
      For each prop:
      
      1. Identify a specific player who has a statistical advantage for this prop
      
      2. Determine the appropriate prop line value based on recent statistical performance
      
      3. Select OVER or UNDER based purely on statistical analysis
      
      4. Use odds values between -120 and +800 only
      
      5. Provide a detailed statistical rationale with specific metrics and trends
      
      6. Only include props with at least 60% confidence based on statistical modeling
      
      
      
      Format as JSON array with these fields for each prop:
      
      {
        
        "player_name": string,
        
        "team": string,
        
        "prop_type": string (e.g., "Points", "Rebounds", "Strikeouts"),
        
        "prop_line": number,
        
        "pick_direction": string ("OVER" or "UNDER"),
        
        "odds": number (MUST be positive, between -120 and +00),
        
        "confidence": number (0.6-1.0),
        
        "rationale": string,
        
        "market_key": string (specific API market key from The Odds API),
        
        "stats": object (relevant player statistics)
      
      }
    `;
    
    // Use OpenAI to generate player prop picks
    const response = await openaiService.generateResponse(prompt, {
      temperature: 0.7,
      max_tokens: 1500
    });
    
    // Extract the JSON response
    const playerProps = extractJSONFromResponse(response);
    
    if (!playerProps || playerProps.length === 0) {
      console.log('No valid player prop picks generated from OpenAI response');
      return [];
    }
    
    // Filter for high confidence picks only (0.7+)
    const highConfidencePicks = playerProps.filter(prop => prop.confidence >= 0.7);
    
    // Add additional metadata to each pick
    return highConfidencePicks.map(prop => ({
      ...prop,
      league: gameData.league,
      matchup: gameData.matchup,
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('Error generating player prop picks:', error);
    return [];
  }
}

/**
 * Extract JSON from OpenAI response
 */
function extractJSONFromResponse(response) {
  try {
    // First try direct JSON parsing
    try {
      return JSON.parse(response);
    } catch (error) {
      // If direct parsing fails, try to find JSON in the response
      const jsonRegex = /\[[\s\S]*\]|\{[\s\S]*\}/;
      const match = response.match(jsonRegex);
      
      if (match) {
        return JSON.parse(match[0]);
      }
    }
    
    console.error('Failed to extract JSON from response');
    return null;
  } catch (error) {
    console.error('Error extracting JSON:', error);
    return null;
  }
}

/**
 * Store player prop picks in the database
 */
async function storePropPicksInDatabase(propPicks) {
  try {
    console.log(`Storing ${propPicks.length} player prop picks in database`);
    
    // Ensure valid Supabase session
    await ensureValidSupabaseSession();
    
    // Batch insert all prop picks
    const { data, error } = await supabase
      .from('prop_picks')
      .insert(propPicks);
      
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
