// Test specific functions to verify fixes
import dotenv from 'dotenv';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.test file
const envFile = './.env.test';
if (fs.existsSync(envFile)) {
  console.log(`Loading environment variables from ${envFile}`);
  dotenv.config({ path: envFile });
} else {
  console.warn(`Warning: ${envFile} not found. Using default values.`);
}

// Make sure environment variables are available
const require = createRequire(import.meta.url);

// Import services after environment variables are loaded
import { ballDontLieService } from './src/services/ballDontLieService.js';
import { sportsDbApiService } from './src/services/sportsDbApiService.js';
import { perplexityService } from './src/services/perplexityService.js';

// Date to test with
const testDate = '2023-11-15';

async function testFunctions() {
  try {
    console.log(`Testing functions with date: ${testDate}`);
    
    // Test ballDontLieService.getNbaGamesByDate
    console.log('\n--- Testing ballDontLieService.getNbaGamesByDate ---');
    try {
      const nbaGames = await ballDontLieService.getNbaGamesByDate(testDate);
      console.log(`Retrieved ${nbaGames?.length || 0} NBA games for ${testDate}`);
      if (nbaGames?.length > 0) {
        console.log('First game:', JSON.stringify(nbaGames[0], null, 2));
      }
    } catch (error) {
      console.error('Error testing ballDontLieService.getNbaGamesByDate:', error);
    }
    
    // Test sportsDbApiService.getEventsByDate 
    console.log('\n--- Testing sportsDbApiService.getEventsByDate ---');
    try {
      // Test with NBA league ID
      const nbaEvents = await sportsDbApiService.getEventsByDate(
        sportsDbApiService.leagueIds.NBA,
        testDate
      );
      console.log(`Retrieved events for NBA on ${testDate}`);
      console.log('NBA events:', nbaEvents);
    } catch (error) {
      console.error('Error testing sportsDbApiService.getEventsByDate:', error);
    }
    
    // Test perplexityService.getScoresFromPerplexity
    console.log('\n--- Testing perplexityService.getScoresFromPerplexity ---');
    try {
      // Test with sample teams
      const homeTeam = 'Lakers';
      const awayTeam = 'Celtics';
      const league = 'NBA';
      
      const perplexityResult = await perplexityService.getScoresFromPerplexity(
        homeTeam, 
        awayTeam,
        league,
        testDate
      );
      
      console.log('Perplexity result:', JSON.stringify(perplexityResult, null, 2));
    } catch (error) {
      console.error('Error testing perplexityService.getScoresFromPerplexity:', error);
    }
  } catch (error) {
    console.error('General error in test function:', error);
  }
}

// Run the test
testFunctions()
  .then(() => console.log('\nAll tests completed'))
  .catch(error => console.error('Error running tests:', error));
