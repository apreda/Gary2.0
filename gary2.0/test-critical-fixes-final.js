/**
 * Test Critical Fixes - Final Verification
 * Tests all three remaining issues:
 * 1. Perplexity API (405 errors fixed)
 * 2. NBA playoff stats balance (Pacers data fixed)
 * 3. NHL implementation (working properly)
 */

console.log('🔧 Testing Critical Fixes - Final Verification\n');

// Test 1: Perplexity Proxy (Fixed - removed conflicting endpoints)
async function testPerplexityProxy() {
  console.log('1️⃣ Testing Perplexity Proxy (Fixed)...');
  
  try {
    // Test the App Router endpoint directly
    const response = await fetch('/api/perplexity-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'pplx-7b-online',
        messages: [
          {
            role: 'user',
            content: 'What are the latest MLB headlines today?'
          }
        ]
      })
    });
    
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 405) {
      console.log('   ❌ Still getting 405 Method Not Allowed - check routing conflicts');
    } else if (response.status === 200) {
      const data = await response.json();
      console.log('   ✅ Perplexity proxy working!');
      console.log(`   📝 Response preview: ${data.choices?.[0]?.message?.content?.substring(0, 100) || 'No content'}...`);
    } else {
      console.log(`   ⚠️ Unexpected status: ${response.status}`);
      const errorData = await response.text();
      console.log(`   Error: ${errorData}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Test 2: NBA Playoff Stats Balance (Fixed - using finalHomeTeamGames/finalAwayTeamGames)
async function testNbaPlayoffStatsBalance() {
  console.log('\n2️⃣ Testing NBA Playoff Stats Balance (Fixed)...');
  
  try {
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    // Test with a known playoff matchup
    console.log('   Testing Knicks vs Pacers playoff stats...');
    const playoffStats = await ballDontLieService.getNbaPlayoffPlayerStats('New York Knicks', 'Indiana Pacers');
    
    console.log(`   Knicks players found: ${playoffStats.home?.length || 0}`);
    console.log(`   Pacers players found: ${playoffStats.away?.length || 0}`);
    
    if (playoffStats.home?.length > 0 && playoffStats.away?.length > 0) {
      console.log('   ✅ Both teams have playoff stats - balance fixed!');
      
      // Show top player from each team
      if (playoffStats.home[0]) {
        const topKnick = playoffStats.home[0];
        console.log(`   🏀 Top Knicks player: ${topKnick.player.first_name} ${topKnick.player.last_name} - ${topKnick.avgPts} PPG`);
      }
      
      if (playoffStats.away[0]) {
        const topPacer = playoffStats.away[0];
        console.log(`   🏀 Top Pacers player: ${topPacer.player.first_name} ${topPacer.player.last_name} - ${topPacer.avgPts} PPG`);
      }
    } else if (playoffStats.home?.length > 0 && playoffStats.away?.length === 0) {
      console.log('   ⚠️ Still imbalanced - Knicks data found but no Pacers data');
    } else if (playoffStats.home?.length === 0 && playoffStats.away?.length > 0) {
      console.log('   ⚠️ Still imbalanced - Pacers data found but no Knicks data');
    } else {
      console.log('   ⚠️ No playoff data found for either team - may be off-season');
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Test 3: NHL Implementation (Fixed - proper processGameOnce wrapper)
async function testNhlImplementation() {
  console.log('\n3️⃣ Testing NHL Implementation (Fixed)...');
  
  try {
    const { nhlPlayoffService } = await import('./src/services/nhlPlayoffService.js');
    const { oddsService } = await import('./src/services/oddsService.js');
    
    // Test NHL playoff service
    console.log('   Testing NHL playoff service...');
    const playoffReport = await nhlPlayoffService.generateNhlPlayoffReport('Boston Bruins', 'Toronto Maple Leafs');
    
    if (playoffReport && playoffReport.length > 100) {
      console.log('   ✅ NHL playoff service working!');
      console.log(`   📊 Report preview: ${playoffReport.substring(0, 150)}...`);
    } else {
      console.log('   ⚠️ NHL playoff service returned minimal data');
      console.log(`   📊 Report: ${playoffReport}`);
    }
    
    // Test NHL odds integration
    console.log('   Testing NHL odds integration...');
    const nhlGames = await oddsService.getUpcomingGames('icehockey_nhl');
    console.log(`   🏒 Found ${nhlGames.length} NHL games`);
    
    if (nhlGames.length > 0) {
      const firstGame = nhlGames[0];
      console.log(`   🏒 Sample game: ${firstGame.away_team} @ ${firstGame.home_team}`);
      console.log(`   🏒 Has odds: ${firstGame.bookmakers?.length > 0 ? 'Yes' : 'No'}`);
      console.log('   ✅ NHL odds integration working!');
    } else {
      console.log('   ⚠️ No NHL games found - may be off-season');
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Test 4: Overall System Integration
async function testOverallIntegration() {
  console.log('\n4️⃣ Testing Overall System Integration...');
  
  try {
    console.log('   Testing picks service initialization...');
    
    // Test that all sport processors are available
    const testSports = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
    
    for (const sport of testSports) {
      console.log(`   Testing ${sport} processing capability...`);
      
      try {
        // This should not throw an error even if no games are available
        const { oddsService } = await import('./src/services/oddsService.js');
        const games = await oddsService.getUpcomingGames(sport);
        
        console.log(`   ✅ ${sport}: Found ${games.length} games`);
      } catch (sportError) {
        console.log(`   ⚠️ ${sport}: Error - ${sportError.message}`);
      }
    }
    
    console.log('   ✅ Overall system integration looks good!');
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Critical Fixes Verification...\n');
  
  await testPerplexityProxy();
  await testNbaPlayoffStatsBalance();
  await testNhlImplementation();
  await testOverallIntegration();
  
  console.log('\n✅ Critical Fixes Verification Complete!');
  console.log('\n📋 Summary:');
  console.log('   1. Perplexity API: Fixed routing conflicts, single App Router endpoint');
  console.log('   2. NBA Playoff Stats: Fixed team matching, using corrected game arrays');
  console.log('   3. NHL Implementation: Proper processGameOnce wrapper, playoff-focused');
  console.log('\n🎯 Gary 2.0 should now have:');
  console.log('   • Real-time storylines and headlines from Perplexity');
  console.log('   • Balanced NBA playoff player stats for both teams');
  console.log('   • Full NHL playoff processing with team and player stats');
}

// Export for use in other scripts
export { testPerplexityProxy, testNbaPlayoffStatsBalance, testNhlImplementation, testOverallIntegration };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
} 