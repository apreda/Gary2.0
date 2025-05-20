/**
 * Prop Results Service
 * Handles checking and recording player prop bet results
 */
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { apiSportsService } from './apiSportsService.js';

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
      
      // Group picks by league for efficient API calls
      const picksByLeague = {};
      propPicks.forEach(pick => {
        const league = pick.league;
        if (!picksByLeague[league]) {
          picksByLeague[league] = [];
        }
        picksByLeague[league].push(pick);
      });
      
      // 2. Use API-Sports to get player statistics (primary source)
      const allPlayerStats = {};
      
      // First try to get stats using API-Sports directly
      for (const [league, leaguePicks] of Object.entries(picksByLeague)) {
        if (leaguePicks.length === 0) continue;
        
        console.log(`Processing ${leaguePicks.length} picks for ${league}`);
        
        // Group players by team for efficient API calls
        const playersByTeam = {};
        leaguePicks.forEach(pick => {
          const team = pick.team;
          if (!playersByTeam[team]) {
            playersByTeam[team] = [];
          }
          playersByTeam[team].push(pick);
        });
        
        // Process each team
        for (const [team, teamPicks] of Object.entries(playersByTeam)) {
          if (!team) continue;
          
          console.log(`Fetching stats for team ${team} in ${league}`);
          
          try {
            // Get player stats using API-Sports by team
            let playerStatsData = null;
            
            if (league === 'MLB') {
              // For MLB, we need to try to find the team's opponent
              // Since we don't have matchup info, we'll try to get all teams' stats
              playerStatsData = await apiSportsService.getMlbTeamStats(team, '');
            } else {
              // For NBA and NHL, try to get player stats by team name
              playerStatsData = await apiSportsService.getPlayerStatsForProps(team, '', league);
            }
            
            if (!playerStatsData) {
              console.log(`No player stats found for ${team} in ${league} from API-Sports`);
            } else {
              // Process the player stats data into our format
              const allTeamPlayers = [
                ...(playerStatsData.homeTeam?.players || []),
                ...(playerStatsData.awayTeam?.players || [])
              ];
              
              for (const player of allTeamPlayers) {
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
            console.error(`Error getting stats for team ${team}:`, error.message);
          }
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
          
          // Get all players for this league
          const leaguePicks = propPicks.filter(pick => pick.league === league);
          if (leaguePicks.length === 0) continue;
          
          // Group by team
          const teamPicksMap = {};
          leaguePicks.forEach(pick => {
            if (!pick.team) return;
            
            if (!teamPicksMap[pick.team]) {
              teamPicksMap[pick.team] = [];
            }
            teamPicksMap[pick.team].push(pick);
          });
          
          // Try to get games for this date
          const games = await sportsDbApiService.getEventsByDate(leagueId, date);
          console.log(`Found ${games?.length || 0} games for ${league} on ${date}`);
          
          if (!games || games.length === 0) continue;
          
          // For each game, get player stats
          for (const game of games) {
            const matchup = `${game.strHomeTeam} vs ${game.strAwayTeam}`;
            
            // Find teams that match this game
            const homeTeamPicks = teamPicksMap[game.strHomeTeam] || [];
            const awayTeamPicks = teamPicksMap[game.strAwayTeam] || [];
            const gamePicks = [...homeTeamPicks, ...awayTeamPicks];
            
            if (gamePicks.length === 0) continue;
            
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
      
      // If we still don't have sufficient stats, log a message suggesting to use the admin interface
      if (Object.keys(allPlayerStats).length < propPicks.length / 2) {
        console.log('Insufficient player stats from APIs. For best results, please visit the admin panel at https://www.betwithgary.ai/admin/results to manually review and update player prop results.');
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

// This comment replaces the removed function
// For missing stats, we recommend using the admin panel at https://www.betwithgary.ai/admin/results

export { propResultsService };
