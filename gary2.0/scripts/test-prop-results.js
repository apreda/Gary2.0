/**
 * Test script for prop results processing
 * Run with: node scripts/test-prop-results.js YYYY-MM-DD
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { propResultsService } from '../src/services/propResultsService.js';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testPropResults() {
  try {
    // Get date from command line args or use today
    const dateArg = process.argv[2];
    const date = dateArg || new Date().toISOString().split('T')[0];
    
    console.log(`Testing prop results processing for date: ${date}`);
    
    // Check prop results
    const results = await propResultsService.checkPropResults(date);
    
    // Print results
    console.log('Results:');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

// Run the test
testPropResults();
