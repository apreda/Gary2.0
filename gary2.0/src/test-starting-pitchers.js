/**
 * Test script to verify Ball Don't Lie API's ability to retrieve starting pitchers
 * for a specific upcoming game (Los Angeles Angels vs Athletics)
 */

import { ballDontLieService } from './services/ballDontLieService.js';
import dotenv from 'dotenv';
dotenv.config();

async function testStartingPitchers() {
  console.log('🏆 Testing Ball Don\'t Lie API: Starting Pitchers Retrieval 🏆');
  console.log('--------------------------------------------------------');
  console.log('Target Game: Los Angeles Angels vs Oakland Athletics');
  console.log('Date: May 21, 2025');
  console.log('--------------------------------------------------------');
  
  try {
    // 1. Initialize the service
    await ballDontLieService.initialize();
    if (!ballDontLieService.isInitialized()) {
      throw new Error('Failed to initialize Ball Don\'t Lie service');
    }
    console.log('✅ Ball Don\'t Lie service initialized successfully');
    
    // 2. Get today's games
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`Fetching MLB games for ${today}...`);
    const games = await ballDontLieService.getMlbGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('⚠️ No games found for today');
      return;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // 3. Find the Angels vs Athletics game
    let targetGame = null;
    for (const game of games) {
      const homeTeam = game.home_team.display_name;
      const awayTeam = game.away_team.display_name;
      
      if ((homeTeam.includes('Angels') && awayTeam.includes('Athletics')) || 
          (homeTeam.includes('Athletics') && awayTeam.includes('Angels'))) {
        targetGame = game;
        console.log(`🎯 Found target game: ${awayTeam} @ ${homeTeam}`);
        break;
      }
    }
    
    if (!targetGame) {
      console.log('⚠️ Angels vs Athletics game not found for today');
      
      // Print all available games
      console.log('\nAvailable games today:');
      games.forEach(game => {
        console.log(`- ${game.away_team.display_name} @ ${game.home_team.display_name}`);
      });
      
      // Try with a manual team lookup instead
      console.log('\nAttempting manual team lookup...');
      return await testPitcherMatchupManually('Los Angeles Angels', 'Oakland Athletics');
    }
    
    // 4. Get pitcher matchup
    const homeTeam = targetGame.home_team.display_name;
    const awayTeam = targetGame.away_team.display_name;
    
    console.log(`\nGetting pitcher matchup for: ${awayTeam} @ ${homeTeam}`);
    
    const pitcherMatchup = await ballDontLieService.getMlbPitcherMatchup(homeTeam, awayTeam);
    
    if (!pitcherMatchup) {
      console.log('⚠️ Failed to get pitcher matchup');
      return;
    }
    
    // 5. Display the results
    console.log('\n🏆 PITCHER MATCHUP RESULTS 🏆');
    console.log('--------------------------------------------------------');
    
    if (pitcherMatchup.homePitcher) {
      console.log(`HOME PITCHER (${homeTeam}):`);
      displayPitcherStats(pitcherMatchup.homePitcher);
    } else {
      console.log(`⚠️ No home pitcher found for ${homeTeam}`);
    }
    
    console.log('--------------------------------------------------------');
    
    if (pitcherMatchup.awayPitcher) {
      console.log(`AWAY PITCHER (${awayTeam}):`);
      displayPitcherStats(pitcherMatchup.awayPitcher);
    } else {
      console.log(`⚠️ No away pitcher found for ${awayTeam}`);
    }
    
    console.log('--------------------------------------------------------');
    console.log('Test completed!');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// If game not found, we can try with manual team names
async function testPitcherMatchupManually(homeTeamName, awayTeamName) {
  try {
    console.log(`Getting pitcher matchup for: ${awayTeamName} @ ${homeTeamName}`);
    
    const pitcherMatchup = await ballDontLieService.getMlbPitcherMatchup(homeTeamName, awayTeamName);
    
    if (!pitcherMatchup) {
      console.log('⚠️ Failed to get pitcher matchup');
      return;
    }
    
    console.log('\n🏆 PITCHER MATCHUP RESULTS 🏆');
    console.log('--------------------------------------------------------');
    
    if (pitcherMatchup.homePitcher) {
      console.log(`HOME PITCHER (${homeTeamName}):`);
      displayPitcherStats(pitcherMatchup.homePitcher);
    } else {
      console.log(`⚠️ No home pitcher found for ${homeTeamName}`);
    }
    
    console.log('--------------------------------------------------------');
    
    if (pitcherMatchup.awayPitcher) {
      console.log(`AWAY PITCHER (${awayTeamName}):`);
      displayPitcherStats(pitcherMatchup.awayPitcher);
    } else {
      console.log(`⚠️ No away pitcher found for ${awayTeamName}`);
    }
    
    console.log('--------------------------------------------------------');
    console.log('Test completed!');
  } catch (error) {
    console.error('Error during manual test:', error);
  }
}

// Helper function to display pitcher stats
function displayPitcherStats(pitcher) {
  if (!pitcher) return;
  
  console.log(`Name: ${pitcher.full_name || 'Unknown'}`);
  
  if (pitcher.stats) {
    const stats = pitcher.stats;
    console.log(`ERA: ${stats.era?.toFixed(2) || 'N/A'}`);
    console.log(`Wins-Losses: ${stats.wins || 0}-${stats.losses || 0}`);
    console.log(`Innings Pitched: ${stats.innings_pitched?.toFixed(1) || 'N/A'}`);
    console.log(`Strikeouts: ${stats.strikeouts || 'N/A'}`);
    console.log(`WHIP: ${stats.whip?.toFixed(2) || 'N/A'}`);
    console.log(`BAA (Batting Average Against): ${stats.batting_average_against?.toFixed(3) || 'N/A'}`);
  } else {
    console.log('No statistics available for this pitcher');
  }
  
  console.log(`Confidence Score: ${pitcher.confidenceScore || 'N/A'}`);
}

// Run the test
testStartingPitchers();
