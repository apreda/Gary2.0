/**
 * Test script to verify MLB Stats API integration with Ball Don't Lie
 * This script demonstrates proper error handling and tests the pitcher data retrieval functionality
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { ballDontLieService } from './services/ballDontLieService.js';
import { getPitcherSeasonStatsFixed, getPicksGenerationDataFixed } from './services/mlbStatsApiFix.js';

// Helper to stringify deep objects
const stringify = (obj) => JSON.stringify(obj, null, 2);

// Get today's date in YYYY-MM-DD format
const getToday = () => new Date().toISOString().split('T')[0];

async function runTests() {
  console.log('-'.repeat(80));
  console.log('MLB STATS INTEGRATION TEST');
  console.log('-'.repeat(80));
  
  try {
    // Step 1: Test MLB Stats API - Today's Games
    console.log('\n1. Testing MLB Stats API - Today\'s Games');
    const today = getToday();
    const mlbGames = await mlbStatsApiService.getTodaysGames(today);
    console.log(`Found ${mlbGames?.length || 0} MLB games for ${today}`);
    
    if (mlbGames?.length > 0) {
      console.log('Sample game data:');
      console.log(stringify(mlbGames[0]));
      
      // Test pitcher data for a game
      const gameId = mlbGames[0].gameId;
      console.log(`\nTesting pitcher data for game ID: ${gameId}`);
      
      try {
        const pitchers = await mlbStatsApiService.getStartingPitchers(gameId);
        console.log('\nStarting pitchers:');
        console.log(stringify(pitchers));
        
        // Test pitcher season stats if available
        if (pitchers?.homeStarter?.id) {
          console.log(`\nGetting home starter (${pitchers.homeStarter.fullName}) stats...`);
          const homeStats = await getPitcherSeasonStatsFixed(pitchers.homeStarter.id);
          console.log('Home starter stats:');
          console.log(stringify(homeStats));
        }
      } catch (pitcherError) {
        console.error('Error getting pitchers:', pitcherError.message);
      }
    }
    
    // Step 2: Test Ball Don't Lie Service - Team Stats
    console.log('\n2. Testing Ball Don\'t Lie Service - Team Stats');
    try {
      const teamName = 'Yankees'; // Example team
      console.log(`Getting stats for ${teamName}...`);
      const teamStats = await ballDontLieService.getTeamPlayersStatsForDate(teamName, today);
      console.log(`Team stats result:`, stringify(teamStats));
    } catch (ballDontLieError) {
      console.error('Error with Ball Don\'t Lie service:', ballDontLieError.message);
    }
    
    // Step 3: Test the fixed picks generation data function
    console.log('\n3. Testing Fixed Picks Generation Function');
    try {
      const picksData = await getPicksGenerationDataFixed(today);
      console.log('Picks generation data summary:');
      console.log(`- Date: ${picksData.date}`);
      console.log(`- Games with data: ${picksData.games?.length || 0}`);
      console.log(`- Injuries reported: ${picksData.injuries?.length || 0}`);
      
      if (picksData.games?.length > 0) {
        console.log('\nSample game with pitcher data:');
        const sampleGame = picksData.games[0];
        console.log(`Game: ${sampleGame.matchup}`);
        console.log(`Home pitcher: ${sampleGame.pitchers?.home?.fullName || 'Not available'}`);
        console.log(`Away pitcher: ${sampleGame.pitchers?.away?.fullName || 'Not available'}`);
      }
    } catch (picksError) {
      console.error('Error with picks generation:', picksError.message);
    }
    
    console.log('\nTESTS COMPLETED');
  } catch (error) {
    console.error('TEST FAILURE:', error.message);
  }
}

// Run the tests
runTests().catch(err => console.error('Unhandled error:', err));
