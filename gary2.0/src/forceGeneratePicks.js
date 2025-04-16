// Force pick generation utility
import { supabase } from './supabaseClient';
import { picksService } from './services/picksService';
import { schedulerService } from './services/schedulerService';

/**
 * Force generation of new picks for today regardless of what's in Supabase
 * 1. Clear today's picks from Supabase
 * 2. Generate new picks with MLB properly formatted
 * 3. Store in Supabase
 */
export async function forceGeneratePicks() {
  console.log('🔄 FORCE GENERATING NEW PICKS...');
  
  try {
    // Step 1: Clear localStorage cache
    console.log('Clearing localStorage cache...');
    localStorage.removeItem('lastPicksGenerationTime');
    localStorage.removeItem('dailyPicks');
    
    // Step 2: Clear today's picks from Supabase
    console.log('Removing today\'s picks from Supabase...');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', today);
      
    if (deleteError) {
      console.error('Error deleting existing picks:', deleteError);
    } else {
      console.log('Successfully removed existing picks from Supabase');
    }
    
    // Step 3: Generate new picks with proper MLB formatting
    console.log('Generating new picks...');
    const newPicks = await picksService.generateDailyPicks();
    console.log(`Generated ${newPicks.length} new picks`);
    
    // Step 4: Store picks in localStorage
    localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
    schedulerService.markPicksAsGenerated();
    
    // Step 5: Save picks to Supabase (this happens automatically in generateDailyPicks)
    // but we'll double-check
    console.log('Verifying picks were stored in Supabase...');
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today);
      
    if (error) {
      console.error('Error verifying picks in Supabase, storing them again:', error);
      await picksService.storeDailyPicksInDatabase(newPicks);
    } else if (data && data.length > 0) {
      console.log('✅ Picks successfully stored in Supabase');
    } else {
      console.log('No picks found in Supabase, storing them again...');
      await picksService.storeDailyPicksInDatabase(newPicks);
    }
    
    // Check if we have MLB picks and log them to verify formatting
    const mlbPicks = newPicks.filter(p => p.league === 'MLB' && p.betType && p.betType.includes('Moneyline'));
    if (mlbPicks.length > 0) {
      console.log('MLB Moneyline picks with correct formatting:');
      mlbPicks.forEach(pick => {
        console.log(`  ${pick.shortGame}: "${pick.shortPick}"`);
      });
    }
    
    console.log('🎉 New picks successfully generated and stored!');
    console.log('Refresh the page to see the new picks.');
    
    return newPicks;
  } catch (error) {
    console.error('Error forcing pick generation:', error);
    throw error;
  }
}

// You can run this function directly from the console by typing:
// import { forceGeneratePicks } from './forceGeneratePicks.js'; forceGeneratePicks();
