/**
 * Test script for Perplexity service in normal picks generation
 * Focuses on diagnosing the error "Cannot read properties of undefined (reading 'getGamesForToday')"
 */

// Import only what we need to test
import { perplexityService } from './services/perplexityService.js';
import { sportsDataService } from './services/sportsDataService.js';

// Helper for pretty printing
const prettyPrint = (obj) => JSON.stringify(obj, null, 2);

async function testPerplexityService() {
  console.log('='.repeat(80));
  console.log('PERPLEXITY SERVICE TEST FOR NORMAL PICKS');
  console.log('='.repeat(80));
  
  try {
    // First, let's check if perplexityService is properly loaded
    console.log('TEST 1: Check Perplexity Service initialization');
    console.log('-'.repeat(50));
    
    if (!perplexityService) {
      console.error('✗ perplexityService is not defined');
      return;
    }
    
    console.log('perplexityService object methods:');
    Object.keys(perplexityService)
      .filter(key => typeof perplexityService[key] === 'function')
      .forEach(method => console.log(`- ${method}`));
    
    try {
      await perplexityService.initialize();
      console.log('✓ Perplexity Service initialized successfully');
    } catch (error) {
      console.error('✗ Perplexity Service initialization failed:', error);
    }
    
    // Test sportsDataService which is being referenced
    console.log('\nTEST 2: Check sportsDataService');
    console.log('-'.repeat(50));
    
    if (!sportsDataService) {
      console.error('✗ sportsDataService is not defined');
    } else {
      console.log('sportsDataService object methods:');
      Object.keys(sportsDataService)
        .filter(key => typeof sportsDataService[key] === 'function')
        .forEach(method => console.log(`- ${method}`));
      
      // Check for the specific method that's causing the error
      if (typeof sportsDataService.getGamesForToday !== 'function') {
        console.error('✗ sportsDataService.getGamesForToday is not a function');
        
        // Look for similar methods
        const similarMethods = Object.keys(sportsDataService)
          .filter(key => 
            typeof sportsDataService[key] === 'function' && 
            key.toLowerCase().includes('game')
          );
        
        if (similarMethods.length > 0) {
          console.log('Similar methods found that might be used instead:');
          similarMethods.forEach(method => console.log(`- ${method}`));
        }
      } else {
        console.log('✓ sportsDataService.getGamesForToday exists');
        
        // Try calling the method to see if it works
        try {
          const games = await sportsDataService.getGamesForToday('MLB');
          console.log(`Retrieved ${games?.length || 0} games for today`);
          if (games && games.length > 0) {
            console.log('Sample game:', prettyPrint(games[0]));
          }
        } catch (error) {
          console.error('✗ Error calling getGamesForToday:', error.message);
        }
      }
    }
    
    // Test the specific method that's throwing the error
    console.log('\nTEST 3: Test getGameTimeAndHeadlines method');
    console.log('-'.repeat(50));
    
    if (typeof perplexityService.getGameTimeAndHeadlines !== 'function') {
      console.error('✗ perplexityService.getGameTimeAndHeadlines is not a function');
    } else {
      console.log('✓ perplexityService.getGameTimeAndHeadlines exists');
      
      // Look at the implementation
      console.log('\nLooking at the implementation to diagnose the error:');
      try {
        // Test with some sample teams
        const testTeams = ['Baltimore Orioles', 'Milwaukee Brewers'];
        console.log(`Testing getGameTimeAndHeadlines for ${testTeams[0]} @ ${testTeams[1]}`);
        
        const headlines = await perplexityService.getGameTimeAndHeadlines(testTeams[0], testTeams[1], 'MLB');
        console.log('Headlines result:', prettyPrint(headlines));
      } catch (error) {
        console.error(`✗ Error in getGameTimeAndHeadlines: ${error.message}`);
        console.error(error.stack);
        
        console.log('\nDiagnosing the error:');
        console.log('The error "Cannot read properties of undefined (reading \'getGamesForToday\')" suggests:');
        console.log('1. sportsDataService might be undefined within perplexityService');
        console.log('2. Or the getGamesForToday method is being accessed incorrectly');
        console.log('3. Or there\'s a circular dependency issue');
      }
    }
    
    console.log('\nALL TESTS COMPLETED');
  } catch (error) {
    console.error('UNHANDLED TEST ERROR:', error);
    console.error(error.stack);
  }
}

// Run the test script
testPerplexityService().catch(err => {
  console.error('Unhandled error in test script:', err);
});
