/**
 * Test script for normal picks services
 * Tests each service involved in normal picks generation to identify errors
 */
import { perplexityService } from './services/perplexityService.js';
import { ballDontLieService } from './services/ballDontLieService.js';
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { picksService } from './services/picksService.js';
import { sportsDataService } from './services/sportsDataService.js';
import { formatInEST, getCurrentEST } from './utils/dateUtils.js';

// Helper for pretty printing
const prettyPrint = (obj) => JSON.stringify(obj, null, 2);

// Get today's date in YYYY-MM-DD format
const today = getCurrentEST().toISOString().split('T')[0];
const formattedDate = formatInEST(new Date());

async function testNormalPicksServices() {
  console.log('='.repeat(80));
  console.log('NORMAL PICKS SERVICES TEST SCRIPT');
  console.log('='.repeat(80));
  console.log(`Testing with date: ${today} (${formattedDate})\n`);

  try {
    // Initialize all services
    console.log('TEST 1: Initialize Services');
    console.log('-'.repeat(50));
    
    try {
      await mlbStatsApiService.initialize();
      console.log('✓ MLB Stats API initialized');
    } catch (error) {
      console.error('✗ MLB Stats API initialization failed:', error);
    }
    
    try {
      await ballDontLieService.initialize();
      console.log('✓ Ball Don\'t Lie API initialized');
    } catch (error) {
      console.error('✗ Ball Don\'t Lie API initialization failed:', error);
    }
    
    try {
      await perplexityService.initialize();
      console.log('✓ Perplexity Service initialized');
    } catch (error) {
      console.error('✗ Perplexity Service initialization failed:', error);
    }
    
    // Test Perplexity getGameTimeAndHeadlines
    console.log('\nTEST 2: Perplexity getGameTimeAndHeadlines');
    console.log('-'.repeat(50));
    
    try {
      // Check if the sportsDataService has getGamesForToday method
      if (typeof sportsDataService.getGamesForToday !== 'function') {
        console.error('✗ sportsDataService.getGamesForToday is not a function');
        console.log('This explains the first error: "Cannot read properties of undefined (reading \'getGamesForToday\')"');
      } else {
        console.log('✓ sportsDataService.getGamesForToday exists');
      }
      
      const testTeams = ['Baltimore Orioles', 'Milwaukee Brewers'];
      try {
        console.log(`Testing getGameTimeAndHeadlines for ${testTeams[0]} @ ${testTeams[1]}`);
        const headlines = await perplexityService.getGameTimeAndHeadlines(testTeams[0], testTeams[1], 'MLB');
        console.log('Headlines result:', prettyPrint(headlines));
      } catch (error) {
        console.error(`✗ Error in getGameTimeAndHeadlines: ${error.message}`);
        console.error(error.stack);
      }
    } catch (error) {
      console.error('✗ Perplexity test failed:', error);
    }
    
    // Test Ball Don't Lie service methods
    console.log('\nTEST 3: Ball Don\'t Lie MLB Team Methods');
    console.log('-'.repeat(50));
    
    try {
      // Check if the getTeamByName method exists
      if (typeof ballDontLieService.getTeamByName !== 'function') {
        console.error('✗ ballDontLieService.getTeamByName is not a function');
        console.log('Checking if a similar method exists that should be used instead:');
        
        // List available methods that have "team" in the name
        const teamMethods = Object.keys(ballDontLieService).filter(key => 
          typeof ballDontLieService[key] === 'function' && 
          key.toLowerCase().includes('team')
        );
        
        console.log('Available team-related methods:', teamMethods);
      } else {
        console.log('✓ ballDontLieService.getTeamByName exists');
      }
      
      // Try to call getMlbTeamComparisonStats
      try {
        console.log('Testing getMlbTeamComparisonStats for Baltimore Orioles @ Milwaukee Brewers');
        const stats = await ballDontLieService.getMlbTeamComparisonStats('Baltimore Orioles', 'Milwaukee Brewers');
        console.log('Comparison stats result:', prettyPrint(stats));
      } catch (error) {
        console.error(`✗ Error in getMlbTeamComparisonStats: ${error.message}`);
        console.error(error.stack);
      }
    } catch (error) {
      console.error('✗ Ball Don\'t Lie test failed:', error);
    }
    
    // Test MLB Stats API pitcher data
    console.log('\nTEST 4: MLB Stats API Pitcher Data');
    console.log('-'.repeat(50));
    
    try {
      console.log('Testing getPicksGenerationData');
      const picksData = await mlbStatsApiService.getPicksGenerationData(today);
      
      if (!picksData || !picksData.games || picksData.games.length === 0) {
        console.error('✗ No games found in picks generation data');
      } else {
        console.log(`Found ${picksData.games.length} games`);
        
        // Check the first game for pitcher data
        const firstGame = picksData.games[0];
        console.log('First game:', prettyPrint({
          matchup: firstGame.matchup || `${firstGame.awayTeam} @ ${firstGame.homeTeam}`,
          hasPitchers: !!firstGame.pitchers,
          homePitcher: firstGame.pitchers?.home?.fullName || 'Not available',
          awayPitcher: firstGame.pitchers?.away?.fullName || 'Not available'
        }));
      }
    } catch (error) {
      console.error('✗ MLB Stats API test failed:', error);
    }
    
    // Test Picks Service
    console.log('\nTEST 5: Picks Service Test');
    console.log('-'.repeat(50));
    
    try {
      console.log('Testing the entire picks generation flow with a single game');
      
      // Get a game to test with
      const games = await mlbStatsApiService.getTodaysGames(today);
      if (!games || games.length === 0) {
        console.error('✗ No games found for today');
      } else {
        const testGame = games[0];
        console.log(`Testing with game: ${testGame.awayTeam} @ ${testGame.homeTeam}`);
        
        // Try to generate a pick for this specific game
        try {
          const gameData = {
            homeTeam: testGame.homeTeam,
            awayTeam: testGame.awayTeam,
            gameId: testGame.gameId,
            sportKey: 'baseball_mlb',
            sport: 'MLB'
          };
          
          console.log('Getting comprehensive MLB game stats');
          let gameStats;
          try {
            gameStats = await ballDontLieService.getComprehensiveMlbGameStats(gameData.homeTeam, gameData.awayTeam);
            console.log('Game stats result:', gameStats ? 'Success' : 'Failed');
          } catch (error) {
            console.error(`✗ Error getting comprehensive MLB game stats: ${error.message}`);
          }
          
          console.log('Getting MLB pitcher matchup');
          let pitcherMatchup;
          try {
            pitcherMatchup = await ballDontLieService.getMlbPitcherMatchup(gameData.homeTeam, gameData.awayTeam);
            console.log('Pitcher matchup result:', pitcherMatchup ? 'Success' : 'Failed');
          } catch (error) {
            console.error(`✗ Error getting MLB pitcher matchup: ${error.message}`);
          }
        } catch (error) {
          console.error('✗ Error testing pick generation:', error);
        }
      }
    } catch (error) {
      console.error('✗ Picks Service test failed:', error);
    }
    
    console.log('\nALL TESTS COMPLETED');
  } catch (error) {
    console.error('UNHANDLED TEST ERROR:', error);
  }
}

// Run the test script
testNormalPicksServices().catch(err => {
  console.error('Unhandled error in test script:', err);
});
