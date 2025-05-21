/**
 * Test script to diagnose and fix issues with the Ball Don't Lie service
 * Specifically focused on the getTeamByName function
 */
import { ballDontLieService } from './services/ballDontLieService.js';

// Test teams
const homeTeam = 'Milwaukee Brewers';
const awayTeam = 'Baltimore Orioles';

// Test function to check if a method exists
function methodExists(object, methodName) {
  return typeof object[methodName] === 'function';
}

async function testBallDontLieService() {
  console.log(`===== TESTING BALL DON'T LIE SERVICE FUNCTIONS =====`);
  
  // Check if key functions exist
  console.log('\n----- Checking function availability -----');
  console.log(`getTeamByName exists: ${methodExists(ballDontLieService, 'getTeamByName')}`);
  console.log(`getMlbTeamComparisonStats exists: ${methodExists(ballDontLieService, 'getMlbTeamComparisonStats')}`);
  console.log(`getComprehensiveMlbGameStats exists: ${methodExists(ballDontLieService, 'getComprehensiveMlbGameStats')}`);
  
  try {
    // Test getTeamByName function
    console.log('\n----- Testing getTeamByName function -----');
    const brewers = await ballDontLieService.getTeamByName(homeTeam);
    console.log(`Result for ${homeTeam}:`, brewers ? `Found: ${brewers.display_name} (ID: ${brewers.id})` : 'Not found');
    
    const orioles = await ballDontLieService.getTeamByName(awayTeam);
    console.log(`Result for ${awayTeam}:`, orioles ? `Found: ${orioles.display_name} (ID: ${orioles.id})` : 'Not found');
    
    // Test if it can be called with 'this' context
    console.log('\n----- Testing getMlbTeamComparisonStats function -----');
    if (methodExists(ballDontLieService, 'getMlbTeamComparisonStats')) {
      try {
        const comparison = await ballDontLieService.getMlbTeamComparisonStats(homeTeam, awayTeam);
        console.log(`Comparison result:`, comparison ? 'Success' : 'Failed');
      } catch (error) {
        console.error(`Error in getMlbTeamComparisonStats:`, error);
        console.log('\nStack trace:');
        console.log(error.stack);
      }
    }
    
  } catch (error) {
    console.error(`Error testing Ball Don't Lie service:`, error);
  }
}

// Run the test
testBallDontLieService();
