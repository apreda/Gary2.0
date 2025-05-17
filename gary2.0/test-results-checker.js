// Test script for results checker
import { resultsCheckerService } from './src/services/resultsCheckerService.js';
// Import the required dependencies
import { supabase } from './src/supabaseClient.js';
import { ballDontLieService } from './src/services/ballDontLieService.js';
import { sportsDbApiService } from './src/services/sportsDbApiService.js';
import { perplexityService } from './src/services/perplexityService.js';
import { garyPerformanceService } from './src/services/garyPerformanceService.js';

// Use a recent date that should have game results
const date = '2023-11-15'; // Example date - adjust as needed

console.log(`Testing results checker for date: ${date}`);

async function testResultsChecker() {
  try {
    console.log('Starting test...');
    const results = await resultsCheckerService.checkResults(date);
    console.log('Results:', JSON.stringify(results, null, 2));
    return results;
  } catch (error) {
    console.error('Error in test:', error);
    return { success: false, error: error.message, stack: error.stack };
  }
}

testResultsChecker()
  .then(() => console.log('Test complete'))
  .catch(err => console.error('Test failed:', err));
