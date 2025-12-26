#!/usr/bin/env node
/**
 * Manual Results Recording Script for December 25, 2025
 * Records NBA and NFL game results for Christmas Day picks
 * 
 * Usage: node scripts/record-christmas-results.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Please check your .env file.');
  process.exit(1);
}

console.log(`Using ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON'} key`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const DATE_STR = '2025-12-25';

// Christmas Day 2025 NBA Results
const NBA_RESULTS = [
  {
    pick_text: 'San Antonio Spurs +9.5 -110',
    matchup: 'San Antonio Spurs @ Oklahoma City Thunder',
    league: 'NBA',
    result: 'won',
    final_score: '117-102', // Spurs won outright!
    away_score: 117,
    home_score: 102
  },
  {
    pick_text: 'Timberwolves ML +120',
    matchup: 'Minnesota Timberwolves @ Denver Nuggets',
    league: 'NBA',
    result: 'lost',
    final_score: '138-142', // OT loss
    away_score: 138,
    home_score: 142
  },
  {
    pick_text: 'Knicks -5.5 -112',
    matchup: 'Cleveland Cavaliers @ New York Knicks',
    league: 'NBA',
    result: 'lost',
    final_score: '124-126', // Won by 2, needed 6+
    away_score: 124,
    home_score: 126
  },
  {
    pick_text: 'Houston Rockets ML -135',
    matchup: 'Houston Rockets @ Los Angeles Lakers',
    league: 'NBA',
    result: 'won',
    final_score: '119-96',
    away_score: 119,
    home_score: 96
  },
  {
    pick_text: 'Golden State Warriors -8.5 -105',
    matchup: 'Dallas Mavericks @ Golden State Warriors',
    league: 'NBA',
    result: 'won',
    final_score: '116-126', // Won by 10, covered -8.5
    away_score: 116,
    home_score: 126
  }
];

// Christmas Day 2025 NFL Results
const NFL_RESULTS = [
  {
    pick_text: 'Cowboys -8.5 -112',
    matchup: 'Dallas Cowboys @ Washington Commanders',
    home_team: 'Washington Commanders',
    away_team: 'Dallas Cowboys',
    result: 'lost',
    final_score: '30-23', // Won by 7, needed 9+
    away_score: 30,
    home_score: 23,
    week_number: 17,
    season: 2025
  },
  {
    pick_text: 'Detroit Lions -7.5 -120',
    matchup: 'Detroit Lions @ Minnesota Vikings',
    home_team: 'Minnesota Vikings',
    away_team: 'Detroit Lions',
    result: 'lost',
    final_score: '10-23', // Lost by 13
    away_score: 10,
    home_score: 23,
    week_number: 17,
    season: 2025
  },
  {
    pick_text: 'Denver Broncos -13.5 -105',
    matchup: 'Denver Broncos @ Kansas City Chiefs',
    home_team: 'Kansas City Chiefs',
    away_team: 'Denver Broncos',
    result: 'lost',
    final_score: '20-13', // Won by 7, needed 14+
    away_score: 20,
    home_score: 13,
    week_number: 17,
    season: 2025
  }
];

/**
 * Record NBA game results to game_results table
 */
async function recordNBAResults() {
  console.log('\n🏀 Recording NBA Results...');
  
  // Get the daily picks row for this date
  const { data: dailyPicksRow, error: picksError } = await supabase
    .from('daily_picks')
    .select('id')
    .eq('date', DATE_STR)
    .single();
  
  if (picksError) {
    console.log(`  ⚠️ Could not find daily_picks row: ${picksError.message}`);
  }
  
  const pickId = dailyPicksRow?.id || null;
  
  let won = 0, lost = 0;
  
  for (const result of NBA_RESULTS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('game_results')
      .select('id')
      .eq('pick_text', result.pick_text)
      .eq('game_date', DATE_STR)
      .single();
    
    if (existing) {
      console.log(`  ⏭️  Already recorded: ${result.pick_text}`);
      continue;
    }
    
    const emoji = result.result === 'won' ? '✅' : '❌';
    console.log(`  ${emoji} ${result.pick_text} - ${result.result.toUpperCase()}`);
    console.log(`     Score: ${result.final_score}`);
    
    const { error: insertError } = await supabase
      .from('game_results')
      .insert({
        pick_id: pickId,
        game_date: DATE_STR,
        league: result.league,
        result: result.result,
        final_score: result.final_score,
        pick_text: result.pick_text,
        matchup: result.matchup,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.log(`  ⚠️ DB Error: ${insertError.message}`);
      continue;
    }
    
    if (result.result === 'won') won++;
    else lost++;
  }
  
  console.log(`\n  NBA Summary: ${won}-${lost}`);
  return { won, lost };
}

/**
 * Record NFL game results to nfl_results table
 */
async function recordNFLResults() {
  console.log('\n🏈 Recording NFL Results...');
  
  // Get the weekly NFL picks row for this week
  const weekStart = '2025-12-22'; // Monday of Week 17
  const { data: nflPicksRow, error: picksError } = await supabase
    .from('weekly_nfl_picks')
    .select('id')
    .eq('week_start', weekStart)
    .single();
  
  if (picksError) {
    console.log(`  ⚠️ Could not find weekly_nfl_picks row: ${picksError.message}`);
  }
  
  const nflPickId = nflPicksRow?.id || null;
  
  let won = 0, lost = 0;
  
  for (const result of NFL_RESULTS) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('nfl_results')
      .select('id')
      .eq('pick_text', result.pick_text)
      .eq('game_date', DATE_STR)
      .single();
    
    if (existing) {
      console.log(`  ⏭️  Already recorded: ${result.pick_text}`);
      continue;
    }
    
    const emoji = result.result === 'won' ? '✅' : '❌';
    console.log(`  ${emoji} ${result.pick_text} - ${result.result.toUpperCase()}`);
    console.log(`     ${result.matchup}: ${result.final_score}`);
    
    const { error: insertError } = await supabase
      .from('nfl_results')
      .insert({
        nfl_pick_id: nflPickId,
        game_date: DATE_STR,
        week_number: result.week_number,
        season: result.season,
        result: result.result,
        final_score: result.final_score,
        pick_text: result.pick_text,
        matchup: result.matchup,
        home_team: result.home_team,
        away_team: result.away_team,
        home_score: result.home_score,
        away_score: result.away_score,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.log(`  ⚠️ DB Error: ${insertError.message}`);
      continue;
    }
    
    if (result.result === 'won') won++;
    else lost++;
  }
  
  console.log(`\n  NFL Summary: ${won}-${lost}`);
  return { won, lost };
}

/**
 * Main function
 */
async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎄 Recording Christmas Day Results (${DATE_STR})`);
  console.log(`${'='.repeat(60)}`);
  
  const nbaResults = await recordNBAResults();
  const nflResults = await recordNFLResults();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 FINAL SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n  🏀 NBA: ${nbaResults.won}-${nbaResults.lost}`);
  console.log(`  🏈 NFL: ${nflResults.won}-${nflResults.lost}`);
  console.log(`  📈 Total: ${nbaResults.won + nflResults.won}-${nbaResults.lost + nflResults.lost}`);
  console.log(`\n${'='.repeat(60)}\n`);
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
