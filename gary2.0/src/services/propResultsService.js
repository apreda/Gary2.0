/**
 * Prop Results Service
 * Handles checking and recording player prop bet results
 */
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { sportsDbApiService } from './sportsDbApiService.js';

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
      
      // 2. Get player statistics for the date from sports APIs
      const leagues = [...new Set(propPicks.map(pick => pick.league))];
      const leagueIdMap = {
        'NBA': '4387',
        'NHL': '4380',
        'MLB': '4424'
      };
      
      // Fetch all games and stats for each league
      const allPlayerStats = {};
      
      for (const league of leagues) {
        const leagueId = leagueIdMap[league];
        if (!leagueId) continue;
        
        const games = await sportsDbApiService.getGamesByDate(leagueId, date);
        console.log(`Found ${games.length} games for ${league} on ${date}`);
        
        // For each game, use OpenAI to extract player stats
        for (const game of games) {
          const matchup = `${game.strHomeTeam} vs ${game.strAwayTeam}`;
          
          // Only process games related to our prop picks
          const relatedPicks = propPicks.filter(pick => 
            pick.matchup.includes(game.strHomeTeam) || 
            pick.matchup.includes(game.strAwayTeam)
          );
          
          if (relatedPicks.length === 0) continue;
          
          console.log(`Processing ${matchup} for player stats`);
          
          // Request player stats from OpenAI based on game data
          const playerStats = await extractPlayerStats(game, relatedPicks, league);
          
          if (playerStats && Object.keys(playerStats).length > 0) {
            // Store stats by player name
            Object.assign(allPlayerStats, playerStats);
          }
        }
      }
      
      // 3. Process each pick and determine if it won or lost
      const results = [];
      
      for (const pick of propPicks) {
        // Get stats for the player
        const playerStats = allPlayerStats[pick.player_name];
        
        let resultStatus = 'pending';
        let actualResult = null;
        
        if (playerStats) {
          const statValue = playerStats[pick.prop_type.toLowerCase()];
          
          if (statValue !== undefined) {
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
          actual_result: actualResult,
          result_status: resultStatus
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
 * Extract player statistics from game data using OpenAI
 */
async function extractPlayerStats(game, propPicks, league) {
  try {
    // Create list of players we need stats for
    const players = propPicks.map(pick => ({
      name: pick.player_name,
      team: pick.team,
      propType: pick.prop_type
    }));
    
    // Create a prompt for OpenAI to extract the player stats from the game data
    const prompt = `
      Extract specific player statistics from this ${league} game:
      
      Game: ${game.strHomeTeam} vs ${game.strAwayTeam}
      Date: ${game.dateEvent}
      Final Score: ${game.strHomeTeam} ${game.intHomeScore} - ${game.strAwayTeam} ${game.intAwayScore}
      
      Game details: ${game.strDescriptionEN || ''}
      Result details: ${game.strResult || ''}
      
      For each of these players, extract their exact statistics:
      ${players.map(p => `- ${p.name} (${p.team}): Need ${p.propType.toLowerCase()}`).join('\n')}
      
      Return a JSON object with player names as keys and statistics as values:
      {
        "Player Name": {
          "points": number,
          "rebounds": number,
          "assists": number,
          ...other relevant stats based on their prop types
        },
        ...for each player
      }
      
      Only include players from the list above. If you cannot find stats for a player, indicate with null values.
    `;
    
    const response = await openaiService.generateResponse(prompt, {
      temperature: 0.1,
      max_tokens: 1000
    });
    
    // Extract JSON from response
    let playerStats = {};
    try {
      // First attempt direct JSON parsing
      playerStats = JSON.parse(response);
    } catch (error) {
      // Try to extract JSON using regex
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          playerStats = JSON.parse(jsonMatch[0]);
        } catch (innerError) {
          console.error('Error parsing extracted JSON:', innerError);
        }
      }
    }
    
    return playerStats;
  } catch (error) {
    console.error('Error extracting player stats:', error);
    return {};
  }
}

export { propResultsService };
