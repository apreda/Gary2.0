// Test script for prop results service data parsing
import dotenv from 'dotenv';
import { propResultsService } from '../src/services/propResultsService.js';
import { apiSportsService } from '../src/services/apiSportsService.js';

// Load environment variables
dotenv.config();

// Mock player data to test parsing
const testParsing = async () => {
  try {
    console.log('Testing prop results stat parsing...');
    
    // Sample MLB data
    const mlbPlayerStats = {
      player: {
        firstname: "Test",
        lastname: "Player"
      },
      statistics: [{
        strikeouts: 5,
        hits: 2,
        runs: 1,
        homeruns: 1,
        rbi: 3
      }]
    };
    
    // Sample NBA data
    const nbaPlayerStats = {
      player: {
        firstname: "Test",
        lastname: "Player"
      },
      points: 25,
      rebounds: 10,
      assists: 8
    };
    
    // Test MLB stat parsing
    console.log('\n--- Testing MLB Stat Parsing ---');
    const strikeouts = propResultsService._extractStatFromPlayerStats(mlbPlayerStats, 'strikeouts', 'MLB');
    const hits = propResultsService._extractStatFromPlayerStats(mlbPlayerStats, 'hits', 'MLB');
    const homeruns = propResultsService._extractStatFromPlayerStats(mlbPlayerStats, 'homeruns', 'MLB');
    const rbis = propResultsService._extractStatFromPlayerStats(mlbPlayerStats, 'rbis', 'MLB');
    
    console.log('Strikeouts:', strikeouts);
    console.log('Hits:', hits);
    console.log('Home Runs:', homeruns);
    console.log('RBIs:', rbis);
    
    // Test NBA stat parsing
    console.log('\n--- Testing NBA Stat Parsing ---');
    const points = propResultsService._extractStatFromPlayerStats(nbaPlayerStats, 'points', 'NBA');
    const rebounds = propResultsService._extractStatFromPlayerStats(nbaPlayerStats, 'rebounds', 'NBA');
    const assists = propResultsService._extractStatFromPlayerStats(nbaPlayerStats, 'assists', 'NBA');
    const pra = propResultsService._extractStatFromPlayerStats(nbaPlayerStats, 'points+rebounds+assists', 'NBA');
    
    console.log('Points:', points);
    console.log('Rebounds:', rebounds);
    console.log('Assists:', assists);
    console.log('PRA:', pra);
    
    // Try to fetch a real player's stats if possible
    console.log('\n--- Testing Real API Call ---');
    try {
      const gameId = 132566; // You might need to replace this with a valid game ID
      const playerName = "Aaron Judge";
      const league = "MLB";
      
      const playerStats = await apiSportsService.getPlayerStatsForGame(gameId, playerName, league);
      console.log('Raw player stats from API:', JSON.stringify(playerStats, null, 2));
      
      if (playerStats) {
        const homeruns = propResultsService._extractStatFromPlayerStats(playerStats, 'homeruns', league);
        const hits = propResultsService._extractStatFromPlayerStats(playerStats, 'hits', league);
        
        console.log(`${playerName} home runs:`, homeruns);
        console.log(`${playerName} hits:`, hits);
      } else {
        console.log('No player stats found for real API call');
      }
    } catch (error) {
      console.log('Error in real API call test:', error.message);
    }
    
    console.log('\nParsing test completed!');
  } catch (error) {
    console.error('Error in testing:', error);
  }
};

// Run the test
testParsing();
