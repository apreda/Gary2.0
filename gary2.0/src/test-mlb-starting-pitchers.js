/**
 * Test script to verify MLB Stats API's ability to retrieve starting pitchers
 * for the Los Angeles Angels vs Oakland Athletics game
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import dotenv from 'dotenv';
dotenv.config();

async function testMlbStartingPitchers() {
  console.log('🏆 Testing MLB Stats API: Starting Pitchers Retrieval 🏆');
  console.log('--------------------------------------------------------');
  console.log('Target Game: Los Angeles Angels vs Oakland Athletics');
  console.log('Date: May 21, 2025');
  console.log('--------------------------------------------------------');
  
  try {
    // 1. Get today's games
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`Fetching MLB games for ${today}...`);
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('⚠️ No games found for today');
      return;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // 2. Find the Angels vs Athletics game
    let targetGame = null;
    for (const game of games) {
      const homeTeam = game.teams.home.team.name;
      const awayTeam = game.teams.away.team.name;
      
      if ((homeTeam.includes('Angels') && awayTeam.includes('Athletics')) || 
          (homeTeam.includes('Athletics') && awayTeam.includes('Angels'))) {
        targetGame = game;
        console.log(`🎯 Found target game: ${awayTeam} @ ${homeTeam} (Game ID: ${game.gamePk})`);
        break;
      }
    }
    
    if (!targetGame) {
      console.log('⚠️ Angels vs Athletics game not found for today');
      // Print all available games for reference
      console.log('\nAvailable games today:');
      games.forEach(game => {
        console.log(`- ${game.teams.away.team.name} @ ${game.teams.home.team.name} (Game ID: ${game.gamePk})`);
      });
      return;
    }
    
    // 3. Get starting pitchers for the game
    console.log(`\nGetting starting pitchers for game ID: ${targetGame.gamePk}`);
    const startingPitchers = await mlbStatsApiService.getStartingPitchers(targetGame.gamePk);
    
    if (!startingPitchers || (!startingPitchers.home && !startingPitchers.away)) {
      console.log('⚠️ Failed to get starting pitchers');
      return;
    }
    
    // 4. Display pitcher information
    console.log('\n🏆 STARTING PITCHER RESULTS 🏆');
    console.log('--------------------------------------------------------');
    
    // Home pitcher
    if (startingPitchers.home) {
      console.log(`HOME PITCHER (${targetGame.teams.home.team.name}):`);
      displayPitcherInfo(startingPitchers.home);
      
      // 5. Get detailed season stats for home pitcher
      console.log('\nGetting season stats for home pitcher...');
      const homeStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.home.id);
      displayPitcherStats(homeStats);
    } else {
      console.log(`⚠️ No home starting pitcher found for ${targetGame.teams.home.team.name}`);
    }
    
    console.log('--------------------------------------------------------');
    
    // Away pitcher
    if (startingPitchers.away) {
      console.log(`AWAY PITCHER (${targetGame.teams.away.team.name}):`);
      displayPitcherInfo(startingPitchers.away);
      
      // 6. Get detailed season stats for away pitcher
      console.log('\nGetting season stats for away pitcher...');
      const awayStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.away.id);
      displayPitcherStats(awayStats);
    } else {
      console.log(`⚠️ No away starting pitcher found for ${targetGame.teams.away.team.name}`);
    }
    
    console.log('--------------------------------------------------------');
    console.log('Test completed!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Helper function to display basic pitcher info
function displayPitcherInfo(pitcher) {
  if (!pitcher) return;
  
  console.log(`ID: ${pitcher.id}`);
  console.log(`Name: ${pitcher.fullName || 'Unknown'}`);
  console.log(`Jersey: #${pitcher.jerseyNumber || 'N/A'}`);
  console.log(`Status: ${pitcher.status || 'Active'}`);
}

// Helper function to display pitcher stats
function displayPitcherStats(stats) {
  if (!stats || Object.keys(stats).length === 0) {
    console.log('No statistics available for this pitcher');
    return;
  }
  
  console.log(`ERA: ${stats.era}`);
  console.log(`Record: ${stats.wins}-${stats.losses}`);
  console.log(`Innings Pitched: ${stats.inningsPitched}`);
  console.log(`Strikeouts: ${stats.strikeouts}`);
  console.log(`WHIP: ${stats.whip}`);
  console.log(`BAA: ${stats.battingAvgAgainst}`);
  console.log(`Games Started: ${stats.gamesStarted}`);
  console.log(`Games Pitched: ${stats.gamesPitched}`);
}

// Run the test
testMlbStartingPitchers();
