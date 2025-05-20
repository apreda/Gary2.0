/**
 * Test script for the updated MLB Stats API Lookup Service
 * Used to verify the functionality of the player search endpoint
 */

import { mlbStatsApiService } from '../services/mlbStatsApiService.js';

// List of player names to test
const testPlayers = [
  'Juan Soto',
  'Mike Trout',
  'Shohei Ohtani',
  'Bryce Harper',
  'Aaron Judge',
  'Fernando Tatis Jr.',
  'Max Scherzer',
  'Mookie Betts',
  'Vladimir Guerrero Jr.',
  'Clayton Kershaw'
];

async function testPlayerSearch() {
  console.log('Testing MLB Stats API Lookup Service...');
  console.log('========================================');
  
  const results = [];
  
  for (const playerName of testPlayers) {
    console.log(`\nSearching for player: ${playerName}`);
    
    try {
      // Use our updated getPlayerId function
      const playerId = await mlbStatsApiService.getPlayerId(playerName);
      
      if (playerId) {
        console.log(`✅ Found player ID: ${playerId} for ${playerName}`);
        results.push({ playerName, playerId, success: true });
      } else {
        console.log(`❌ Failed to find player ID for ${playerName}`);
        results.push({ playerName, playerId: null, success: false });
      }
    } catch (error) {
      console.error(`❌ Error searching for ${playerName}:`, error.message);
      results.push({ playerName, playerId: null, success: false, error: error.message });
    }
  }
  
  // Print summary
  console.log('\n\nTEST SUMMARY:');
  console.log('=============');
  console.log(`Total tests: ${testPlayers.length}`);
  console.log(`Successful lookups: ${results.filter(r => r.success).length}`);
  console.log(`Failed lookups: ${results.filter(r => !r.success).length}`);
  
  console.log('\nDetailed results:');
  console.table(results);
}

// Run the test
testPlayerSearch().catch(error => {
  console.error('Test failed with error:', error);
});
