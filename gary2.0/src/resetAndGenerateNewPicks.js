// resetAndGenerateNewPicks.js - Complete reset and new picks generation
import { clearTodaysPicks } from './utilities/clearTodaysPicks';
import { picksService } from './services/picksService';
import { schedulerService } from './services/schedulerService';
import { supabase } from './supabaseClient';

/**
 * Reset picks and generate new ones
 * This function:
 * 1. Clears today's picks from Supabase
 * 2. Clears localStorage cache
 * 3. Generates brand new picks
 * 4. Stores them in Supabase
 */
async function resetAndGenerateNewPicks() {
  console.log('🔄 Starting complete picks reset and regeneration...');
  
  try {
    // Step 1: Clear today's picks from Supabase
    console.log('Step 1: Clearing today\'s picks from Supabase...');
    const clearResult = await clearTodaysPicks();
    
    if (clearResult) {
      console.log('✅ Successfully cleared today\'s picks from Supabase');
    } else {
      console.warn('⚠️ Issue clearing picks from Supabase, proceeding anyway...');
    }
    
    // Step 2: Clear localStorage cache
    console.log('Step 2: Clearing localStorage cache...');
    localStorage.removeItem('lastPicksGenerationTime');
    localStorage.removeItem('dailyPicks');
    console.log('✅ Successfully cleared localStorage cache');
    
    // Step 3: Generate brand new picks
    console.log('Step 3: Generating brand new picks...');
    const newPicks = await picksService.generateDailyPicks();
    console.log(`✅ Successfully generated ${newPicks.length} new picks`);
    
    // Step 4: Update localStorage and mark as generated
    localStorage.setItem('dailyPicks', JSON.stringify(newPicks));
    schedulerService.markPicksAsGenerated();
    console.log('✅ Updated localStorage with new picks');
    
    // Step 5: Verify picks were stored in Supabase
    console.log('Step 5: Verifying picks were stored in Supabase...');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .single();
      
    if (error) {
      console.error('❌ Error verifying picks in Supabase:', error);
    } else if (data && data.picks && Array.isArray(data.picks)) {
      console.log(`✅ Verified ${data.picks.length} picks are stored in Supabase`);
      
      // Log MLB picks specifically to verify formatting
      const mlbPicks = data.picks.filter(p => p.league === 'MLB' && p.betType.includes('Moneyline'));
      if (mlbPicks.length > 0) {
        console.log('📊 MLB Moneyline Pick Examples:');
        mlbPicks.forEach(pick => {
          console.log(`   - ${pick.shortGame}: ${pick.shortPick}`);
        });
      }
    }
    
    console.log('🎉 Reset and regeneration process complete!');
    console.log('New picks have been generated and stored in Supabase.');
    return true;
    
  } catch (error) {
    console.error('❌ Error in reset and regeneration process:', error);
    return false;
  }
}

// Execute the reset process
resetAndGenerateNewPicks();

export { resetAndGenerateNewPicks };
