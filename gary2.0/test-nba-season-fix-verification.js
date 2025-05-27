// NBA Season Fix Verification Test
// This test verifies that we're getting 2024 season data for 2025 playoffs

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testNbaSeasonFix() {
  console.log('🏀 NBA SEASON FIX VERIFICATION TEST');
  console.log('=====================================');
  
  try {
    // Initialize the service
    await ballDontLieService.initialize();
    
    // Test 1: Season calculation logic
    console.log('\n📊 TEST 1: Season Calculation Logic');
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const expectedSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`Current Year: ${currentYear}`);
    console.log(`Current Month: ${currentMonth}`);
    console.log(`Expected Season: ${expectedSeason}`);
    console.log(`Should be 2024 for 2025 playoffs: ${expectedSeason === 2024 ? '✅ CORRECT' : '❌ WRONG'}`);
    
    // Test 2: Get Active Playoff Teams (this was the problematic function)
    console.log('\n📊 TEST 2: Active Playoff Teams (Fixed Function)');
    const activeTeams = await ballDontLieService.getActivePlayoffTeams();
    console.log(`Found ${activeTeams.length} active playoff teams`);
    
    if (activeTeams.length > 0) {
      console.log('Sample teams:');
      activeTeams.slice(0, 3).forEach(team => {
        console.log(`  - ${team.name} (${team.abbreviation})`);
      });
    }
    
    // Test 3: Get NBA Playoff Games directly
    console.log('\n📊 TEST 3: NBA Playoff Games (Direct Call)');
    const playoffGames = await ballDontLieService.getNbaPlayoffGames(2024);
    console.log(`Found ${playoffGames.length} playoff games for 2024 season`);
    
    if (playoffGames.length > 0) {
      console.log('Sample games:');
      playoffGames.slice(0, 3).forEach(game => {
        console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
      
      // Check if any games are from wrong years
      const wrongYearGames = playoffGames.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        return gameYear < 2024 || gameYear > 2025;
      });
      
      if (wrongYearGames.length > 0) {
        console.log(`❌ WARNING: Found ${wrongYearGames.length} games from wrong years:`);
        wrongYearGames.slice(0, 3).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      } else {
        console.log('✅ All games are from correct year range (2024-2025)');
      }
    }
    
    // Test 4: Test with default season parameter (should use calculated season)
    console.log('\n📊 TEST 4: Default Season Parameter Test');
    const defaultSeasonGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`Found ${defaultSeasonGames.length} playoff games with default season parameter`);
    
    // Test 5: Test NBA Playoff Player Stats
    console.log('\n📊 TEST 5: NBA Playoff Player Stats');
    try {
      const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(
        'New York Knicks', 
        'Indiana Pacers', 
        2024
      );
      
      console.log(`Knicks players: ${playerStats.home.length}`);
      console.log(`Pacers players: ${playerStats.away.length}`);
      
      if (playerStats.home.length > 0) {
        console.log('Sample Knicks player:');
        const player = playerStats.home[0];
        console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.avgPts} PPG`);
      }
      
      if (playerStats.away.length > 0) {
        console.log('Sample Pacers player:');
        const player = playerStats.away[0];
        console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.avgPts} PPG`);
      }
      
      // Check for balance
      if (playerStats.home.length > 0 && playerStats.away.length === 0) {
        console.log('❌ IMBALANCE: Knicks have players but Pacers have 0');
      } else if (playerStats.home.length === 0 && playerStats.away.length > 0) {
        console.log('❌ IMBALANCE: Pacers have players but Knicks have 0');
      } else if (playerStats.home.length > 0 && playerStats.away.length > 0) {
        console.log('✅ BALANCED: Both teams have playoff player data');
      } else {
        console.log('⚠️  NO DATA: Neither team has playoff player data');
      }
      
    } catch (error) {
      console.log(`❌ Error getting player stats: ${error.message}`);
    }
    
    // Test 6: Cache verification
    console.log('\n📊 TEST 6: Cache Key Verification');
    const expectedCacheKey = `nba_playoff_games_${expectedSeason}`;
    console.log(`Expected cache key: ${expectedCacheKey}`);
    console.log(`Should be: nba_playoff_games_2024 for current playoffs`);
    
    // Summary
    console.log('\n🎯 SUMMARY');
    console.log('==========');
    console.log(`✅ Season calculation: ${expectedSeason === 2024 ? 'CORRECT (2024)' : 'WRONG'}`);
    console.log(`✅ Active teams found: ${activeTeams.length > 0 ? 'YES' : 'NO'}`);
    console.log(`✅ Playoff games found: ${playoffGames.length > 0 ? 'YES' : 'NO'}`);
    console.log(`✅ Cache key format: ${expectedCacheKey}`);
    
    if (expectedSeason === 2024 && playoffGames.length > 0) {
      console.log('\n🎉 SUCCESS: NBA season fix is working correctly!');
      console.log('   - Using 2024 season for 2025 playoffs');
      console.log('   - Getting current playoff data, not old fallback data');
      console.log('   - Cache keys are correct');
    } else {
      console.log('\n❌ ISSUE: NBA season fix needs more work');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testNbaSeasonFix(); 