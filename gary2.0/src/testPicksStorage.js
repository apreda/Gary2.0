import { getPendingPicks, storeDailyPicksInDatabase } from './services/picksService.js';

// Simple test function to check if picks storage is working
const testPicksStorage = async () => {
  console.log('TESTING PICKS STORAGE FUNCTIONALITY');
  console.log('===================================');
  
  try {
    // Create a simple test pick
    const testPicks = [
      {
        id: `test-${Date.now()}`,
        league: 'NBA',
        game: 'Denver Nuggets vs Dallas Mavericks',
        betType: 'Moneyline',
        moneyline: 'Denver Nuggets',
        odds: '-125',
        confidenceLevel: 'High',
        wagerAmount: 300,
        shortPick: 'DEN ML -125',
        result: 'pending'
      }
    ];
    
    // Store picks directly in the database
    console.log('Attempting to store test picks in Supabase...');
    const result = await storeDailyPicksInDatabase(testPicks);
    
    console.log('Storage result:', result ? 'SUCCESS' : 'FAILED');
    
    // Attempt to retrieve picks to verify they were stored
    console.log('Verifying picks were stored by retrieving them...');
    const storedPicks = await getPendingPicks();
    
    if (storedPicks && storedPicks.length > 0) {
      console.log('VERIFICATION SUCCESS: Retrieved', storedPicks.length, 'picks from database');
      console.log('Sample pick:', JSON.stringify(storedPicks[0], null, 2));
    } else {
      console.log('VERIFICATION FAILED: No picks found in database after storage attempt');
    }
    
    return result ? true : false;
  } catch (error) {
    console.error('TEST FAILED with error:', error);
    return false;
  }
};

// Run the test
testPicksStorage()
  .then(result => {
    console.log(`\nTest result: ${result ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected test error:', err);
    process.exit(1);
  });
