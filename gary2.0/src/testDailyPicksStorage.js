import { picksService } from './services/picksService.js';

/**
 * Test script to verify the fixed daily_picks storage functionality
 */
const testDailyPicksStorage = async () => {
  console.log('TESTING DAILY PICKS STORAGE');
  console.log('==========================');
  
  try {
    // Create test picks data
    const testPicks = [
      {
        id: `test-storage-${Date.now()}`,
        league: 'NBA',
        game: 'Boston Celtics vs Miami Heat',
        betType: 'Moneyline',
        moneyline: 'Boston Celtics',
        odds: '-180',
        confidenceLevel: 'High',
        shortPick: 'BOS ML -180',
        result: 'pending'
      }
    ];
    
    console.log(`Created ${testPicks.length} test picks`);
    
    // Store picks in database using our fixed function
    console.log('Storing picks in Supabase daily_picks table...');
    const result = await picksService.storeDailyPicksInDatabase(testPicks);
    
    console.log('Storage operation completed with result:', result);
    
    // Verify by retrieving the picks
    console.log('Retrieving picks to verify storage...');
    const retrievedPicks = await picksService.getPendingPicks();
    
    if (retrievedPicks && retrievedPicks.length > 0) {
      console.log(`✅ SUCCESS: Retrieved ${retrievedPicks.length} picks from database`);
      console.log('First pick:', JSON.stringify(retrievedPicks[0], null, 2));
      return true;
    } else {
      console.error('❌ FAILURE: Could not retrieve picks after storage');
      return false;
    }
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    return false;
  }
};

// Run the test
testDailyPicksStorage()
  .then(success => {
    console.log(`\nTest result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
