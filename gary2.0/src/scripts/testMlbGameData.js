/**
 * Test script for MLB Stats API Game Data functionality
 * Tests retrieval of today's games, starting pitchers, and stats
 */

import { mlbStatsApiService } from '../services/mlbStatsApiService.js';

// Get formatted date for testing (can be modified for testing other dates)
const today = new Date().toISOString().slice(0, 10);
const testDate = today; // Use today's date for testing

async function testMlbGameData() {
  console.log('Testing MLB Stats API Game Data...');
  console.log('========================================');
  console.log(`Testing with date: ${testDate}`);
  
  try {
    // Step 1: Get today's games
    console.log('\n1. FETCHING TODAY\'S GAMES:');
    console.log('---------------------------');
    const games = await mlbStatsApiService.getTodaysGames(testDate);
    
    console.log(`Found ${games.length} games scheduled for ${testDate}`);
    
    if (games.length === 0) {
      console.log('No games found for this date. Try a different date.');
      return;
    }
    
    // Log a summary of the games
    games.forEach((game, index) => {
      console.log(`Game ${index + 1}: ${game.awayTeam} @ ${game.homeTeam} - ${game.gameTime}`);
    });
    
    // Step 2: Test getting starting pitchers for the first game
    console.log('\n2. FETCHING STARTING PITCHERS:');
    console.log('------------------------------');
    
    const testGame = games[0];
    console.log(`Testing with game: ${testGame.awayTeam} @ ${testGame.homeTeam}`);
    
    const pitchers = await mlbStatsApiService.getStartingPitchers(testGame.gameId);
    
    if (pitchers.homeStarter) {
      console.log(`✅ Home starter: ${pitchers.homeStarter.fullName} (ID: ${pitchers.homeStarter.id})`);
    } else {
      console.log('❌ Home starter not found');
    }
    
    if (pitchers.awayStarter) {
      console.log(`✅ Away starter: ${pitchers.awayStarter.fullName} (ID: ${pitchers.awayStarter.id})`);
    } else {
      console.log('❌ Away starter not found');
    }
    
    // Step 3: Test getting pitcher stats
    console.log('\n3. FETCHING PITCHER STATS:');
    console.log('-------------------------');
    
    if (pitchers.homeStarter) {
      console.log(`Getting stats for ${pitchers.homeStarter.fullName}:`);
      const homeStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.homeStarter.id);
      
      if (Object.keys(homeStats).length > 0) {
        console.log('✅ Home starter stats found:');
        console.log(`   ERA: ${homeStats.era}`);
        console.log(`   Wins-Losses: ${homeStats.wins}-${homeStats.losses}`);
        console.log(`   Strikeouts: ${homeStats.strikeouts}`);
        console.log(`   WHIP: ${homeStats.whip}`);
      } else {
        console.log('❌ Home starter stats not found');
      }
    }
    
    if (pitchers.awayStarter) {
      console.log(`\nGetting stats for ${pitchers.awayStarter.fullName}:`);
      const awayStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.awayStarter.id);
      
      if (Object.keys(awayStats).length > 0) {
        console.log('✅ Away starter stats found:');
        console.log(`   ERA: ${awayStats.era}`);
        console.log(`   Wins-Losses: ${awayStats.wins}-${awayStats.losses}`);
        console.log(`   Strikeouts: ${awayStats.strikeouts}`);
        console.log(`   WHIP: ${awayStats.whip}`);
      } else {
        console.log('❌ Away starter stats not found');
      }
    }
    
    // Step 4: Comprehensive test - get picks generation data
    console.log('\n4. TESTING COMPREHENSIVE PICKS GENERATION DATA:');
    console.log('--------------------------------------------');
    
    console.log('Fetching all data needed for picks generation...');
    const picksData = await mlbStatsApiService.getPicksGenerationData(testDate);
    
    console.log(`✅ Retrieved data for ${picksData.games.length} games`);
    console.log(`✅ Retrieved ${picksData.injuries.length} recent injury records`);
    
    // Test one complete game data to ensure it's all there
    if (picksData.games.length > 0) {
      const sampleGame = picksData.games[0];
      console.log('\nSample game data analysis:');
      console.log(`Game: ${sampleGame.awayTeam} @ ${sampleGame.homeTeam}`);
      
      const hasHomePitcher = sampleGame.pitchers?.home !== null;
      const hasAwayPitcher = sampleGame.pitchers?.away !== null;
      const hasHomePitcherStats = sampleGame.pitchers?.home?.seasonStats && 
                                Object.keys(sampleGame.pitchers.home.seasonStats).length > 0;
      const hasAwayPitcherStats = sampleGame.pitchers?.away?.seasonStats && 
                                Object.keys(sampleGame.pitchers.away.seasonStats).length > 0;
      
      console.log(`Home Pitcher: ${hasHomePitcher ? '✅' : '❌'}`);
      console.log(`Away Pitcher: ${hasAwayPitcher ? '✅' : '❌'}`);
      console.log(`Home Pitcher Stats: ${hasHomePitcherStats ? '✅' : '❌'}`);
      console.log(`Away Pitcher Stats: ${hasAwayPitcherStats ? '✅' : '❌'}`);
      
      const success = hasHomePitcher && hasAwayPitcher && hasHomePitcherStats && hasAwayPitcherStats;
      console.log(`\nOverall Pick Generation Data: ${success ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
    }
    
    console.log('\n========================================');
    console.log('MLB Stats API Game Data test completed!');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
testMlbGameData().catch(error => {
  console.error('Main test execution failed:', error);
});
