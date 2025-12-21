#!/usr/bin/env node
/**
 * Combined Daily Results Script
 * Runs both game results (daily_picks, weekly_nfl_picks) and prop results
 * 
 * Usage: 
 *   node scripts/run-daily-results.js [YYYY-MM-DD]
 *   Defaults to yesterday if no date provided
 * 
 * This script is meant to be run daily via cron/launchd at 6:45am EST (11:45 UTC)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get date from command line or use yesterday
const getTargetDate = () => {
  const args = process.argv.slice(2);
  if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    return args[0];
  }
  // Use local date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const runScript = (scriptPath, args = []) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      env: process.env
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
};

async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🎯 GARY 2.0 DAILY RESULTS PROCESSOR`);
  console.log(`📅 Processing results for: ${dateStr}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(70)}\n`);
  
  try {
    // Step 1: Run game results (daily_picks + weekly_nfl_picks)
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📊 STEP 1: Processing Game Results`);
    console.log(`${'─'.repeat(70)}\n`);
    
    await runScript(path.join(__dirname, 'run-results-for-date.js'), [dateStr]);
    
    // Step 2: Run prop results
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🎲 STEP 2: Processing Prop Results`);
    console.log(`${'─'.repeat(70)}\n`);
    
    await runScript(path.join(__dirname, 'run-prop-results-for-date.js'), [dateStr]);
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`✅ ALL DAILY RESULTS PROCESSED SUCCESSFULLY`);
    console.log(`⏰ Completed at: ${new Date().toLocaleString()}`);
    console.log(`${'═'.repeat(70)}\n`);
    
  } catch (error) {
    console.error(`\n❌ Error running daily results: ${error.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
