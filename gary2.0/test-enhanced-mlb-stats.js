/**
 * Test script to verify the enhanced MLB Stats API service
 * Tests if pitcher stats are being properly retrieved
 */
import { mlbStatsApiService } from './src/services/mlbStatsApiService.enhanced.js';

async function testEnhancedMLBStats() {
  console.log('=== Testing Enhanced MLB Stats API Service ===\n');
  
  try {
    // Get today's date
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Testing for date: ${today}\n`);
    
    // Test 1: Get games with starting pitchers
    console.log('1. Testing getGamesWithStartingPitchers...');
    const games = await mlbStatsApiService.getGamesWithStartingPitchers(today);
    
    if (games.length === 0) {
      console.log('No games found for today. Trying tomorrow...');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      
      const tomorrowGames = await mlbStatsApiService.getGamesWithStartingPitchers(tomorrowStr);
      
      if (tomorrowGames.length > 0) {
        console.log(`Found ${tomorrowGames.length} games for tomorrow (${tomorrowStr})`);
        
        // Test the first game
        const testGame = tomorrowGames[0];
        console.log(`\nTesting game: ${testGame.teams.away.team.name} @ ${testGame.teams.home.team.name}`);
        console.log(`Game ID: ${testGame.gamePk}`);
        
        // Check enhanced data
        if (testGame.enhancedData) {
          console.log('\n--- Enhanced Data ---');
          
          if (testGame.enhancedData.homeProbablePitcher) {
            const homePitcher = testGame.enhancedData.homeProbablePitcher;
            console.log(`Home Pitcher: ${homePitcher.fullName} (ID: ${homePitcher.id})`);
            console.log('Home Pitcher Stats:', homePitcher.seasonStats);
          } else {
            console.log('Home Pitcher: TBD');
          }
          
          if (testGame.enhancedData.awayProbablePitcher) {
            const awayPitcher = testGame.enhancedData.awayProbablePitcher;
            console.log(`Away Pitcher: ${awayPitcher.fullName} (ID: ${awayPitcher.id})`);
            console.log('Away Pitcher Stats:', awayPitcher.seasonStats);
          } else {
            console.log('Away Pitcher: TBD');
          }
        }
        
        // Test 2: Test getStartingPitchersEnhanced directly
        console.log('\n2. Testing getStartingPitchersEnhanced directly...');
        const pitchers = await mlbStatsApiService.getStartingPitchersEnhanced(testGame.gamePk);
        
        console.log('\n--- Direct Enhanced Pitchers ---');
        if (pitchers.home) {
          console.log(`Home Starter: ${pitchers.home.fullName}`);
          console.log('Home Stats:', pitchers.home.seasonStats);
        }
        
        if (pitchers.away) {
          console.log(`Away Starter: ${pitchers.away.fullName}`);
          console.log('Away Stats:', pitchers.away.seasonStats);
        }
        
        // Test 3: Test original getPitcherSeasonStats function directly
        console.log('\n3. Testing getPitcherSeasonStats directly...');
        if (pitchers.home?.id) {
          console.log(`Testing stats for pitcher ID: ${pitchers.home.id}`);
          const directStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.home.id);
          console.log('Direct stats result:', directStats);
        }
        
      } else {
        console.log('No games found for tomorrow either. Testing with a known game...');
        
        // Test with a recent game ID (you might need to update this)
        const testGamePk = 746479; // Example game ID - update as needed
        console.log(`\nTesting with game ID: ${testGamePk}`);
        
        const pitchers = await mlbStatsApiService.getStartingPitchersEnhanced(testGamePk);
        console.log('Pitchers result:', pitchers);
      }
    } else {
      console.log(`Found ${games.length} games for today`);
      
      // Test the first game
      const testGame = games[0];
      console.log(`\nTesting game: ${testGame.teams.away.team.name} @ ${testGame.teams.home.team.name}`);
      
      if (testGame.enhancedData) {
        console.log('\n--- Enhanced Data ---');
        console.log('Home Pitcher:', testGame.enhancedData.homeProbablePitcher);
        console.log('Away Pitcher:', testGame.enhancedData.awayProbablePitcher);
      }
    }
    
  } catch (error) {
    console.error('Error during testing:', error);
  }
}

// Run the test
testEnhancedMLBStats(); 