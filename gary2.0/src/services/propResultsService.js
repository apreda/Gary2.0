/**
 * Prop Results Service
 * Handles checking and recording MLB player prop bet results
 * Uses MLB Stats API for retrieving player stats and determining prop results
 */
import { supabase } from '../supabaseClient.js';
import { mlbStatsApiService } from './mlbStatsApiService.js';

const propResultsService = {
  /**
   * Check and process results for player props
   * Uses MLB Stats API service to determine results
   * @param {string} date - Date to check results for (YYYY-MM-DD)
   * @returns {Object} - Results object
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
      let propsList = [];
      for (const row of propPicksRows) {
        if (row.picks && Array.isArray(row.picks)) {
          // Format the picks for processing
          const formattedPicks = row.picks.map(pick => ({
            prop_pick_id: row.id, // Store the prop_pick_id for DB relation
            date: row.date,
            player: pick.player,
            team: pick.team,
            league: row.league || 'MLB', // Default to MLB
            prop: pick.prop?.split(' ')?.[0] || pick.prop, // Extract prop type
            line: pick.line || parseFloat(pick.prop?.split(' ')?.[1]) || 0, // Extract line
            bet: pick.bet, // Over/Under
            odds: pick.odds,
            confidence: pick.confidence,
            matchup: row.matchup || null,
            pick_text: `${pick.player} ${pick.bet} ${pick.line || (pick.prop?.split(' ')?.[1] || '')} ${pick.prop?.split(' ')?.[0] || pick.prop}`
          }));
          
          propsList = [...propsList, ...formattedPicks];
        }
      }
      
      console.log(`Found ${propsList.length} individual prop picks for ${date}`);
      
      // 2. Filter to MLB picks only
      const mlbTeams = [
        'New York Yankees', 'New York Mets', 'Chicago White Sox', 'Chicago Cubs', 
        'Detroit Tigers', 'Toronto Blue Jays', 'St. Louis Cardinals', 'Washington Nationals',
        'Baltimore Orioles', 'Miami Marlins', 'Tampa Bay Rays', 'Boston Red Sox', 'Cleveland Guardians',
        'Philadelphia Phillies', 'Atlanta Braves', 'Pittsburgh Pirates', 'Cincinnati Reds',
        'Colorado Rockies', 'Milwaukee Brewers', 'Los Angeles Angels', 'Los Angeles Dodgers',
        'Minnesota Twins', 'Oakland Athletics', 'San Diego Padres', 'San Francisco Giants',
        'Seattle Mariners', 'Texas Rangers', 'Kansas City Royals', 'Houston Astros', 'Arizona Diamondbacks'
      ];
      
      // Identify MLB picks by league or team name
      const mlbPropsList = propsList.filter(pick => {
        return pick.league === 'MLB' || 
          (pick.team && mlbTeams.some(team => 
            pick.team.toLowerCase().includes(team.toLowerCase()) || 
            team.toLowerCase().includes(pick.team.toLowerCase())
          ));
      });
      
      console.log(`Found ${mlbPropsList.length} MLB prop picks to process`);
      
      // 3. Use MLB Stats API to process all props in one batch
      const apiResults = await mlbStatsApiService.automateProps(mlbPropsList, date);
      console.log(`MLB Stats API returned results for ${apiResults.length} props`); 
      
      // Group props by date to filter per day
      const propsByDate = {};
      apiResults.forEach(prop => {
        const propDate = prop.game_date || date;
        if (!propsByDate[propDate]) {
          propsByDate[propDate] = [];
        }
        propsByDate[propDate].push(prop);
      });

      // For each date, process all props (removed top 10 limit)
      let filteredApiResults = [];
      Object.keys(propsByDate).forEach(propDate => {
        const propsForDate = propsByDate[propDate];
        console.log(`Processing ${propsForDate.length} props for date ${propDate}`);
        
        // Sort by confidence level in descending order (highest confidence first)
        propsForDate.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        
        // Process ALL props for this date (removed .slice(0, 10) limit)
        console.log(`Processing all ${propsForDate.length} prop picks for ${propDate} with confidence levels: ${propsForDate.map(r => r.confidence || 'unknown').join(', ')}`);
        
        // Add all props to final list
        filteredApiResults = [...filteredApiResults, ...propsForDate];
      });
      
      console.log(`Total filtered prop picks across all dates: ${filteredApiResults.length}`);
      if (filteredApiResults.length === 0) {
        console.warn('No prop picks met the filtering criteria');
        return { success: false, message: 'No prop picks met the filtering criteria', count: 0 };
      }
      
      // 4. Format results for storage in Supabase prop_results table
      // Process all props (removed 10 item limit)
      const resultsToInsert = filteredApiResults.map(apiResult => {
        return {
          prop_pick_id: apiResult.prop_pick_id,
          game_date: date,
          player_name: apiResult.player,
          prop_type: apiResult.prop,
          line_value: apiResult.line,
          actual_value: apiResult.actual !== null ? apiResult.actual : null,
          result: apiResult.result,
          bet: apiResult.bet,
          odds: apiResult.odds || null,
          pick_text: apiResult.pick_text,
          matchup: apiResult.matchup || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
          // Removed player_id and game_id as they're not in the Supabase schema
        };
      });
      
      // 5. Store results in Supabase prop_results table
      if (resultsToInsert.length > 0) {
        // First, check if we already have results for these prop picks
        const propPickIds = resultsToInsert.map(r => r.prop_pick_id);
        const { data: existingResults, error: fetchError } = await supabase
          .from('prop_results')
          .select('prop_pick_id')
          .in('prop_pick_id', propPickIds);
          
        if (fetchError) {
          console.error('Error checking existing results:', fetchError);
          throw new Error(`Failed to check existing results: ${fetchError.message}`);
        }
        
        // Filter out props that already have results
        const existingPickIds = existingResults?.map(r => r.prop_pick_id) || [];
        const newResults = resultsToInsert.filter(r => !existingPickIds.includes(r.prop_pick_id));
        
        if (newResults.length > 0) {
          console.log(`Inserting ${newResults.length} new prop results`);
          const { error: insertError } = await supabase
            .from('prop_results')
            .insert(newResults);
            
          if (insertError) {
            console.error('Error inserting prop results:', insertError);
            throw new Error(`Failed to store prop results: ${insertError.message}`);
          }
          
          console.log(`Successfully recorded ${newResults.length} prop results`);
        } else {
          console.log('No new prop results to insert');
        }
      }
      
      return {
        success: true,
        message: `Processed ${resultsToInsert.length} prop results`,
        count: resultsToInsert.length,
        results: resultsToInsert
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
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Array} - Array of prop results
   */
  getPropResultsByDate: async (date) => {
    try {
      const { data, error } = await supabase
        .from('prop_results')
        .select('*, prop_picks(*)')
        .eq('game_date', date);
        
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
   * Used by the admin panel at betwithgary.ai/admin/results
   * @param {number} resultId - ID of the result to update
   * @param {Object} updates - Updates to apply
   * @returns {Object} - Result of the update operation
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
  },
  
  /**
   * Manually check a single prop result
   * Useful for the admin panel
   * @param {number} propPickId - ID of the prop pick to check
   * @returns {Object} - Result of the check
   */
  checkSinglePropResult: async (propPickId) => {
    try {
      // 1. Get the prop pick from the database
      const { data: propPick, error: propPickError } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('id', propPickId)
        .single();
        
      if (propPickError) {
        throw new Error(`Error getting prop pick: ${propPickError.message}`);
      }
      
      if (!propPick || !propPick.picks || !Array.isArray(propPick.picks) || propPick.picks.length === 0) {
        return {
          success: false,
          message: `No prop pick found with ID ${propPickId}`,
          result: null
        };
      }
      
      // 2. Format the pick for the MLB Stats API
      const formattedProps = propPick.picks.map(pick => ({
        prop_pick_id: propPick.id,
        date: propPick.date,
        player: pick.player,
        team: pick.team,
        league: propPick.league || 'MLB',
        prop: pick.prop?.split(' ')?.[0] || pick.prop,
        line: pick.line || parseFloat(pick.prop?.split(' ')?.[1]) || 0,
        bet: pick.bet,
        odds: pick.odds,
        confidence: pick.confidence,
        matchup: propPick.matchup || null,
        pick_text: `${pick.player} ${pick.bet} ${pick.line || (pick.prop?.split(' ')?.[1] || '')} ${pick.prop?.split(' ')?.[0] || pick.prop}`
      }));
      
      // 3. Process with MLB Stats API
      const apiResults = await mlbStatsApiService.automateProps(formattedProps, propPick.date);
      if (!apiResults || apiResults.length === 0) {
        return {
          success: false,
          message: `Could not determine results for prop pick ${propPickId}`,
          result: null
        };
      }
      
      // 4. Format the result for storage
      const resultsToInsert = apiResults.map(apiResult => ({
        prop_pick_id: apiResult.prop_pick_id,
        game_date: propPick.date,
        player_name: apiResult.player,
        prop_type: apiResult.prop,
        line_value: apiResult.line,
        actual_value: apiResult.actual !== null ? apiResult.actual : null,
        result: apiResult.result,
        bet: apiResult.bet,
        odds: apiResult.odds || null,
        pick_text: apiResult.pick_text,
        matchup: apiResult.matchup || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
        // Removed player_id and game_id as they're not in the Supabase schema
      }));
      
      // 5. Check if we already have results for this pick
      const { data: existingResults, error: fetchError } = await supabase
        .from('prop_results')
        .select('*')
        .eq('prop_pick_id', propPickId);
        
      if (fetchError) {
        console.error('Error checking existing results:', fetchError);
        throw new Error(`Failed to check existing results: ${fetchError.message}`);
      }
      
      // 6. Insert or update results
      if (existingResults && existingResults.length > 0) {
        // Update existing results
        for (const result of resultsToInsert) {
          const matchingExisting = existingResults.find(e => 
            e.player_name === result.player_name && 
            e.prop_type === result.prop_type
          );
          
          if (matchingExisting) {
            const { error: updateError } = await supabase
              .from('prop_results')
              .update({
                ...result,
                updated_at: new Date().toISOString()
              })
              .eq('id', matchingExisting.id);
              
            if (updateError) {
              console.error('Error updating prop result:', updateError);
              throw new Error(`Failed to update prop result: ${updateError.message}`);
            }
          } else {
            // Insert as new
            const { error: insertError } = await supabase
              .from('prop_results')
              .insert([result]);
              
            if (insertError) {
              console.error('Error inserting prop result:', insertError);
              throw new Error(`Failed to insert prop result: ${insertError.message}`);
            }
          }
        }
        
        return {
          success: true,
          message: `Updated results for prop pick ${propPickId}`,
          results: resultsToInsert
        };
      } else {
        // Insert new results
        const { error: insertError } = await supabase
          .from('prop_results')
          .insert(resultsToInsert);
          
        if (insertError) {
          console.error('Error inserting prop results:', insertError);
          throw new Error(`Failed to store prop results: ${insertError.message}`);
        }
        
        return {
          success: true,
          message: `Recorded results for prop pick ${propPickId}`,
          results: resultsToInsert
        };
      }
    } catch (error) {
      console.error(`Error checking single prop result: ${error.message}`);
      return {
        success: false,
        message: `Error checking prop result: ${error.message}`,
        error: error.message
      };
    }
  }
};

// For missing stats, we recommend using the admin panel at https://www.betwithgary.ai/admin/results
export { propResultsService };