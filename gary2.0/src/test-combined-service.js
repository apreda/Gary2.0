/**
 * Test script for the combined MLB service
 * This verifies that our solution correctly retrieves the best data from both APIs
 */

import { combinedMlbService } from './services/combinedMlbService.js';
import dotenv from 'dotenv';
dotenv.config();

async function testCombinedService() {
  console.log('🏆 TESTING COMBINED MLB SERVICE 🏆');
  console.log('------------------------------------------');
  console.log('Target: Los Angeles Angels vs Oakland Athletics');
  console.log('Date: May 21, 2025');
  console.log('------------------------------------------');
  
  try {
    // 1. Test the comprehensive data function
    console.log('Testing getComprehensiveGameData...');
    const gameData = await combinedMlbService.getComprehensiveGameData('Athletics', 'Angels');
    
    // Display game information
    console.log('\n📊 GAME INFORMATION 📊');
    console.log('------------------------------------------');
    console.log(`Game: ${gameData.game.awayTeam} @ ${gameData.game.homeTeam}`);
    console.log(`Date/Time: ${new Date(gameData.game.gameDate).toLocaleString()}`);
    console.log(`Venue: ${gameData.game.venue}`);
    console.log(`Game ID: ${gameData.game.gamePk}`);
    
    // Display starting pitchers
    console.log('\n⚾ STARTING PITCHERS ⚾');
    console.log('------------------------------------------');
    
    // Home pitcher
    if (gameData.pitchers.home) {
      const pitcher = gameData.pitchers.home;
      console.log(`HOME PITCHER (${gameData.game.homeTeam}):`);
      console.log(`Name: ${pitcher.fullName}`);
      console.log(`ID: ${pitcher.id}`);
      
      if (pitcher.seasonStats) {
        console.log(`ERA: ${pitcher.seasonStats.era}`);
        console.log(`Record: ${pitcher.seasonStats.wins}-${pitcher.seasonStats.losses}`);
        console.log(`Innings Pitched: ${pitcher.seasonStats.inningsPitched}`);
        console.log(`WHIP: ${pitcher.seasonStats.whip}`);
      } else {
        console.log('No season stats available');
      }
    } else {
      console.log(`No home pitcher found for ${gameData.game.homeTeam}`);
    }
    
    console.log('------------------------------------------');
    
    // Away pitcher
    if (gameData.pitchers.away) {
      const pitcher = gameData.pitchers.away;
      console.log(`AWAY PITCHER (${gameData.game.awayTeam}):`);
      console.log(`Name: ${pitcher.fullName}`);
      console.log(`ID: ${pitcher.id}`);
      
      if (pitcher.seasonStats) {
        console.log(`ERA: ${pitcher.seasonStats.era}`);
        console.log(`Record: ${pitcher.seasonStats.wins}-${pitcher.seasonStats.losses}`);
        console.log(`Innings Pitched: ${pitcher.seasonStats.inningsPitched}`);
        console.log(`WHIP: ${pitcher.seasonStats.whip}`);
      } else {
        console.log('No season stats available');
      }
    } else {
      console.log(`No away pitcher found for ${gameData.game.awayTeam}`);
    }
    
    // Display team stats
    console.log('\n📈 TEAM STATS 📈');
    console.log('------------------------------------------');
    
    console.log(`HOME TEAM (${gameData.game.homeTeam}):`);
    const homeStats = gameData.teamStats.homeTeam;
    for (const [key, value] of Object.entries(homeStats)) {
      if (value && typeof value !== 'object') {
        console.log(`${key}: ${value}`);
      }
    }
    
    console.log('------------------------------------------');
    
    console.log(`AWAY TEAM (${gameData.game.awayTeam}):`);
    const awayStats = gameData.teamStats.awayTeam;
    for (const [key, value] of Object.entries(awayStats)) {
      if (value && typeof value !== 'object') {
        console.log(`${key}: ${value}`);
      }
    }
    
    // 2. Test the enhanced game preview
    console.log('\n📝 ENHANCED GAME PREVIEW 📝');
    console.log('------------------------------------------');
    const preview = await combinedMlbService.generateEnhancedGamePreview('Athletics', 'Angels');
    console.log(preview);
    
    console.log('------------------------------------------');
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testCombinedService();
