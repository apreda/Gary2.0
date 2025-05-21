/**
 * Test script to verify the fixed Ball Don't Lie service with SportsDB fallback
 * Tests the specific teams from the error: Baltimore Orioles @ Milwaukee Brewers
 */
import { ballDontLieService } from './services/ballDontLieServiceFix.js';

// Test teams (using the ones from the error message)
const homeTeam = 'Milwaukee Brewers';
const awayTeam = 'Baltimore Orioles';

async function testBallDontLieWithFallback() {
  console.log(`===== TESTING FIXED BALL DON'T LIE SERVICE WITH SPORTSDB FALLBACK =====`);
  console.log(`Testing with teams: ${awayTeam} @ ${homeTeam}\n`);
  
  try {
    // 1. Test getTeamByName function
    console.log('\n----- Testing getTeamByName function -----');
    const [homeTeamInfo, awayTeamInfo] = await Promise.all([
      ballDontLieService.getTeamByName(homeTeam),
      ballDontLieService.getTeamByName(awayTeam)
    ]);
    
    if (homeTeamInfo) {
      console.log(`✅ SUCCESS: Found home team: ${homeTeamInfo.display_name} (ID: ${homeTeamInfo.id})`);
    } else {
      console.log(`❌ FAILED: Could not find home team: ${homeTeam}`);
    }
    
    if (awayTeamInfo) {
      console.log(`✅ SUCCESS: Found away team: ${awayTeamInfo.display_name} (ID: ${awayTeamInfo.id})`);
    } else {
      console.log(`❌ FAILED: Could not find away team: ${awayTeam}`);
    }
    
    // 2. Test getMlbTeamComparisonStats function
    console.log('\n----- Testing getMlbTeamComparisonStats function -----');
    const teamComparison = await ballDontLieService.getMlbTeamComparisonStats(homeTeam, awayTeam);
    
    if (teamComparison) {
      console.log(`✅ SUCCESS: Generated team comparison stats`);
      console.log('\nSample of team comparison text:');
      console.log(teamComparison.teamComparisonText.substring(0, 300) + '...');
    } else {
      console.log(`❌ FAILED: Could not generate team comparison stats`);
    }
    
    // 3. Test getComprehensiveMlbGameStats function with fallback
    console.log('\n----- Testing getComprehensiveMlbGameStats function with SportsDB fallback -----');
    const gameStats = await ballDontLieService.getComprehensiveMlbGameStats(homeTeam, awayTeam);
    
    if (gameStats) {
      console.log(`✅ SUCCESS: Generated comprehensive game stats using ${gameStats.dataSource} as data source`);
      console.log('\nSample of team comparison text:');
      console.log(gameStats.teamComparisonText.substring(0, 300) + '...');
      
      if (gameStats.pitcherMatchup) {
        console.log('\nSample of pitcher matchup text:');
        console.log(gameStats.pitcherMatchupText.substring(0, 300) + '...');
      }
    } else {
      console.log(`❌ FAILED: Could not generate comprehensive game stats`);
    }
    
    // Summary
    console.log('\n===== TEST SUMMARY =====');
    if (homeTeamInfo && awayTeamInfo && teamComparison && gameStats) {
      console.log('✅ ALL TESTS PASSED: The fixed Ball Don\'t Lie service is working correctly with SportsDB fallback');
    } else {
      console.log('❌ SOME TESTS FAILED: Check the logs above for details');
    }
    
  } catch (error) {
    console.error('Error testing Ball Don\'t Lie service:', error);
  }
}

// Run the test
testBallDontLieWithFallback().catch(console.error);
