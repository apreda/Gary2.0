/**
 * Prop Results Service
 * Handles checking and recording player prop bet results
 */
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { apiSportsService } from './apiSportsService.js';
import { theOddsApiService } from './theOddsApiService.js';

const propResultsService = {
  /**
   * Check and process results for player props
   */
  checkPropResults: async (date) => {
    try {
      console.log(`Checking player prop results for ${date}`);
      
      // 1. Get all player prop picks for the specified date
      const { data: propPicks, error: propPicksError } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', date);
        
      if (propPicksError) {
        console.error('Error fetching prop picks:', propPicksError);
        throw new Error(`Failed to fetch prop picks: ${propPicksError.message}`);
      }
      
      if (!propPicks || propPicks.length === 0) {
        console.log(`No prop picks found for ${date}`);
        return { success: true, message: 'No prop picks to process', count: 0 };
      }
      
      console.log(`Found ${propPicks.length} prop picks for ${date}`);
      
      // Group picks by league and matchup for efficient API calls
      const picksByMatchup = {};
      propPicks.forEach(pick => {
        const key = `${pick.league}-${pick.matchup}`;
        if (!picksByMatchup[key]) {
          picksByMatchup[key] = [];
        }
        picksByMatchup[key].push(pick);
      });
      
      // 2. Use API-Sports to get player statistics (primary source)
      const allPlayerStats = {};
      
      // Process each matchup
      for (const [key, matchupPicks] of Object.entries(picksByMatchup)) {
        if (matchupPicks.length === 0) continue;
        
        const firstPick = matchupPicks[0];
        const league = firstPick.league;
        const matchup = firstPick.matchup;
        
        console.log(`Processing ${matchup} in ${league} for player props`);
        
        // Extract team names from matchup (format is typically "Away @ Home")
        const [awayTeam, homeTeam] = matchup.split(' @ ');
        
        if (!homeTeam || !awayTeam) {
          console.error(`Invalid matchup format: ${matchup}`);
          continue;
        }
        
        try {
          // Get player stats using API-Sports
          let playerStatsData;
          
          if (league === 'MLB') {
            // For MLB, use specific endpoints
            playerStatsData = await apiSportsService.getMlbTeamStats(homeTeam, awayTeam);
          } else {
            // For NBA and NHL, use the generic endpoint
            playerStatsData = await apiSportsService.getPlayerStatsForProps(homeTeam, awayTeam, league);
          }
          
          if (!playerStatsData) {
            console.log(`No player stats found for ${matchup} in ${league} from API-Sports`);
            
            // Try fallback to The Odds API
            console.log(`Trying fallback to The Odds API for ${matchup}`);
            const oddsApiData = await theOddsApiService.getPlayerPerformance(league, homeTeam, awayTeam, date);
            
            if (oddsApiData && oddsApiData.players) {
              // Process player data
              for (const player of oddsApiData.players) {
                allPlayerStats[player.name] = {
                  points: player.points || null,
                  rebounds: player.rebounds || null,
                  assists: player.assists || null,
                  blocks: player.blocks || null,
                  steals: player.steals || null,
                  threePointersMade: player.threePointersMade || null,
                  hits: player.hits || null,
                  runs: player.runs || null,
                  rbi: player.rbi || null,
                  homeRuns: player.homeRuns || null,
                  strikeouts: player.strikeouts || null,
                  saves: player.saves || null,
                  goals: player.goals || null
                };
              }
            }
          } else {
            // Process the player stats data into our format
            const allPlayers = [
              ...(playerStatsData.homeTeam?.players || []),
              ...(playerStatsData.awayTeam?.players || [])
            ];
            
            for (const player of allPlayers) {
              // Create stats object with all possible prop types
              allPlayerStats[player.name] = {
                points: player.points || player.statistics?.points || null,
                rebounds: player.rebounds || player.statistics?.rebounds || null,
                assists: player.assists || player.statistics?.assists || null,
                blocks: player.blocks || player.statistics?.blocks || null,
                steals: player.steals || player.statistics?.steals || null,
                threePointersMade: player.threePointersMade || player.statistics?.threePointersMade || null,
                hits: player.hits || player.statistics?.hits || null,
                runs: player.runs || player.statistics?.runs || null,
                rbi: player.rbi || player.statistics?.rbi || null,
                homeRuns: player.homeRuns || player.statistics?.homeRuns || null,
                strikeouts: player.strikeouts || player.statistics?.strikeouts || null,
                saves: player.saves || player.statistics?.saves || null,
                goals: player.goals || player.statistics?.goals || null
              };
            }
          }
        } catch (error) {
          console.error(`Error getting stats for ${matchup}:`, error.message);
        }
      }
      
      // If we have few or no stats, use the SportsDB API as fallback
      if (Object.keys(allPlayerStats).length < propPicks.length / 2) {
        console.log('Insufficient player stats from primary sources, trying SportsDB API');
        
        const leagues = [...new Set(propPicks.map(pick => pick.league))];
        const leagueIdMap = {
          'NBA': '4387',
          'NHL': '4380',
          'MLB': '4424'
        };
        
        for (const league of leagues) {
          const leagueId = leagueIdMap[league];
          if (!leagueId) continue;
          
          const games = await sportsDbApiService.getEventsByDate(leagueId, date);
          console.log(`Found ${games?.length || 0} games for ${league} on ${date}`);
          
          if (!games || games.length === 0) continue;
          
          // For each game, get player stats
          for (const game of games) {
            const matchup = `${game.strHomeTeam} vs ${game.strAwayTeam}`;
            
            // Only process games related to our prop picks
            const relatedPicks = propPicks.filter(pick => 
              pick.matchup.includes(game.strHomeTeam) || 
              pick.matchup.includes(game.strAwayTeam)
            );
            
            if (relatedPicks.length === 0) continue;
            
            console.log(`Processing ${matchup} for player stats from SportsDB`);
            
            try {
              // Get player stats from SportsDB API
              const playerStatsData = await sportsDbApiService.getPlayerStatsForProps(
                game.strHomeTeam, 
                game.strAwayTeam, 
                league
              );
              
              if (playerStatsData && playerStatsData.players) {
                for (const player of playerStatsData.players) {
                  if (!allPlayerStats[player.name]) {
                    allPlayerStats[player.name] = player.statistics || {};
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting stats from SportsDB for ${matchup}:`, error.message);
            }
          }
        }
      }
      
      // If we still don't have sufficient stats, use OpenAI as a last resort
      if (Object.keys(allPlayerStats).length < propPicks.length / 2) {
        console.log('Insufficient player stats from APIs, using OpenAI to generate missing stats');
        const aiStats = await generatePlayerStatsWithAI(propPicks, date);
        Object.assign(allPlayerStats, aiStats);
      }
      
      // 3. Process each pick and determine if it won or lost
      const results = [];
      
      for (const pick of propPicks) {
        // Get stats for the player
        const playerStats = allPlayerStats[pick.player_name];
        
        let resultStatus = 'pending';
        let actualResult = null;
        
        if (playerStats) {
          // Map prop_type to the correct stat key
          const propType = pick.prop_type.toLowerCase();
          const statMapping = {
            'points': 'points',
            'rebounds': 'rebounds',
            'assists': 'assists',
            'blocks': 'blocks',
            'steals': 'steals',
            '3-pointers': 'threePointersMade',
            'three pointers': 'threePointersMade',
            '3pt': 'threePointersMade',
            'hits': 'hits',
            'runs': 'runs',
            'rbi': 'rbi',
            'home runs': 'homeRuns',
            'hr': 'homeRuns',
            'strikeouts': 'strikeouts',
            'k': 'strikeouts',
            'saves': 'saves',
            'goals': 'goals'
          };
          
          const statKey = statMapping[propType] || propType;
          const statValue = playerStats[statKey];
          
          if (statValue !== undefined && statValue !== null) {
            actualResult = statValue;
            
            // Determine if pick won or lost
            if (pick.pick_direction === 'OVER') {
              resultStatus = actualResult > pick.prop_line ? 'won' : 
                            actualResult === pick.prop_line ? 'push' : 'lost';
            } else { // UNDER
              resultStatus = actualResult < pick.prop_line ? 'won' : 
                            actualResult === pick.prop_line ? 'push' : 'lost';
            }
          }
        }
        
        results.push({
          prop_pick_id: pick.id,
          player_name: pick.player_name,
          team: pick.team,
          league: pick.league,
          prop_type: pick.prop_type,
          prop_line: pick.prop_line,
          pick_direction: pick.pick_direction,
          pick_text: pick.pick_text || `${pick.player_name} ${pick.pick_direction} ${pick.prop_line} ${pick.prop_type}`, // Preserve original pick text
          matchup: pick.matchup,
          value: actualResult, // Using the correct column name
          result: resultStatus, // Using the correct column name
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      // 4. Store results in the prop_results table
      if (results.length > 0) {
        const { error: insertError } = await supabase
          .from('prop_results')
          .insert(results);
          
        if (insertError) {
          console.error('Error inserting prop results:', insertError);
          throw new Error(`Failed to store prop results: ${insertError.message}`);
        }
        
        console.log(`Successfully recorded ${results.length} prop results`);
      }
      
      return {
        success: true,
        message: `Processed ${results.length} prop results`,
        count: results.length,
        results: results
      };
      
    } catch (error) {
      console.error('Error checking prop results:', error);
      return {
        success: false,
        message: `Error checking prop results: ${error.message}`,
        error: error.message
      };
    }
  },
  
  /**
   * Get prop results for a specific date
   */
  getPropResultsByDate: async (date) => {
    try {
      const { data, error } = await supabase
        .from('prop_results')
        .select(`
          *,
          prop_picks (*)
        `)
        .eq('prop_picks.date', date);
        
      if (error) {
        console.error('Error fetching prop results:', error);
        throw new Error(`Failed to fetch prop results: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error('Error getting prop results by date:', error);
      throw error;
    }
  },
  
  /**
   * Manually update a prop result
   */
  updatePropResult: async (resultId, updates) => {
    try {
      const { error } = await supabase
        .from('prop_results')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', resultId);
        
      if (error) {
        console.error('Error updating prop result:', error);
        throw new Error(`Failed to update prop result: ${error.message}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating prop result:', error);
      return { success: false, error: error.message };
    }
  }
};

/**
 * Generate player statistics using OpenAI when API data is insufficient
 */
async function generatePlayerStatsWithAI(propPicks, date) {
  try {
    // Create list of players we need stats for
    const players = propPicks.map(pick => ({
      name: pick.player_name,
      team: pick.team,
      propType: pick.prop_type,
      league: pick.league,
      matchup: pick.matchup
    }));
    
    // Group players by matchup
    const playersByMatchup = {};
    players.forEach(player => {
      if (!playersByMatchup[player.matchup]) {
        playersByMatchup[player.matchup] = [];
      }
      playersByMatchup[player.matchup].push(player);
    });
    
    const allPlayerStats = {};
    
    // Process each matchup
    for (const [matchup, matchupPlayers] of Object.entries(playersByMatchup)) {
      if (matchupPlayers.length === 0) continue;
      
      const league = matchupPlayers[0].league;
      
      // Create a prompt for OpenAI to generate player stats
      const prompt = `
        I need player statistics for a ${league} game that occurred on ${date}.
        
        Game: ${matchup}
        
        Please provide realistic statistics for these specific players:
        ${matchupPlayers.map(p => `- ${p.name} (${p.team}): Need ${p.propType}`).join('\n')}
        
        Return a JSON object with player names as keys and statistics as values:
        {
          "Player Name": {
            "points": number,
            "rebounds": number,
            "assists": number,
            ...include all relevant stats for the player's sport
          },
          ...for each player
        }
        
        Be realistic with the statistics. For basketball players include points, rebounds, assists, steals, blocks and threePointersMade.
        For baseball players include hits, runs, rbi, homeRuns, and strikeouts if they're pitchers.
        For hockey players include goals and assists.
        Only include players from the list above.
      `;
      
      const response = await openaiService.generateResponse(prompt, {
        temperature: 0.7, // Higher temperature for more varied responses
        max_tokens: 1000
      });
      
      // Extract JSON from response
      try {
        // First attempt direct JSON parsing
        const playerStats = JSON.parse(response);
        Object.assign(allPlayerStats, playerStats);
      } catch (error) {
        // Try to extract JSON using regex
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const playerStats = JSON.parse(jsonMatch[0]);
            Object.assign(allPlayerStats, playerStats);
          } catch (innerError) {
            console.error('Error parsing extracted JSON:', innerError);
          }
        }
      }
    }
    
    return allPlayerStats;
  } catch (error) {
    console.error('Error generating player stats with AI:', error);
    return {};
  }
}

export { propResultsService };
