/**
 * Test script for the MLB Stats API service
 * This script tests the enhanced MLB Stats API service functionality
 * Run with: node src/scripts/testMlbStatsApi.js
 */
import { mlbStatsApiService } from '../services/mlbStatsApiService.js';

// Format date to YYYY-MM-DD
const today = new Date().toISOString().slice(0, 10);

async function testMlbStatsApi() {
  console.log('===== MLB STATS API TEST =====');
  console.log(`Testing MLB Stats API for date: ${today}\n`);

  // Step 1: Get today's games
  console.log('STEP 1: Getting today\'s games...');
  const games = await mlbStatsApiService.getTodaysGames(today);
  console.log(`Found ${games.length} games scheduled for today`);
  
  if (games.length > 0) {
    console.log('First game:', games[0].matchup);
    console.log('Start time:', games[0].startTime);
    console.log('Venue:', games[0].venue);
    console.log('Game ID:', games[0].gameId);
    
    // Step 2: Get starting pitchers for the first game
    const gameId = games[0].gameId;
    console.log('\nSTEP 2: Getting starting pitchers for game', gameId);
    const pitchers = await mlbStatsApiService.getStartingPitchers(gameId);
    
    if (pitchers.homeStarter) {
      console.log('Home starting pitcher:', pitchers.homeStarter.name);
      
      // Get season stats for the home starting pitcher
      console.log('\nSTEP 3: Getting season stats for', pitchers.homeStarter.name);
      const pitcherStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.homeStarter.id);
      console.log('ERA:', pitcherStats.era);
      console.log('Wins-Losses:', `${pitcherStats.wins}-${pitcherStats.losses}`);
      console.log('Strikeouts:', pitcherStats.strikeouts);
      console.log('WHIP:', pitcherStats.whip);
    } else {
      console.log('Home starting pitcher not available yet');
    }
    
    if (pitchers.awayStarter) {
      console.log('\nAway starting pitcher:', pitchers.awayStarter.name);
      
      // Get season stats for the away starting pitcher
      console.log('\nSTEP 4: Getting season stats for', pitchers.awayStarter.name);
      const pitcherStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.awayStarter.id);
      console.log('ERA:', pitcherStats.era);
      console.log('Wins-Losses:', `${pitcherStats.wins}-${pitcherStats.losses}`);
      console.log('Strikeouts:', pitcherStats.strikeouts);
      console.log('WHIP:', pitcherStats.whip);
    } else {
      console.log('Away starting pitcher not available yet');
    }
  } else {
    console.log('No games found for today. Try changing the date.');
  }
  
  // Step 5: Get injury list
  console.log('\nSTEP 5: Getting recent IL transactions (last 7 days)');
  const injuries = await mlbStatsApiService.getILTransactions(7);
  console.log(`Found ${injuries.length} recent IL transactions`);
  
  if (injuries.length > 0) {
    console.log('Most recent IL transactions:');
    injuries.slice(0, 3).forEach((injury, index) => {
      console.log(`${index + 1}. ${injury.player} (${injury.team}) - ${injury.description} on ${injury.date}`);
    });
  }
  
  // Step 6: Test the comprehensive picks generation data function
  console.log('\nSTEP 6: Testing comprehensive picks generation data');
  console.log('Fetching all data needed for picks generation...');
  const picksData = await mlbStatsApiService.getPicksGenerationData(today);
  console.log(`Retrieved data for ${picksData.games.length} games with complete pitcher information`);
  console.log(`Retrieved ${picksData.injuries.length} injury reports`);
  
  console.log('\n===== TEST COMPLETE =====');
}

// Run the test
testMlbStatsApi().catch(error => {
  console.error('Error running MLB Stats API test:', error);
});
