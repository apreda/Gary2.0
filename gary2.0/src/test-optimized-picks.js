/**
 * Test script to compare the optimized picks service with the original
 * Shows how the optimized service reduces redundant API calls and logging
 */
import { picksService } from './services/picksService.js';
import { optimizedPicksService } from './services/optimizedPicksService.js';

// Get command line arguments
const args = process.argv.slice(2);
const useOptimized = args.includes('--optimized') || args.includes('-o');
const verbose = args.includes('--verbose') || args.includes('-v');

// Set log level based on verbosity
if (useOptimized) {
  optimizedPicksService.setLogLevel(verbose ? 'DEBUG' : 'INFO');
}

async function runTest() {
  console.log('\n=======================================================');
  console.log(`RUNNING ${useOptimized ? 'OPTIMIZED' : 'ORIGINAL'} PICKS GENERATION`);
  console.log('=======================================================\n');
  
  const startTime = Date.now();
  
  try {
    // Use the appropriate service based on command line args
    if (useOptimized) {
      console.log('Using optimized picks service with reduced redundancy...\n');
      await optimizedPicksService.generateDailyPicks();
    } else {
      console.log('Using original picks service...\n');
      await picksService.generateDailyPicks();
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('\n=======================================================');
    console.log(`COMPLETED IN ${duration.toFixed(2)} SECONDS`);
    console.log('=======================================================\n');
    
  } catch (error) {
    console.error('Error running test:', error);
  }
}

// Run the test
runTest().catch(console.error);

/**
 * Usage:
 * 
 * Run original picks service:
 * node src/test-optimized-picks.js
 * 
 * Run optimized picks service:
 * node src/test-optimized-picks.js --optimized
 * 
 * Run with verbose logging:
 * node src/test-optimized-picks.js --optimized --verbose
 */
