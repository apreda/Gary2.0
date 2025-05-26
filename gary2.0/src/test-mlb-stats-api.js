/**
 * Test MLB Stats API to verify it's working correctly
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.enhanced.js';
import { ballDontLieService } from './services/ballDontLieService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testMLBStatsAPI() {
  console.log('⚾ TESTING MLB STATS API ⚾');
  console.log('---------------------------\n');

  try {
    // Test 1: Get today's games
    console.log('1. Testing getTodaysGames...');
    const games = await mlbStatsApiService.getTodaysGames();
    console.log(`Found ${games.length} games today`);
    
    if (games.length > 0) {
      const firstGame = games[0];
      console.log(`First game: ${firstGame.awayTeam} @ ${firstGame.homeTeam} (ID: ${firstGame.gameId})`);
      
      // Test 2: Get hitter stats for the first game
      console.log('\n2. Testing getHitterStats...');
      const hitterStats = await mlbStatsApiService.getHitterStats(firstGame.gameId);
      
      console.log(`Home team hitters: ${hitterStats.home.length}`);
      console.log(`Away team hitters: ${hitterStats.away.length}`);
      
      // Check if stats are all zeros
      if (hitterStats.home.length > 0) {
        const firstHomeHitter = hitterStats.home[0];
        console.log('\nFirst home hitter:', JSON.stringify(firstHomeHitter, null, 2));
        
        // Check if all stats are zero
        const hasNonZeroStats = Object.values(firstHomeHitter.stats).some(stat => 
          stat !== 0 && stat !== '0' && stat !== '.000'
        );
        
        if (!hasNonZeroStats) {
          console.log('⚠️  WARNING: All stats are zero! This might be a pre-game or the API is not returning actual stats.');
        }
      }
      
      // Test 3: Get team roster with stats
      console.log('\n3. Testing getTeamRosterWithStats...');
      const teamId = 116; // Detroit Tigers ID
      const rosterStats = await mlbStatsApiService.getTeamRosterWithStats(teamId);
      
      if (rosterStats && rosterStats.hitters.length > 0) {
        console.log(`Found ${rosterStats.hitters.length} hitters in roster`);
        const firstRosterHitter = rosterStats.hitters[0];
        console.log('\nFirst roster hitter:', JSON.stringify(firstRosterHitter, null, 2));
      }
      
      // Test 4: Test Ball Don't Lie as fallback
      console.log('\n4. Testing Ball Don\'t Lie API as fallback...');
      const mlbStats = await ballDontLieService.getComprehensiveMlbGameStats('Detroit Tigers', 'San Francisco Giants');
      console.log('Ball Don\'t Lie response:', JSON.stringify(mlbStats, null, 2).substring(0, 500) + '...');
      
    } else {
      console.log('No games found for today. The season might be over or no games scheduled.');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testMLBStatsAPI().then(() => {
  console.log('\n✅ Test completed');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
