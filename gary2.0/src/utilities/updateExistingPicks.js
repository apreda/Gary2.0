import { supabase } from '../services/supabaseClient';
import format from 'date-fns/format';

/**
 * Utility function to update today's picks with homeTeam and awayTeam fields
 * This is a one-time fix for existing picks that were created before the schema update
 */
async function updateExistingPicks() {
  try {
    // Get today's date in the format stored in Supabase
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`Looking for picks for ${today}...`);
    
    // Fetch today's picks from Supabase
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today);
    
    if (error) {
      console.error('Error fetching picks:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('No picks found for today.');
      return;
    }
    
    console.log(`Found ${data.length} picks for today. Processing...`);
    
    // Process each pick to add homeTeam and awayTeam
    const updates = [];
    for (const record of data) {
      if (!record.picks || !Array.isArray(record.picks)) {
        console.log(`Skipping record ${record.id} - invalid picks data`);
        continue;
      }
      
      const updatedPicks = record.picks.map(pick => {
        // Skip if pick already has homeTeam and awayTeam
        if (pick.homeTeam && pick.awayTeam) {
          return pick;
        }
        
        // Try to extract team information from the pick string
        // Common patterns: "Yankees ML -148", "Cincinnati Reds ML -134", "Pittsburgh Pirates +1.5"
        let homeTeam = '';
        let awayTeam = '';
        
        // Extract team name from pick string
        const pickTeam = extractTeamFromPick(pick.pick);
        
        // Set it as home team by default
        if (pickTeam) {
          homeTeam = pickTeam;
          
          // Try to extract opponent from rationale if available
          if (pick.rationale) {
            const opposingTeam = extractOpponentFromRationale(pick.rationale, pickTeam);
            if (opposingTeam) {
              awayTeam = opposingTeam;
            }
          }
        }
        
        // Return updated pick with new fields
        return {
          ...pick,
          homeTeam,
          awayTeam
        };
      });
      
      // Add to updates array
      updates.push({
        id: record.id,
        picks: updatedPicks
      });
    }
    
    console.log(`Prepared ${updates.length} records for update`);
    
    // Update each record in Supabase
    for (const update of updates) {
      const { error } = await supabase
        .from('daily_picks')
        .update({ picks: update.picks })
        .eq('id', update.id);
      
      if (error) {
        console.error(`Error updating record ${update.id}:`, error);
      } else {
        console.log(`Successfully updated record ${update.id}`);
      }
    }
    
    console.log('Update process completed.');
  } catch (err) {
    console.error('Unexpected error during update:', err);
  }
}

/**
 * Helper function to extract team name from pick string
 * @param {string} pickString - The pick string (e.g., "Yankees ML -148")
 * @returns {string} - Extracted team name or empty string
 */
function extractTeamFromPick(pickString) {
  if (!pickString) return '';
  
  // Common pick formats:
  // "Yankees ML -148" -> Yankees
  // "Cincinnati Reds ML -134" -> Cincinnati Reds
  // "Pittsburgh Pirates +1.5" -> Pittsburgh Pirates
  // "Phillies -1.5" -> Phillies
  
  try {
    // Try to extract team name (everything before ML, +/- number)
    const match = pickString.match(/^(.*?)(?:\s+ML|\s+[+-]\d+|\s+-\d+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    
    return '';
  } catch (e) {
    console.error('Error extracting team from pick:', e);
    return '';
  }
}

/**
 * Helper function to attempt to extract opponent team from rationale
 * @param {string} rationale - The pick rationale text
 * @param {string} team - The team we already identified
 * @returns {string} - Extracted opposing team or empty string
 */
function extractOpponentFromRationale(rationale, team) {
  if (!rationale || !team) return '';
  
  try {
    // Common MLB teams to look for in rationale
    const mlbTeams = [
      'Angels', 'Astros', 'Athletics', 'Blue Jays', 'Braves', 'Brewers', 
      'Cardinals', 'Cubs', 'Diamondbacks', 'Dodgers', 'Giants', 'Guardians',
      'Indians', 'Mariners', 'Marlins', 'Mets', 'Nationals', 'Orioles',
      'Padres', 'Phillies', 'Pirates', 'Rangers', 'Rays', 'Red Sox', 
      'Reds', 'Rockies', 'Royals', 'Tigers', 'Twins', 'White Sox', 'Yankees'
    ];
    
    // Look for team names in the rationale that aren't the already identified team
    for (const mlbTeam of mlbTeams) {
      // Skip if it's the team we already found
      if (team.includes(mlbTeam)) continue;
      
      // Check if this team is mentioned in the rationale
      if (rationale.includes(mlbTeam)) {
        return mlbTeam;
      }
    }
    
    return '';
  } catch (e) {
    console.error('Error extracting opponent from rationale:', e);
    return '';
  }
}

// Make the function available to import and run
export default updateExistingPicks;
