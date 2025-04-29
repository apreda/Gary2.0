/**
 * Script to update Supabase picks with properly formatted data
 * DEPRECATED: This script is maintained for backward compatibility only.
 * 
 * NOTE: The updated Gary 2.0 system now preserves the exact OpenAI output format
 * including fields like league="MLB" (not "baseball_mlb") and time="10:05 PM ET"
 * This script should not be used on data generated after April 29, 2025.
 */
import { supabase, ensureAnonymousSession } from '../supabaseClient.js';

// Team abbreviation mapping for common teams
const teamAbbreviations = {
  'Los Angeles Lakers': 'LAL',
  'Minnesota Twins': 'MIN',
  'Chicago White Sox': 'CWS',
  'Washington Capitals': 'WSH',
  'Montréal Canadiens': 'MTL',
  'Manchester City': 'MCI',
  'Arsenal': 'ARS',
  'Crystal Palace': 'CRY',
  'Aston Villa': 'AVL',
  'Minnesota Timberwolves': 'MIN'
};

// Format shortPick to show "TEAM -ODDS" instead of verbose format
const formatShortPick = (pick) => {
  // If already correctly formatted, return as is
  if (pick.shortPick && (/^[A-Z]{2,3}\s[+-]\d+$/.test(pick.shortPick) || 
      /^[A-Z]{2,3}\sML\s[+-]\d+$/.test(pick.shortPick))) {
    return pick.shortPick;
  }
  
  // Extract team from verbose formats like "Bet on the Los Angeles Lakers to win."
  if (pick.betType === 'Moneyline' && pick.shortPick && pick.shortPick.includes('Bet on the')) {
    const teamMatch = pick.shortPick.match(/Bet on the ([\w\s]+) to win/i);
    if (teamMatch && teamMatch[1]) {
      const teamName = teamMatch[1];
      
      // Get abbreviation from mapping or create one from team name
      let abbreviation = teamAbbreviations[teamName];
      if (!abbreviation) {
        // Create abbreviation from team name (first letter of each word)
        abbreviation = teamName.split(' ').map(word => word[0]).join('');
      }
      
      // Get odds from moneyline field
      let odds = '';
      if (pick.moneyline && typeof pick.moneyline === 'string') {
        const oddsMatch = pick.moneyline.match(/[+-]\d+/);
        odds = oddsMatch ? oddsMatch[0] : '';
      }
      
      return `${abbreviation} ${odds || 'ML'}`;
    }
  }
  
  // For other types, return original
  return pick.shortPick;
};

// Update picks in Supabase to have correctly formatted shortPick
const updateSupabasePicks = async () => {
  try {
    await ensureAnonymousSession();
    
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Get current picks from Supabase
    const { data, error } = await supabase
      .from('daily_picks')
      .select('picks, date')
      .eq('date', today)
      .maybeSingle();
      
    if (error) {
      console.error('Error fetching picks:', error);
      return;
    }
    
    if (!data || !data.picks || !Array.isArray(data.picks)) {
      console.log('No picks found or invalid format');
      return;
    }
    
    // Check if we have new OpenAI format data - if so, preserve it exactly
    const hasNewFormat = data.picks.some(pick => 
      typeof pick.pick === 'string' && typeof pick.league === 'string' && 
      typeof pick.time === 'string' && typeof pick.confidence === 'number'
    );
    
    let updatedPicks;
    if (hasNewFormat) {
      console.log('Detected new OpenAI output format - preserving exact format');
      // Leave the picks unchanged to preserve exact OpenAI output format
      updatedPicks = data.picks;
    } else {
      // Only apply the old format transformations to legacy picks
      console.log('Found legacy pick format - updating shortPick format');
      updatedPicks = data.picks.map(pick => {
        // Add or update confidence with % if needed
        const confidence = pick.confidenceLevel 
          ? `${pick.confidenceLevel}%` 
          : (pick.confidence && !pick.confidence.includes('%') 
              ? `${pick.confidence}%` 
              : pick.confidence || '75%');
              
        return {
          ...pick,
          shortPick: formatShortPick(pick),
          confidence: confidence
        };
      });
    }
    
    console.log('Updated picks:', updatedPicks);
    
    // Update Supabase with formatted picks
    const { error: updateError } = await supabase
      .from('daily_picks')
      .update({ picks: updatedPicks })
      .eq('date', today);
      
    if (updateError) {
      console.error('Error updating picks:', updateError);
    } else {
      console.log('Successfully updated picks in Supabase!');
    }
    
  } catch (err) {
    console.error('Script error:', err);
  }
};

// Run the update function
updateSupabasePicks();
