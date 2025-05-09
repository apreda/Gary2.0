/**
 * Player Prop Picks Service
 * Handles generating and retrieving player prop picks
 */
import { makeGaryPick } from './garyEngine.js';
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
              
              // Format the game data for Gary's analysis
              const gameData = {
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                matchup: `${game.home_team} vs ${game.away_team}`,
                league: sportName,
                sportKey: sport,
                requestType: 'player_props' // Signal to OpenAI we want player props
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
                    console.log(`Found ${homeTeamPlayers.length} MLB players for ${homeTeamData.display_name}`);
                  }
                  
                  if (awayTeamData) {
                    awayTeamPlayers = await ballDontLieService.getMlbTeamPlayers(awayTeamData.id);
                    console.log(`Found ${awayTeamPlayers.length} MLB players for ${awayTeamData.display_name}`);
                  }
                }
                
                // Enrich player data with season stats for key players
                const enrichedHomePlayers = await Promise.all(
                  homeTeamPlayers.slice(0, 10).map(async (player) => {
                    try {
                      let stats = null;
                      if (sportName === 'NBA') {
                        stats = await ballDontLieService.getNbaPlayerSeasonStats(player.id);
                      } else if (sportName === 'MLB') {
                        stats = await ballDontLieService.getMlbPlayerSeasonStats(player.id);
                      }
                      return { ...player, season_stats: stats };
                    } catch (err) {
                      console.warn(`Error fetching stats for player ${player.id}:`, err.message);
                      return player;
                    }
                  })
                );
                
                const enrichedAwayPlayers = await Promise.all(
                  awayTeamPlayers.slice(0, 10).map(async (player) => {
                    try {
                      let stats = null;
                      if (sportName === 'NBA') {
                        stats = await ballDontLieService.getNbaPlayerSeasonStats(player.id);
                      } else if (sportName === 'MLB') {
                        stats = await ballDontLieService.getMlbPlayerSeasonStats(player.id);
                      }
                      return { ...player, season_stats: stats };
                    } catch (err) {
                      console.warn(`Error fetching stats for player ${player.id}:`, err.message);
                      return player;
                    }
                  })
                );
                
                // Add player stats to game data
                gameData.playerStats = {
                  homeTeam: {
                    players: enrichedHomePlayers || [],
                    team: homeTeamData
                  },
                  awayTeam: {
                    players: enrichedAwayPlayers || [],
                    team: awayTeamData
                  }
                };
                
                console.log(`Loaded ${enrichedHomePlayers.length} home team players and ${enrichedAwayPlayers.length} away team players with stats`);
                
              } catch (statsError) {
                console.warn(`Error fetching player stats from Ball Don't Lie API: ${statsError.message}`);
                // Continue without Ball Don't Lie stats if there's an error
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
                      query = `${player} recent stats points rebounds assists last 5 games NBA`;
                    } else if (gameData.league === 'MLB') {
                      query = `${player} recent batting stats home runs hits rbi last 5 games MLB`;
                    }
                    
                    // Use the Perplexity API to get real-time player stats
                    console.log(`Fetching real-time stats for ${player} via Perplexity...`);
                    const stats = await perplexityService.fetchRealTimeInfo(query, {
                      model: 'sonar',
                      temperature: 0.3,
                      maxTokens: 400
                    });
                    
                    perplexityStats[player] = stats || `No recent data found for ${player}`;
                    console.log(`Got stats for ${player} (${stats ? stats.length : 0} chars)`);
                    
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
    
    // Prepare prompt with game data and player stats
    let playerStatsSection = '';
    
    if (gameData.playerStats) {
      playerStatsSection = `PLAYER STATISTICS (from Ball Don't Lie API):\n`;
      
      // Format home team players with their key stats
      playerStatsSection += `HOME TEAM (${gameData.homeTeam}):\n`;
      gameData.playerStats.homeTeam.players.slice(0, 5).forEach(player => {
        try {
          // Different formatting for NBA vs MLB
          if (gameData.league === 'NBA') {
            const stats = player.season_stats?.stats || {};
            const injury = player.season_stats?.injury;
            
            playerStatsSection += `- ${player.first_name} ${player.last_name} (${player.position || 'N/A'})`;
            
            // Add injury information if available
            if (injury) {
              playerStatsSection += ` [INJURY: ${injury.status} - ${injury.type || ''} ${injury.detail || ''} ${injury.side || ''}]`;
            }
            
            playerStatsSection += `:\n`;
            
            if (Object.keys(stats).length > 0) {
              // Basic stats
              playerStatsSection += `  * Basic: ${stats.pts || 'N/A'} PPG, ${stats.reb || 'N/A'} RPG, ${stats.ast || 'N/A'} APG, ${stats.stl || 'N/A'} SPG, ${stats.blk || 'N/A'} BPG\n`;
              
              // Shooting stats
              playerStatsSection += `  * Shooting: ${stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) + '%' : 'N/A'} FG%, `;
              playerStatsSection += `${stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) + '%' : 'N/A'} 3P%, `;
              playerStatsSection += `${stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) + '%' : 'N/A'} FT%\n`;
              
              // Advanced stats if available
              if (stats.general_advanced) {
                playerStatsSection += `  * Advanced: ${stats.ts_pct ? (stats.ts_pct * 100).toFixed(1) + '%' : 'N/A'} TS%, `;
                playerStatsSection += `${stats.usg_pct ? (stats.usg_pct * 100).toFixed(1) + '%' : 'N/A'} USG%, `;
                playerStatsSection += `${stats.off_rtg || 'N/A'} ORTG, ${stats.def_rtg || 'N/A'} DRTG\n`;
              }
              
              // Recent trends if available
              if (stats.general_scoring) {
                playerStatsSection += `  * Scoring: ${stats.general_scoring.pts_per_36 || 'N/A'} PTS/36, ${stats.general_scoring.pts_per_100_poss || 'N/A'} PTS/100 POSS\n`;
              }
            } else {
              playerStatsSection += `  * No detailed season averages available\n`;
            }
          } else if (gameData.league === 'MLB') {
            playerStatsSection += `- ${player.first_name} ${player.last_name} (${player.position || 'N/A'})`;
            
            // Add injury information if available
            const injury = player.season_stats?.injury;
            if (injury) {
              playerStatsSection += ` [INJURY: ${injury.status} - ${injury.type || ''} ${injury.detail || ''} ${injury.side || ''}]`;
            }
            
            playerStatsSection += `:\n`;
            
            if (player.season_stats && player.season_stats.stats) {
              const stats = player.season_stats.stats;
              const isPitcher = stats.player_info?.is_pitcher;
              
              if (isPitcher) {
                // Pitching stats
                playerStatsSection += `  * Record: ${stats.pitching.wins || '0'}-${stats.pitching.losses || '0'}, ${stats.pitching.era || 'N/A'} ERA\n`;
                playerStatsSection += `  * Pitching: ${stats.pitching.innings_pitched || 'N/A'} IP, ${stats.pitching.strikeouts || 'N/A'} K, ${stats.pitching.whip || 'N/A'} WHIP\n`;
                playerStatsSection += `  * K Rate: ${stats.pitching.k_per_9 || 'N/A'} K/9, ${stats.pitching.war || 'N/A'} WAR\n`;
              } else {
                // Batting stats
                playerStatsSection += `  * Batting: ${stats.batting.batting_average || 'N/A'} AVG, ${stats.batting.on_base_percentage || 'N/A'} OBP, ${stats.batting.slugging || 'N/A'} SLG\n`;
                playerStatsSection += `  * Power: ${stats.batting.home_runs || '0'} HR, ${stats.batting.rbi || '0'} RBI, ${stats.batting.doubles || '0'} 2B, ${stats.batting.triples || '0'} 3B\n`;
                playerStatsSection += `  * Production: ${stats.batting.ops || 'N/A'} OPS, ${stats.batting.war || 'N/A'} WAR, ${stats.batting.stolen_bases || '0'} SB\n`;
              }
            } else {
              playerStatsSection += `  * No detailed season stats available\n`;
            }
          }
        } catch (error) {
          console.warn(`Error formatting player stats for ${player.first_name} ${player.last_name}:`, error.message);
          playerStatsSection += `- ${player.first_name} ${player.last_name}: Stats formatting error\n`;
        }
      });
      
      // Format away team players with their key stats
      playerStatsSection += `\nAWAY TEAM (${gameData.awayTeam}):\n`;
      gameData.playerStats.awayTeam.players.slice(0, 5).forEach(player => {
        try {
          // Different formatting for NBA vs MLB
          if (gameData.league === 'NBA') {
            const stats = player.season_stats?.stats || {};
            const injury = player.season_stats?.injury;
            
            playerStatsSection += `- ${player.first_name} ${player.last_name} (${player.position || 'N/A'})`;
            
            // Add injury information if available
            if (injury) {
              playerStatsSection += ` [INJURY: ${injury.status} - ${injury.type || ''} ${injury.detail || ''} ${injury.side || ''}]`;
            }
            
            playerStatsSection += `:\n`;
            
            if (Object.keys(stats).length > 0) {
              // Basic stats
              playerStatsSection += `  * Basic: ${stats.pts || 'N/A'} PPG, ${stats.reb || 'N/A'} RPG, ${stats.ast || 'N/A'} APG, ${stats.stl || 'N/A'} SPG, ${stats.blk || 'N/A'} BPG\n`;
              
              // Shooting stats
              playerStatsSection += `  * Shooting: ${stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) + '%' : 'N/A'} FG%, `;
              playerStatsSection += `${stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) + '%' : 'N/A'} 3P%, `;
              playerStatsSection += `${stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) + '%' : 'N/A'} FT%\n`;
              
              // Advanced stats if available
              if (stats.general_advanced) {
                playerStatsSection += `  * Advanced: ${stats.ts_pct ? (stats.ts_pct * 100).toFixed(1) + '%' : 'N/A'} TS%, `;
                playerStatsSection += `${stats.usg_pct ? (stats.usg_pct * 100).toFixed(1) + '%' : 'N/A'} USG%, `;
                playerStatsSection += `${stats.off_rtg || 'N/A'} ORTG, ${stats.def_rtg || 'N/A'} DRTG\n`;
              }
              
              // Recent trends if available
              if (stats.general_scoring) {
                playerStatsSection += `  * Scoring: ${stats.general_scoring.pts_per_36 || 'N/A'} PTS/36, ${stats.general_scoring.pts_per_100_poss || 'N/A'} PTS/100 POSS\n`;
              }
            } else {
              playerStatsSection += `  * No detailed season averages available\n`;
            }
          } else if (gameData.league === 'MLB') {
            playerStatsSection += `- ${player.first_name} ${player.last_name} (${player.position || 'N/A'})`;
            
            // Add injury information if available
            const injury = player.season_stats?.injury;
            if (injury) {
              playerStatsSection += ` [INJURY: ${injury.status} - ${injury.type || ''} ${injury.detail || ''} ${injury.side || ''}]`;
            }
            
            playerStatsSection += `:\n`;
            
            if (player.season_stats && player.season_stats.stats) {
              const stats = player.season_stats.stats;
              const isPitcher = stats.player_info?.is_pitcher;
              
              if (isPitcher) {
                // Pitching stats
                playerStatsSection += `  * Record: ${stats.pitching.wins || '0'}-${stats.pitching.losses || '0'}, ${stats.pitching.era || 'N/A'} ERA\n`;
                playerStatsSection += `  * Pitching: ${stats.pitching.innings_pitched || 'N/A'} IP, ${stats.pitching.strikeouts || 'N/A'} K, ${stats.pitching.whip || 'N/A'} WHIP\n`;
                playerStatsSection += `  * K Rate: ${stats.pitching.k_per_9 || 'N/A'} K/9, ${stats.pitching.war || 'N/A'} WAR\n`;
              } else {
                // Batting stats
                playerStatsSection += `  * Batting: ${stats.batting.batting_average || 'N/A'} AVG, ${stats.batting.on_base_percentage || 'N/A'} OBP, ${stats.batting.slugging || 'N/A'} SLG\n`;
                playerStatsSection += `  * Power: ${stats.batting.home_runs || '0'} HR, ${stats.batting.rbi || '0'} RBI, ${stats.batting.doubles || '0'} 2B, ${stats.batting.triples || '0'} 3B\n`;
                playerStatsSection += `  * Production: ${stats.batting.ops || 'N/A'} OPS, ${stats.batting.war || 'N/A'} WAR, ${stats.batting.stolen_bases || '0'} SB\n`;
              }
            } else {
              playerStatsSection += `  * No detailed season stats available\n`;
            }
          }
        } catch (error) {
          console.warn(`Error formatting player stats for ${player.first_name} ${player.last_name}:`, error.message);
          playerStatsSection += `- ${player.first_name} ${player.last_name}: Stats formatting error\n`;
        }
      });
    }
    
    // Add Perplexity data if available
    let perplexitySection = '';
    if (gameData.perplexityStats) {
      perplexitySection = '\nRECENT PERFORMANCE (from Perplexity web search):\n';
      for (const [player, stats] of Object.entries(gameData.perplexityStats)) {
        perplexitySection += `${player}: ${stats}\n\n`;
      }
    }
    
    const prompt = `
      Analyze the upcoming ${gameData.league} game: ${gameData.matchup}.
      
      ${playerStatsSection}
      
      ${perplexitySection}
      
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
        
        "odds": number (between -120 and +800),
        
        "confidence": number (0.6-1.0),
        
        "rationale": string,
        
        "market_key": string (specific API market key from The Odds API),
        
        "stats": object (relevant player statistics)
      
      }
    `;
    
    // Use OpenAI to generate player prop picks
    const messages = [
      { role: 'system', content: 'You are Gary, an expert sports analyst specializing in player prop picks.' },
      { role: 'user', content: prompt }
    ];
    
    const response = await openaiService.generateResponse(messages, {
      temperature: 0.7,
      maxTokens: 1500
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
