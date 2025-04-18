import { storeDailyPicks } from './supabaseClient.js';

/**
 * Final test for the direct API implementation of daily picks storage
 */
const testFinalStorage = async () => {
  console.log('TESTING DIRECT API STORAGE SOLUTION');
  console.log('==================================');
  
  try {
    // Generate today's date string
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    console.log(`Test date: ${dateString}`);
    
    // Create test picks with minimal data
    const testPicks = [
      {
        id: `api-test-${Date.now()}`,
        league: 'NBA',
        game: 'Golden State Warriors vs Los Angeles Lakers',
        betType: 'Moneyline',
        moneyline: 'Golden State Warriors',
        odds: '+120',
        confidenceLevel: 'Medium',
        result: 'pending'
      }
    ];
    
    console.log(`Created ${testPicks.length} test picks`);
    
    // Use our direct API implementation
    console.log('Storing picks using direct API implementation...');
    const result = await storeDailyPicks(dateString, testPicks);
    
    console.log('Storage result:', result);
    
    if (result.success) {
      console.log('✅ SUCCESS: Picks stored successfully using direct API');
      return true;
    } else {
      console.error('❌ FAILURE: Direct API storage failed', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    return false;
  }
};

// Run the test
testFinalStorage()
  .then(success => {
    console.log(`\nFinal result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
