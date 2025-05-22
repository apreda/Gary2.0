/**
 * Test MLB Stats API Season Statistics Retrieval
 * This script focuses on getting player season statistics needed for prop picks
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';

async function testMLBSeasonStats() {
  try {
    console.log('===== TESTING MLB SEASON STATISTICS RETRIEVAL =====');
    
    // 1. Test getting games for today (just to identify players)
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Getting MLB games for ${today}...`);
    
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today');
      // Let's use some known player IDs as fallback
      testWithKnownPlayers();
      return;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // Choose the first game for testing
    const game = games[0];
    console.log(`Selected game: ${game.teams?.home?.team?.name} vs ${game.teams?.away?.team?.name}`);
    
    // 2. Test getting starting pitchers to get their player IDs
    console.log('\nGetting starting pitchers...');
    const startingPitchers = await mlbStatsApiService.getStartingPitchers(game.gamePk);
    
    // 3. Test getting pitcher season stats
    if (startingPitchers?.homeStarter) {
      const homeStarterId = startingPitchers.homeStarter.id;
      console.log(`\nGetting season stats for home pitcher: ${startingPitchers.homeStarter.fullName} (ID: ${homeStarterId})`);
      
      const homeStats = await mlbStatsApiService.getPitcherSeasonStats(homeStarterId);
      console.log('Home pitcher season stats:');
      console.log(homeStats);
    }
    
    if (startingPitchers?.awayStarter) {
      const awayStarterId = startingPitchers.awayStarter.id;
      console.log(`\nGetting season stats for away pitcher: ${startingPitchers.awayStarter.fullName} (ID: ${awayStarterId})`);
      
      const awayStats = await mlbStatsApiService.getPitcherSeasonStats(awayStarterId);
      console.log('Away pitcher season stats:');
      console.log(awayStats);
    }
    
    // 4. Test player ID lookup and hitter season stats
    const playerNames = [
      'Aaron Judge',
      'Juan Soto',
      'Shohei Ohtani',
      'Mike Trout'
    ];
    
    console.log('\nTesting player ID lookup and hitter stats...');
    
    for (const playerName of playerNames) {
      console.log(`\nLooking up player ID for: ${playerName}`);
      const playerId = await mlbStatsApiService.getPlayerId(playerName);
      
      if (!playerId) {
        console.log(`Could not find player ID for ${playerName}`);
        continue;
      }
      
      console.log(`Found player ID: ${playerId}`);
      
      // Get player season stats
      console.log(`Getting season stats for ${playerName}...`);
      
      try {
        // Use the same endpoint as pitcher stats but request batting group
        const response = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=batting&season=${new Date().getFullYear()}&sportId=1`);
        
        if (!response.ok) {
          console.log(`Error getting stats for ${playerName}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data && data.stats && data.stats.length > 0 && data.stats[0].splits && data.stats[0].splits.length > 0) {
          const stats = data.stats[0].splits[0].stat;
          console.log(`Season stats for ${playerName}:`);
          console.log({
            avg: stats.avg || '.000',
            hits: stats.hits || 0,
            homeRuns: stats.homeRuns || 0,
            rbi: stats.rbi || 0,
            runs: stats.runs || 0,
            strikeouts: stats.strikeOuts || 0,
            walks: stats.baseOnBalls || 0,
            atBats: stats.atBats || 0,
            obp: stats.obp || '.000',
            slg: stats.slg || '.000',
            ops: stats.ops || '.000'
          });
        } else {
          console.log(`No stats found for ${playerName}`);
        }
      } catch (error) {
        console.error(`Error retrieving stats for ${playerName}:`, error.message);
      }
    }
    
    console.log('\n===== MLB SEASON STATISTICS TEST COMPLETE =====');
    
  } catch (error) {
    console.error('Error testing MLB season stats:', error);
  }
}

// Test with known player IDs if no games are found
async function testWithKnownPlayers() {
  // Aaron Judge ID
  const judgeId = 592450;
  // Gerrit Cole ID
  const coleId = 543037;
  
  console.log('\nTesting with known player IDs since no games were found today');
  
  // Test pitcher stats
  console.log(`\nGetting season stats for Gerrit Cole (ID: ${coleId})`);
  const pitcherStats = await mlbStatsApiService.getPitcherSeasonStats(coleId);
  console.log('Pitcher season stats:');
  console.log(pitcherStats);
  
  // Test hitter stats (using direct API call since we don't have a dedicated function for this)
  console.log(`\nGetting season stats for Aaron Judge (ID: ${judgeId})`);
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/people/${judgeId}/stats?stats=season&group=batting&season=${new Date().getFullYear()}&sportId=1`);
    
    if (!response.ok) {
      console.log(`Error getting stats for Aaron Judge: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    
    if (data && data.stats && data.stats.length > 0 && data.stats[0].splits && data.stats[0].splits.length > 0) {
      const stats = data.stats[0].splits[0].stat;
      console.log('Season stats for Aaron Judge:');
      console.log({
        avg: stats.avg || '.000',
        hits: stats.hits || 0,
        homeRuns: stats.homeRuns || 0,
        rbi: stats.rbi || 0,
        runs: stats.runs || 0,
        strikeouts: stats.strikeOuts || 0,
        walks: stats.baseOnBalls || 0,
        atBats: stats.atBats || 0,
        obp: stats.obp || '.000',
        slg: stats.slg || '.000',
        ops: stats.ops || '.000'
      });
    } else {
      console.log('No stats found for Aaron Judge');
    }
  } catch (error) {
    console.error('Error retrieving stats for Aaron Judge:', error.message);
  }
}

// Run the test
testMLBSeasonStats();
