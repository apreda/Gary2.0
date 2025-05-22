/**
 * Simple test for MLB Stats API integration
 */

// Use CommonJS require instead of ES modules to avoid potential issues
const { mlbStatsApiService } = require('./services/mlbStatsApiService.js');

async function testMLBStatsAPI() {
  try {
    console.log('===== TESTING MLB STATS API BASIC FUNCTIONALITY =====');
    
    // 1. Test getting games for today
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Getting MLB games for ${today}...`);
    
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today');
      return;
    }
    
    console.log(`✅ Found ${games.length} MLB games for today`);
    
    // 2. Test getting starting pitchers for the first game
    const game = games[0];
    console.log(`\nSelected game: ${game.teams?.home?.team?.name} vs ${game.teams?.away?.team?.name}`);
    console.log(`Game ID: ${game.gamePk}`);
    
    console.log('\nGetting starting pitchers...');
    const startingPitchers = await mlbStatsApiService.getStartingPitchers(game.gamePk);
    
    if (startingPitchers?.homeStarter) {
      console.log(`✅ Home starting pitcher: ${startingPitchers.homeStarter.fullName}`);
    } else {
      console.log('❌ No home starting pitcher found');
    }
    
    if (startingPitchers?.awayStarter) {
      console.log(`✅ Away starting pitcher: ${startingPitchers.awayStarter.fullName}`);
    } else {
      console.log('❌ No away starting pitcher found');
    }
    
    // 3. Test getting hitter stats
    console.log('\nGetting hitter stats...');
    const hitterStats = await mlbStatsApiService.getHitterStats(game.gamePk);
    
    console.log(`✅ Retrieved ${hitterStats.home.length} home team hitters and ${hitterStats.away.length} away team hitters`);
    
    if (hitterStats.home.length > 0) {
      const sampleHitter = hitterStats.home[0];
      console.log(`Sample home hitter: ${sampleHitter.name} (${sampleHitter.position})`);
      console.log(`Stats: AVG ${sampleHitter.stats.avg || '.000'}, Hits: ${sampleHitter.stats.hits || 0}`);
    }
    
    console.log('\n===== MLB STATS API TEST COMPLETE =====');
  } catch (error) {
    console.error('Error testing MLB Stats API:', error);
  }
}

// Run the test
testMLBStatsAPI();
