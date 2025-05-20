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
      
      // Group picks by player for efficient processing
      const picksByPlayer = {};
      propPicks.forEach(pick => {
        const key = `${pick.player_name}-${pick.team}-${pick.league}`;
        if (!picksByPlayer[key]) {
          picksByPlayer[key] = [];
        }
        picksByPlayer[key].push(pick);
      });
      
      // 2. Use API-Sports to get player statistics (primary source)
      const allPlayerStats = {};
      
      // Process each player
      for (const [key, playerPicks] of Object.entries(picksByPlayer)) {
        if (playerPicks.length === 0) continue;
        
        const firstPick = playerPicks[0];
        const playerName = firstPick.player_name;
        const team = firstPick.team;
        const league = firstPick.league;
        
        console.log(`Processing player prop for ${playerName || 'unknown player'} (${team || 'unknown team'}) in ${league || 'unknown league'}`);
        
        try {
          // Try getting player stats directly
          try {
            // Generate a placeholder stats object for this player
            // In a real implementation, you would query the API for the specific player stats
            allPlayerStats[playerName] = {
              points: null,
              rebounds: null,
              assists: null,
              blocks: null,
              steals: null,
              threePointersMade: null,
              hits: null,
              runs: null,
              rbi: null,
              homeRuns: null,
              strikeouts: null,
              saves: null,
              goals: null
            };
            
            // Log that we need to use the admin panel for player stats
            console.log(`For player ${playerName}, please manually review stats in the admin panel at https://www.betwithgary.ai/admin/results`);
          } catch (statsError) {
            console.error(`Error fetching stats for player ${playerName}:`, statsError.message);
          }
        } catch (error) {
          console.error(`Error getting stats for player ${playerName}:`, error.message);
        }
      }
      
      // No need to try SportsDB API since we're focusing on using the admin panel
      console.log('Player stats will need to be manually verified in the admin panel');
      
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
