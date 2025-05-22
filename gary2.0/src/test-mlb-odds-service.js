/**
 * Test script to verify Odds Service for MLB, NBA and NHL games
 */
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Patch configLoader directly to avoid import.meta issues in Node.js
if (process.env.VITE_ODDS_API_KEY) {
  process.env.ODDS_API_KEY = process.env.VITE_ODDS_API_KEY;
  console.log(`Setting Odds API key from environment: ${process.env.ODDS_API_KEY.substring(0, 4)}...`);
}

// Now import the services
import { oddsService } from './services/oddsService.js';

// Already set the API key above

async function testOddsService() {
  console.log('Testing Odds Service for multiple sports...');
  
  // Test MLB
  console.log('\n===== Testing MLB Odds =====');
  try {
    const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
    console.log(`Retrieved ${mlbGames.length} MLB games`);
    if (mlbGames.length > 0) {
      console.log('First MLB game example:');
      console.log(`- ${mlbGames[0].away_team} @ ${mlbGames[0].home_team}`);
      console.log(`- Has bookmakers: ${mlbGames[0].bookmakers && mlbGames[0].bookmakers.length > 0 ? 'Yes' : 'No'}`);
      console.log(`- Best bet available: ${mlbGames[0].bestBet ? 'Yes' : 'No'}`);
    } else {
      console.log('No MLB games found! This could indicate an issue.');
    }
  } catch (error) {
    console.error('Error testing MLB odds:', error);
  }
  
  // Test NBA
  console.log('\n===== Testing NBA Odds =====');
  try {
    const nbaGames = await oddsService.getUpcomingGames('basketball_nba');
    console.log(`Retrieved ${nbaGames.length} NBA games`);
    if (nbaGames.length > 0) {
      console.log('First NBA game example:');
      console.log(`- ${nbaGames[0].away_team} @ ${nbaGames[0].home_team}`);
      console.log(`- Has bookmakers: ${nbaGames[0].bookmakers && nbaGames[0].bookmakers.length > 0 ? 'Yes' : 'No'}`);
      console.log(`- Best bet available: ${nbaGames[0].bestBet ? 'Yes' : 'No'}`);
    } else {
      console.log('No NBA games found!');
    }
  } catch (error) {
    console.error('Error testing NBA odds:', error);
  }
  
  // Test NHL
  console.log('\n===== Testing NHL Odds =====');
  try {
    const nhlGames = await oddsService.getUpcomingGames('icehockey_nhl');
    console.log(`Retrieved ${nhlGames.length} NHL games`);
    if (nhlGames.length > 0) {
      console.log('First NHL game example:');
      console.log(`- ${nhlGames[0].away_team} @ ${nhlGames[0].home_team}`);
      console.log(`- Has bookmakers: ${nhlGames[0].bookmakers && nhlGames[0].bookmakers.length > 0 ? 'Yes' : 'No'}`);
      console.log(`- Best bet available: ${nhlGames[0].bestBet ? 'Yes' : 'No'}`);
    } else {
      console.log('No NHL games found!');
    }
  } catch (error) {
    console.error('Error testing NHL odds:', error);
  }
}

// Run the test
testOddsService();
