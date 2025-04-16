// Force formatting fix for all cards
import { picksService } from '../services/picksService';
import { supabase, ensureAnonymousSession } from '../supabaseClient';

/**
 * Utility to fix the formatting of all pick cards
 * This will retrieve all picks from Supabase, reformat them, and save them back
 */
async function fixCardFormatting() {
  try {
    console.log('Starting to fix card formatting...');
    
    // Ensure we're logged in to Supabase
    await ensureAnonymousSession();
    
    // Get today's date
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    
    // First delete any existing entries to prevent duplicates
    console.log('Deleting all entries for today...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
      
    if (deleteError) {
      console.error('Error deleting entries:', deleteError);
    } else {
      console.log('Successfully deleted all entries for today');
    }
    
    // Generate entirely new picks with proper formatting
    console.log('Generating new picks with correct formatting...');
    
    // Directly apply formatting for MLB cards - direct fix
    const overrideMlbFormatting = (picks) => {
      return picks.map(pick => {
        // Create a deep copy to avoid modifying the original
        const newPick = { ...pick };
        
        if (newPick.league === 'MLB') {
          console.log('Fixing MLB formatting for pick:', newPick.id);
          
          // Force correct formatting based on bet type
          if (newPick.betType && newPick.betType.includes('Moneyline') && newPick.moneyline) {
            const odds = newPick.odds || newPick.moneylineOdds || '';
            newPick.shortPick = `${picksService.abbreviateTeamName(newPick.moneyline)} ML ${odds}`.trim();
            console.log('MLB Moneyline reformatted to:', newPick.shortPick);
          }
          else if (newPick.betType && newPick.betType.includes('Spread') && newPick.spread) {
            const parts = newPick.spread.split(' ');
            const teamName = parts.slice(0, parts.length - 1).join(' ');
            const number = parts[parts.length - 1];
            newPick.shortPick = `${picksService.abbreviateTeamName(teamName)} ${number}`;
            console.log('MLB Spread reformatted to:', newPick.shortPick);
          }
          else if (newPick.betType && newPick.betType.includes('Total') && newPick.overUnder) {
            const parts = newPick.overUnder.split(' ');
            const overUnderType = parts[0].toUpperCase();
            const total = parts[parts.length - 1];
            newPick.shortPick = `${overUnderType} ${total}`;
            console.log('MLB Total reformatted to:', newPick.shortPick);
          }
        }
        
        return newPick;
      });
    };
    
    // Fetch existing picks first (if any)
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .limit(1);
      
    if (error) {
      console.error('Error fetching picks:', error);
    } else if (data && data.length > 0 && data[0].picks) {
      console.log('Found existing picks, applying formatting fixes...');
      
      // Apply formatting fixes directly
      const fixedPicks = overrideMlbFormatting(data[0].picks);
      
      // Create a new entry with the fixed picks
      const { error: insertError } = await supabase
        .from('daily_picks')
        .insert([
          {
            date: dateString,
            picks: fixedPicks,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
        
      if (insertError) {
        console.error('Error saving fixed picks:', insertError);
      } else {
        console.log('Successfully saved fixed picks!');
      }
    } else {
      console.log('No existing picks found to fix');
    }
    
    console.log('Formatting fix completed!');
    return true;
  } catch (error) {
    console.error('Error fixing card formatting:', error);
    return false;
  }
}

// Auto-execute
fixCardFormatting()
  .then(success => {
    if (success) {
      console.log('✅ FORMATTING FIX COMPLETE: Please refresh the app to see changes');
    } else {
      console.log('❌ FORMATTING FIX FAILED');
    }
  })
  .catch(err => {
    console.error('Script execution failed:', err);
  });

export default fixCardFormatting;
