/**
 * Test script for the enhanced MLB picks generation service
 * This tests the improved generateEnhancedPicks function
 */

import { mlbPicksGenerationService } from './services/mlbPicksGenerationService.enhanced.js';
import dotenv from 'dotenv';
dotenv.config();

async function testEnhancedPicksGeneration() {
  console.log('🏆 TESTING ENHANCED MLB PICKS GENERATION 🏆');
  console.log('--------------------------------------------');
  
  try {
    console.log('Generating enhanced MLB picks...');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const result = await mlbPicksGenerationService.generateEnhancedPicks(today, 3);
    
    if (!result.success) {
      console.log(`Error: ${result.message}`);
      return;
    }
    
    console.log(`\nGenerated ${result.picks.length} picks for ${today}`);
    
    // Show detailed information for each pick
    result.picks.forEach((pick, index) => {
      console.log(`\n🎲 PICK ${index + 1}: ${pick.player}`);
      console.log('--------------------------------------------');
      console.log(`Bet: ${pick.prop} ${pick.line} ${pick.bet.toUpperCase()}`);
      console.log(`Team: ${pick.team}`);
      console.log(`Confidence: ${pick.confidence}/10`);
      console.log(`Odds: ${pick.odds}`);
      console.log(`Analysis: ${pick.analysis}`);
      console.log('--------------------------------------------');
    });
    
    // Show metadata
    console.log('\n📊 METADATA 📊');
    console.log('--------------------------------------------');
    console.log(`Date: ${result.metadata.date}`);
    console.log(`Total Games: ${result.metadata.numGames}`);
    console.log(`Games with Pitchers: ${result.metadata.numGamesWithPitchers}`);
    console.log(`Generated At: ${result.metadata.generatedAt}`);
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testEnhancedPicksGeneration();
