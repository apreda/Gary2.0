import { storeDailyPicks } from './supabaseClient.js';

/**
 * Final test to verify the fixed Supabase storage solution
 */
const testFixedStorage = async () => {
  console.log('TESTING FIXED SUPABASE STORAGE');
  console.log('=============================');
  
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    console.log(`Using date: ${dateString}`);
    
    // Create simple test picks
    const testPicks = [
      {
        id: `test-${Date.now()}`,
        league: 'NBA',
        game: 'Boston Celtics vs Miami Heat',
        betType: 'Moneyline',
        moneyline: 'Boston Celtics',
        odds: '-180',
        confidenceLevel: 'High',
        wagerAmount: 250,
        shortPick: 'BOS ML -180',
        result: 'pending'
      }
    ];
    
    console.log('Storing test picks using specialized function...');
    const result = await storeDailyPicks(dateString, testPicks);
    
    if (result.success) {
      console.log('✅ SUCCESS: Picks stored successfully in daily_picks table');
      return true;
    } else {
      console.error('❌ FAILURE: Could not store picks', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
    return false;
  }
};

// Run the test
testFixedStorage()
  .then(success => {
    console.log(`\nTest outcome: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
