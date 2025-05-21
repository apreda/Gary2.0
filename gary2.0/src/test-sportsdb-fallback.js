/**
 * Test script to verify SportsDB can be used as a fallback for game data
 * when Ball Don't Lie API fails to provide the necessary information
 */
import { sportsDataService } from './services/sportsDataService.js';

// Test teams (using the ones from the error message)
const homeTeam = 'Milwaukee Brewers';
const awayTeam = 'Baltimore Orioles';
const sport = 'MLB';

async function testSportsDBFallback() {
  console.log(`Testing SportsDB API as fallback for ${awayTeam} @ ${homeTeam} (${sport})`);
  
  try {
    // Attempt to get team stats from SportsDB
    console.log('\nFetching team stats from SportsDB...');
    const statsContext = await sportsDataService.generateTeamStatsForGame(
      homeTeam,
      awayTeam,
      sport
    );
    
    if (statsContext.statsAvailable) {
      console.log('✅ SUCCESS: SportsDB provided team stats');
      console.log('\nData preview:');
      console.log(statsContext.statsText.substring(0, 500) + '...');
    } else {
      console.log('❌ FAILED: SportsDB did not provide team stats');
      console.log('Error details:', statsContext.error || 'No specific error details available');
    }
    
    // Check if specific fields are available
    console.log('\nChecking for key data points:');
    
    // Sample keys we might need
    const keysToCheck = ['homeTeamData', 'awayTeamData', 'statsText', 'statsAvailable'];
    
    keysToCheck.forEach(key => {
      if (statsContext[key]) {
        console.log(`✅ ${key}: Available`);
      } else {
        console.log(`❌ ${key}: Not available`);
      }
    });
    
    // Overall assessment
    console.log('\n==== SUMMARY ====');
    if (statsContext.statsAvailable && statsContext.statsText && statsContext.statsText.length > 200) {
      console.log('✅ SportsDB CAN be used as a reliable fallback for Ball Don\'t Lie API');
    } else {
      console.log('❌ SportsDB may NOT be a reliable fallback - insufficient data');
    }
    
  } catch (error) {
    console.error('Error testing SportsDB fallback:', error);
  }
}

// Run the test
testSportsDBFallback().catch(console.error);
