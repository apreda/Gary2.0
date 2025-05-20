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
      
      // 1. Get prop picks from the database
      const { data: propPicksRows, error: propPicksError } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', date);
        
      if (propPicksError) {
        throw new Error(`Error getting prop picks: ${propPicksError.message}`);
      }
      
      if (!propPicksRows || propPicksRows.length === 0) {
        return {
          success: false,
          message: `No prop picks found for ${date}`,
          results: []
        };
      }
      
      // Parse the picks array from the JSON column
      let allPropPicks = [];
      for (const row of propPicksRows) {
        if (row.picks && Array.isArray(row.picks)) {
          // Transform the picks array format into our expected format
          const formattedPicks = row.picks.map(pick => ({
            id: row.id, // Use the row ID as the prop_pick_id
            date: row.date,
            player_name: pick.player,
            team: pick.team,
            league: row.league || null, // Use the league from the row if available
            prop_type: pick.prop?.split(' ')?.[0] || pick.prop, // Extract prop type from "hits 0.5"
            prop_line: pick.line || parseFloat(pick.prop?.split(' ')?.[1]) || 0, // Extract line from prop or use provided line
            pick_direction: pick.bet,
            pick_text: `${pick.player} ${pick.bet} ${pick.line || (pick.prop?.split(' ')?.[1] || '')} ${pick.prop?.split(' ')?.[0] || pick.prop}`,
            odds: pick.odds,
            confidence: pick.confidence,
            matchup: row.matchup || null
          }));
          
          allPropPicks = [...allPropPicks, ...formattedPicks];
        }
      }
      
      console.log(`Found ${allPropPicks.length} individual prop picks for ${date}`);
      
      // For prop results, we only care about MLB stats
      console.log('Processing MLB prop stats only');
      
      // Filter to MLB picks only and add any picks with MLB teams
      const mlbTeams = [
        'New York Yankees', 'New York Mets', 'Chicago White Sox', 'Chicago Cubs', 
        'Detroit Tigers', 'Toronto Blue Jays', 'St. Louis Cardinals', 'Washington Nationals',
        'Baltimore Orioles', 'Miami Marlins', 'Tampa Bay Rays'
      ];
      
      // Identify MLB picks by league or team name
      const mlbPicks = allPropPicks.filter(pick => {
        return pick.league === 'MLB' || 
          (pick.team && mlbTeams.includes(pick.team));
      });
      
      console.log(`Found ${mlbPicks.length} MLB prop picks to process`);
      
      // Group MLB picks by team for efficient API calls
      const teamGroupedPicks = {};
      mlbPicks.forEach(pick => {
        const team = pick.team || 'unknown';
        if (!teamGroupedPicks[team]) {
          teamGroupedPicks[team] = [];
        }
        teamGroupedPicks[team].push(pick);
      });
      
      // Helper function to generate name variations for better matching
      function generateNameVariations(name) {
        const variations = [];
        
        // Remove suffixes like Jr./Sr.
        if (name.includes(' Jr.')) {
          variations.push(name.replace(' Jr.', ''));
          variations.push(name.replace(' Jr.', ' Jr'));
        }
        
        if (name.includes(' Sr.')) {
          variations.push(name.replace(' Sr.', ''));
          variations.push(name.replace(' Sr.', ' Sr'));
        }
        
        // Handle middle initials
        const parts = name.split(' ');
        if (parts.length > 2) {
          // Remove middle name/initial
          variations.push(`${parts[0]} ${parts[parts.length-1]}`);
        }
        
        return variations;
      }
      
      // 3. Get player stats from API-Sports or other data source
      const allPlayerStats = {};
      
      // Get stats for each MLB team
      for (const team in teamGroupedPicks) {
        if (team === 'unknown') continue;
        
        console.log(`Fetching MLB stats for team ${team} on date ${date}`);
        
        try {
          // Get player stats by team and date using our method designed for props
          const playerStatsData = await apiSportsService.getPlayerStatsForProps(team, date, 'MLB');
          
          if (!playerStatsData) {
            console.log(`No MLB player stats found for ${team} on ${date} from API-Sports`);
            continue;
          }
          
          // Add player stats to the global stats map
          if (playerStatsData.players && playerStatsData.players.length > 0) {
            console.log(`Found real stats for ${playerStatsData.players.length} players on ${team}`);
            
            // Log detailed player data for debugging
            playerStatsData.players.forEach(player => {
              console.log(`Player ${player.name} stats:`, JSON.stringify(player.statistics));
            });
            
            playerStatsData.players.forEach(player => {
              if (!allPlayerStats[player.name]) {
                // Store the stats - they should already be normalized from the API call
                allPlayerStats[player.name] = player.statistics;
                
                // Also try name variations (for example "Jr." vs "Jr")
                const nameVariations = generateNameVariations(player.name);
                nameVariations.forEach(variation => {
                  if (!allPlayerStats[variation]) {
                    allPlayerStats[variation] = player.statistics;
                  }
                });
                
                // Also try first initial + last name for better matching
                const nameParts = player.name.split(' ');
                if (nameParts.length >= 2) {
                  const firstInitialLastName = `${nameParts[0][0]}. ${nameParts[nameParts.length-1]}`;
                  if (!allPlayerStats[firstInitialLastName]) {
                    allPlayerStats[firstInitialLastName] = player.statistics;
                  }
                }
              }
            });
          } else {
            console.log(`No player data found in API response for ${team}`);
          }
        } catch (error) {
          console.error(`Error getting MLB stats for team ${team}:`, error.message);
        }
      }
      
      // If we can't get enough real stats, guide the user to the admin panel
      if (Object.keys(allPlayerStats).length < mlbPicks.length / 2) {
        console.log('Insufficient player stats from APIs. For best results, please visit the admin panel at https://www.betwithgary.ai/admin/results to manually review and update player prop results.');
      }
      
      console.log(`Real player stats collected for ${Object.keys(allPlayerStats).length} players`);
      
      // Process each MLB pick to determine the result
      const results = [];
      
      for (const pick of mlbPicks) {
        const playerName = pick.player_name;
        const propType = pick.prop_type;
        const propLine = parseFloat(pick.prop_line);
        const pickDirection = pick.pick_direction;
        
        console.log(`Processing ${playerName} ${propType} ${pickDirection} ${propLine}`);
        
        let actualResult = null;
        let resultStatus = 'pending';
        
        // Get stats for this player
        const playerStats = allPlayerStats[playerName];
        
        if (playerStats) {
          console.log(`Processing prop for ${playerName} with real data`);
          
          // Map prop_type to the correct stat key
          const statKey = propType.toLowerCase();
          const statMapping = {
            'hits': 'hits',
            'runs': 'runs',
            'rbi': 'rbi',
            'total_bases': 'total_bases',
            'strikeouts': 'strikeouts',
            'outs': 'outs',
            'hits_runs_rbis': 'hits_runs_rbis'
          };
          
          // Check if we have the needed stat
          let statFound = false;
          let mappedStatKey;
          
          if (statKey in statMapping) {
            mappedStatKey = statMapping[statKey];
            if (playerStats[mappedStatKey] !== undefined) {
              actualResult = playerStats[mappedStatKey];
              statFound = true;
              console.log(`Found stat ${mappedStatKey} = ${actualResult} for ${playerName}`);
            }
          } else if (playerStats[statKey] !== undefined) {
            // If we don't have a mapping, try to use the prop type directly as a key
            actualResult = playerStats[statKey];
            statFound = true;
            console.log(`Found direct stat ${statKey} = ${actualResult} for ${playerName}`);
          }
          
          // Only determine a result if we actually have the required stat
          if (statFound) {
            // Determine if pick won or lost
            const normalizedDirection = (pick.pick_direction || '').toUpperCase();
            if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
              resultStatus = actualResult > propLine ? 'won' : 
                            actualResult === propLine ? 'push' : 'lost';
              console.log(`${playerName} ${statKey} ${actualResult} vs line ${propLine} (OVER) = ${resultStatus}`);
            } else if (normalizedDirection === 'UNDER' || normalizedDirection === 'U') {
              resultStatus = actualResult < propLine ? 'won' : 
                            actualResult === propLine ? 'push' : 'lost';
              console.log(`${playerName} ${statKey} ${actualResult} vs line ${propLine} (UNDER) = ${resultStatus}`);
            } else {
              console.log(`Unknown pick direction: ${pick.pick_direction}`);
            }
          } else {
            console.log(`Required stat for ${playerName} (${statKey}) not found in data`);
            resultStatus = 'pending';
          }
        } else {
          console.log(`No stats found for player ${playerName}`);
        }
        
        // Create result object with only columns that exist in the database schema
        const resultObj = {
          prop_pick_id: pick.id,
          game_date: pick.date, // Use the date from the pick as game_date
          player_name: pick.player_name,
          prop_type: pick.prop_type,
          line_value: pick.prop_line, // This matches the line_value column in DB
          actual_value: actualResult, // This matches the actual_value column in DB
          result: resultStatus,
          odds: pick.odds || null, // Add odds if available
          pick_text: pick.pick_text || `${pick.player_name} ${pick.pick_direction} ${pick.prop_line} ${pick.prop_type}`,
          matchup: pick.matchup || null, // Add matchup if available
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        results.push(resultObj);
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
