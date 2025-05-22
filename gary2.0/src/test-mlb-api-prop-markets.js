/**
 * Test MLB Stats API and Prop Markets
 * Uses ES module syntax as required by the project
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { propOddsService } from './services/propOddsService.js';

// Test MLB Stats API functionality
async function testMLBStatsAPI() {
  try {
    console.log('===== TESTING MLB STATS API FUNCTIONALITY =====');
    
    // Get today's date
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Testing for date: ${today}`);
    
    // Get games for today
    console.log('\nGetting MLB games for today:');
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today');
      return false;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // Select the first game for testing
    const game = games[0];
    console.log(`Selected game: ${game.teams?.home?.team?.name} vs ${game.teams?.away?.team?.name}, Game ID: ${game.gamePk}`);
    
    // Test getting starting pitchers
    console.log('\nGetting starting pitchers:');
    const startingPitchers = await mlbStatsApiService.getStartingPitchers(game.gamePk);
    
    if (startingPitchers?.homeStarter) {
      console.log(`Home starter: ${startingPitchers.homeStarter.fullName} (ID: ${startingPitchers.homeStarter.id})`);
      
      // Get pitcher stats
      const homeStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.homeStarter.id);
      console.log(`Home pitcher stats: ERA ${homeStats.era}, ${homeStats.wins}W-${homeStats.losses}L, ${homeStats.inningsPitched} IP`);
    } else {
      console.log('No home starting pitcher found');
    }
    
    if (startingPitchers?.awayStarter) {
      console.log(`Away starter: ${startingPitchers.awayStarter.fullName} (ID: ${startingPitchers.awayStarter.id})`);
      
      // Get pitcher stats
      const awayStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.awayStarter.id);
      console.log(`Away pitcher stats: ERA ${awayStats.era}, ${awayStats.wins}W-${awayStats.losses}L, ${awayStats.inningsPitched} IP`);
    } else {
      console.log('No away starting pitcher found');
    }
    
    // Test getting hitter stats
    console.log('\nGetting hitter stats:');
    const hitterStats = await mlbStatsApiService.getHitterStats(game.gamePk);
    
    console.log(`Retrieved ${hitterStats.home.length} home team hitters and ${hitterStats.away.length} away team hitters`);
    
    // Show sample hitter data
    if (hitterStats.home.length > 0) {
      const sampleHitter = hitterStats.home[0];
      console.log(`Sample home hitter: ${sampleHitter.name} (${sampleHitter.position})`);
      console.log(`Stats: AVG ${sampleHitter.stats.avg}, ${sampleHitter.stats.hits} H, ${sampleHitter.stats.homeRuns} HR, ${sampleHitter.stats.rbi} RBI`);
    }
    
    console.log('\n===== MLB STATS API TESTING COMPLETE =====');
    return true;
  } catch (error) {
    console.error('Error testing MLB Stats API:', error);
    return false;
  }
}

// Test problematic prop markets
async function testPropMarkets() {
  try {
    console.log('\n===== TESTING PROP MARKETS =====');
    
    // Define the problematic markets
    const problematicMarkets = ['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'];
    
    // Get a game to test with
    const sport = 'baseball_mlb';
    const homeTeam = 'Yankees'; // Example - you can change this
    const awayTeam = 'Red Sox';  // Example - you can change this
    
    console.log(`Testing prop markets for ${homeTeam} vs ${awayTeam}`);
    
    // Get the prop odds data
    console.log('\nGetting player prop odds:');
    const propOdds = await propOddsService.getPlayerPropOdds(sport, homeTeam, awayTeam);
    
    if (!propOdds || propOdds.length === 0) {
      console.log('No prop odds data found');
      return;
    }
    
    console.log(`Retrieved ${propOdds.length} prop odds entries`);
    
    // Analyze the prop data
    const propsByType = {};
    
    for (const prop of propOdds) {
      if (!propsByType[prop.prop_type]) {
        propsByType[prop.prop_type] = [];
      }
      propsByType[prop.prop_type].push(prop);
    }
    
    console.log('\nProp types found:');
    Object.keys(propsByType).forEach(type => {
      console.log(`- ${type}: ${propsByType[type].length} props`);
    });
    
    // Check specifically for the problematic markets
    console.log('\nChecking problematic markets:');
    problematicMarkets.forEach(market => {
      // Remove batter_/pitcher_ prefix to match the standardized prop_type in our data
      const standardizedMarket = market
        .replace('batter_', '')
        .replace('pitcher_', '');
      
      if (propsByType[standardizedMarket]) {
        console.log(`✅ ${market} (as ${standardizedMarket}): ${propsByType[standardizedMarket].length} props found`);
        
        // Show a sample
        if (propsByType[standardizedMarket].length > 0) {
          const sample = propsByType[standardizedMarket][0];
          console.log(`  Sample: ${sample.player}, line: ${sample.line}, odds: ${sample.side === 'OVER' ? sample.over_odds : sample.under_odds}`);
        }
      } else {
        console.log(`❌ ${market} (as ${standardizedMarket}): Not found in processed data`);
      }
    });
    
    console.log('\nInvestigating potential issues:');
    console.log('1. Check if these markets exist in the raw API data');
    console.log('2. Check if these markets are being filtered out by the odds threshold (-150)');
    console.log('3. Check the standardizePropType function to ensure it\'s correctly mapping the prop types');
    
    console.log('\n===== PROP MARKETS TESTING COMPLETE =====');
  } catch (error) {
    console.error('Error testing prop markets:', error);
  }
}

// Run the tests
async function runTests() {
  const mlbStatsApiWorking = await testMLBStatsAPI();
  
  if (mlbStatsApiWorking) {
    await testPropMarkets();
  } else {
    console.log('\nSkipping prop markets test since MLB Stats API test failed');
  }
}

runTests();
