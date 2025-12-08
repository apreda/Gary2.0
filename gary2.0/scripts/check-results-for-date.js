#!/usr/bin/env node
/**
 * Script to check game results for a specific date
 * Usage: node scripts/check-results-for-date.js [YYYY-MM-DD]
 * Defaults to yesterday if no date provided
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get date from command line or use yesterday
const getTargetDate = () => {
  const args = process.argv.slice(2);
  if (args.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
    return args[0];
  }
  // Use local date instead of UTC to avoid timezone issues
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

async function checkPicksForDate(dateStr) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📅 Checking picks for date: ${dateStr}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Check daily_picks table
  console.log('📋 Fetching daily picks...');
  const { data: dailyPicks, error: dailyError } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', dateStr);

  if (dailyError) {
    console.error('Error fetching daily picks:', dailyError.message);
    return;
  }

  if (!dailyPicks || dailyPicks.length === 0) {
    console.log(`❌ No daily picks found for ${dateStr}`);
  } else {
    console.log(`✅ Found ${dailyPicks.length} daily pick record(s):`);
    for (const row of dailyPicks) {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
      console.log(`   - Record ID: ${row.id}`);
      console.log(`   - Number of picks: ${picks?.length || 0}`);
      if (picks && picks.length > 0) {
        console.log(`   - Picks preview:`);
        picks.slice(0, 5).forEach((pick, i) => {
          console.log(`     ${i + 1}. ${pick.pick || pick.originalPick || JSON.stringify(pick).slice(0, 80)}`);
        });
        if (picks.length > 5) {
          console.log(`     ... and ${picks.length - 5} more picks`);
        }
      }
    }
  }

  // 2. Check prop_picks table
  console.log('\n📋 Fetching prop picks...');
  const { data: propPicks, error: propError } = await supabase
    .from('prop_picks')
    .select('*')
    .eq('date', dateStr);

  if (propError) {
    console.error('Error fetching prop picks:', propError.message);
  } else if (!propPicks || propPicks.length === 0) {
    console.log(`❌ No prop picks found for ${dateStr}`);
  } else {
    console.log(`✅ Found ${propPicks.length} prop pick record(s):`);
    for (const row of propPicks) {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
      console.log(`   - Record ID: ${row.id}`);
      console.log(`   - Number of props: ${picks?.length || 0}`);
    }
  }

  // 3. Check existing game_results for this date
  console.log('\n📊 Checking existing game results...');
  const { data: gameResults, error: gameResultsError } = await supabase
    .from('game_results')
    .select('*')
    .eq('game_date', dateStr);

  if (gameResultsError) {
    console.error('Error fetching game results:', gameResultsError.message);
  } else if (!gameResults || gameResults.length === 0) {
    console.log(`❌ No game results found for ${dateStr} (results need to be checked)`);
  } else {
    console.log(`✅ Found ${gameResults.length} game result(s):`);
    const won = gameResults.filter(r => r.result === 'won').length;
    const lost = gameResults.filter(r => r.result === 'lost').length;
    const push = gameResults.filter(r => r.result === 'push').length;
    console.log(`   📈 Record: ${won}-${lost}${push > 0 ? `-${push}` : ''}`);
    gameResults.forEach(r => {
      console.log(`   - ${r.pick_text || r.matchup}: ${r.result?.toUpperCase()} (${r.final_score})`);
    });
  }

  // 4. Check existing prop_results for this date
  console.log('\n📊 Checking existing prop results...');
  const { data: propResults, error: propResultsError } = await supabase
    .from('prop_results')
    .select('*')
    .eq('game_date', dateStr);

  if (propResultsError) {
    console.error('Error fetching prop results:', propResultsError.message);
  } else if (!propResults || propResults.length === 0) {
    console.log(`❌ No prop results found for ${dateStr} (results need to be checked)`);
  } else {
    console.log(`✅ Found ${propResults.length} prop result(s):`);
    const propWon = propResults.filter(r => r.result === 'won').length;
    const propLost = propResults.filter(r => r.result === 'lost').length;
    const propPush = propResults.filter(r => r.result === 'push').length;
    console.log(`   📈 Record: ${propWon}-${propLost}${propPush > 0 ? `-${propPush}` : ''}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  
  // Return summary
  return {
    date: dateStr,
    hasDailyPicks: dailyPicks && dailyPicks.length > 0,
    hasPropPicks: propPicks && propPicks.length > 0,
    hasGameResults: gameResults && gameResults.length > 0,
    hasPropResults: propResults && propResults.length > 0,
    dailyPicksCount: dailyPicks?.reduce((acc, row) => {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
      return acc + (picks?.length || 0);
    }, 0) || 0,
    propPicksCount: propPicks?.reduce((acc, row) => {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
      return acc + (picks?.length || 0);
    }, 0) || 0,
    gameResultsCount: gameResults?.length || 0,
    propResultsCount: propResults?.length || 0,
    gameRecord: gameResults ? {
      won: gameResults.filter(r => r.result === 'won').length,
      lost: gameResults.filter(r => r.result === 'lost').length,
      push: gameResults.filter(r => r.result === 'push').length
    } : null
  };
}

// Run the check
const dateStr = getTargetDate();
checkPicksForDate(dateStr)
  .then(summary => {
    console.log('\n📋 SUMMARY:');
    console.log(JSON.stringify(summary, null, 2));
    
    if (summary.hasDailyPicks && !summary.hasGameResults) {
      console.log('\n⚠️  You have picks but no results! Run the results checker:');
      console.log(`   curl "https://betwithgary.ai/api/check-results?date=${dateStr}"`);
      console.log('   OR use the ResultsAdmin page in the app');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });

