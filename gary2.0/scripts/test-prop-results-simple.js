/**
 * Simple test script for prop results processing
 * Run with: node scripts/test-prop-results-simple.js YYYY-MM-DD
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file manually
function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), 'gary2.0/.env');
    console.log('Loading env from:', envPath);
    
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envVars = {};
      
      // Parse each line in the .env file
      envContent.split('\n').forEach(line => {
        // Skip comments and empty lines
        if (line.trim() && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          // Handle values that might contain = characters
          const value = valueParts.join('=').trim();
          // Remove quotes if present
          const cleanedValue = value.replace(/^['"](.+)['"]$/, '$1');
          
          envVars[key.trim()] = cleanedValue;
          process.env[key.trim()] = cleanedValue;
        }
      });
      
      return envVars;
    } else {
      console.warn('.env file not found at:', envPath);
      return {};
    }
  } catch (error) {
    console.error('Error loading .env file:', error);
    return {};
  }
}

// Load environment variables
const envVars = loadEnvFile();

// Get Supabase credentials
const SUPABASE_URL = envVars.VITE_SUPABASE_URL || 'https://xuttubsfgdcjfgmskcol.supabase.co';
const SUPABASE_KEY = envVars.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('Using Supabase URL:', SUPABASE_URL);
console.log('Supabase key available:', SUPABASE_KEY ? 'Yes' : 'No');

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Determine if a prop bet won, lost, or pushed
function determineResult(actualValue, propLine, direction) {
  if (actualValue === null || actualValue === undefined) return 'pending';
  
  const numValue = Number(actualValue);
  const numLine = Number(propLine);
  
  if (isNaN(numValue) || isNaN(numLine)) return 'pending';
  
  // For over bets: win if actual > line, lose if actual < line, push if equal
  if (direction.toLowerCase() === 'over') {
    return numValue > numLine ? 'won' : numValue < numLine ? 'lost' : 'push';
  } 
  // For under bets: win if actual < line, lose if actual > line, push if equal
  else if (direction.toLowerCase() === 'under') {
    return numValue < numLine ? 'won' : numValue > numLine ? 'lost' : 'push';
  }
  
  // Default if direction is unrecognized
  return 'pending';
}

async function testPropResults() {
  try {
    // Get date from command line args or use today
    const dateArg = process.argv[2];
    const date = dateArg || new Date().toISOString().split('T')[0];
    
    console.log(`Testing prop results processing for date: ${date}`);
    
    // Step 1: Fetch Prop Picks for the Day
    const { data, error: propPicksError } = await supabase
      .from('prop_picks')
      .select('*')
      .eq('date', date);
    
    if (propPicksError) {
      throw new Error(`Error fetching prop picks: ${propPicksError.message}`);
    }
    
    const propPicks = data || [];
    
    if (propPicks.length === 0) {
      console.log(`No prop picks found for ${date}`);
      process.exit(0);
    }
    
    console.log(`Found ${propPicks.length} prop picks for ${date}`);
    
    // Track results
    const processed = [];
    const failed = [];
    
    // Simulate processing each pick
    for (const propPick of propPicks) {
      try {
        // Extract data from prop pick
        const { 
          id,
          player_name, 
          team, 
          sport, 
          prop_type, 
          line, 
          bet, 
          odds, 
          matchup, 
          pick
        } = propPick;
        
        console.log(`Processing prop pick for ${player_name}: ${prop_type} ${line} ${bet}`);
        
        // Simulate getting player's actual stat (in a real scenario this would call an API)
        // For this test, we'll just use a random number
        const actualStat = Math.random() * 10;
        console.log(`Simulated ${prop_type} stat for ${player_name}: ${actualStat.toFixed(1)}`);
        
        // Determine prop result (won/lost/push)
        const result = determineResult(actualStat, line, bet);
        console.log(`Result for ${player_name} ${prop_type}: ${result}`);
        
        // Simulate inserting results (in a real case this would update the database)
        // Just log it instead
        processed.push({
          id,
          player: player_name,
          prop: prop_type,
          line,
          bet,
          actual: actualStat,
          result
        });
        
      } catch (error) {
        console.error(`Error processing prop pick:`, error);
        failed.push({
          id: propPick.id,
          player: propPick.player_name || 'Unknown player',
          reason: error.message
        });
      }
    }
    
    const successMessage = `Success: Results checked and simulated: ${processed.length}/${propPicks.length} picks processed`;
    console.log(successMessage);
    
    // Print results
    console.log('Processed Picks:');
    console.log(JSON.stringify(processed, null, 2));
    
    if (failed.length > 0) {
      console.log('Failed Picks:');
      console.log(JSON.stringify(failed, null, 2));
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error running test:', error);
    process.exit(1);
  }
}

// Run the test
testPropResults();
