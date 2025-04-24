/**
 * Test script to verify picksService generates picks correctly
 */
import { picksService } from '../services/picksService.js';
import { supabase, ensureAnonymousSession } from '../supabaseClient.js';

async function testPicksGeneration() {
  console.log('Testing picks generation...');
  try {
    // Ensure we have a valid session for Supabase operations
    await ensureAnonymousSession();
    
    // Generate picks
    console.log('Attempting to generate daily picks...');
    const picks = await picksService.generateDailyPicks();
    
    console.log(`✅ SUCCESS! Generated ${picks.length} picks`);
    console.log('First pick:', JSON.stringify(picks[0], null, 2));
    
    return picks;
  } catch (error) {
    console.error('❌ ERROR generating picks:', error);
    throw error;
  }
}

// Run the test
testPicksGeneration()
  .then(picks => {
    console.log('Test completed successfully with picks:', picks.length);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
  });
