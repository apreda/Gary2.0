/**
 * Test script for MLB Stats API
 * Tests various functions to ensure proper error handling and data retrieval
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { getPitcherSeasonStatsFixed } from './services/mlbStatsApiFix.js';

// Helper for pretty formatting
const prettyPrint = (obj) => JSON.stringify(obj, null, 2);

// Get today's date in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

async function testMlbStatsApi() {
  console.log('='.repeat(80));
  console.log('MLB STATS API TEST SCRIPT');
  console.log('='.repeat(80));
  console.log(`Testing with date: ${today}\n`);

  try {
    // Test 1: Get today's games
    console.log('TEST 1: Get Today\'s Games');
    console.log('-'.repeat(50));
    const games = await mlbStatsApiService.getTodaysGames(today);
    console.log(`Found ${games.length} games scheduled for today`);
    if (games.length > 0) {
      console.log('Sample game:');
      console.log(prettyPrint(games[0]));
      
      // Store first game ID for subsequent tests
      const gameId = games[0].gameId;
      
      // Test 2: Get starting pitchers for a game
      console.log('\nTEST 2: Get Starting Pitchers');
      console.log('-'.repeat(50));
      console.log(`Testing for game ID: ${gameId}`);
      const pitchers = await mlbStatsApiService.getStartingPitchers(gameId);
      console.log('Starting pitchers result:');
      console.log(prettyPrint(pitchers));
      
      // Test 3: Get pitcher season stats
      if (pitchers.homeStarter?.id) {
        console.log('\nTEST 3: Get Pitcher Season Stats');
        console.log('-'.repeat(50));
        console.log(`Testing for pitcher: ${pitchers.homeStarter.fullName} (ID: ${pitchers.homeStarter.id})`);
        
        // Compare original function with fixed function
        console.log('ORIGINAL function:');
        const originalStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.homeStarter.id);
        console.log(prettyPrint(originalStats));
        
        console.log('\nFIXED function:');
        const fixedStats = await getPitcherSeasonStatsFixed(pitchers.homeStarter.id);
        console.log(prettyPrint(fixedStats));
      }
      
      // Test 4: Get hitter stats for a game
      console.log('\nTEST 4: Get Hitter Stats');
      console.log('-'.repeat(50));
      console.log(`Testing for game ID: ${gameId}`);
      const hitterStats = await mlbStatsApiService.getHitterStats(gameId);
      console.log(`Found ${hitterStats.home.length} home team hitters and ${hitterStats.away.length} away team hitters`);
      if (hitterStats.home.length > 0) {
        console.log('Sample home hitter:');
        console.log(prettyPrint(hitterStats.home[0]));
      }
    } else {
      console.log('No games found for today, cannot proceed with game-specific tests');
    }
    
    // Test 5: Test comprehensive picks generation data
    console.log('\nTEST 6: Get Picks Generation Data');
    console.log('-'.repeat(50));
    console.log('Using fixed getPicksGenerationData function');
    const picksData = await mlbStatsApiService.getPicksGenerationData(today);
    console.log(`Retrieved data with ${picksData.games.length} games and ${picksData.injuries.length} injuries`);
    if (picksData.games.length > 0) {
      const sampleGame = picksData.games[0];
      console.log('Sample game with pitchers:');
      console.log(`Matchup: ${sampleGame.matchup}`);
      console.log(`Home pitcher: ${sampleGame.pitchers?.home?.fullName || 'Not available'}`);
      console.log(`Away pitcher: ${sampleGame.pitchers?.away?.fullName || 'Not available'}`);
    }
    
    console.log('\nALL TESTS COMPLETED SUCCESSFULLY');
  } catch (error) {
    console.error('TEST FAILURE:', error);
    console.error(error.stack);
  }
}

// Run the test script
testMlbStatsApi().catch(err => {
  console.error('Unhandled error in test script:', err);
  console.error(err.stack);
});
