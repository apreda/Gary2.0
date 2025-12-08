#!/usr/bin/env node
/**
 * Manual Results Recording Script
 * 
 * This script records game and prop results for a specific date.
 * Use this when the automated results checking hasn't run.
 * 
 * Usage: node scripts/record-results-manual.js [YYYY-MM-DD]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local') }); // Also load .env.local for service role key

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
// Use service role key to bypass RLS policies
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

// December 4, 2025 NBA game scores (manually verified from ESPN)
const KNOWN_SCORES = {
  '2025-12-04': {
    games: {
      // Format: 'Away Team @ Home Team' => { awayScore, homeScore }
      'Boston Celtics @ Washington Wizards': { awayScore: 146, homeScore: 101 },
      'Golden State Warriors @ Philadelphia 76ers': { awayScore: 98, homeScore: 99 },
      'Utah Jazz @ Brooklyn Nets': { awayScore: 123, homeScore: 110 },
      'Los Angeles Lakers @ Toronto Raptors': { awayScore: 123, homeScore: 120 },
      'Minnesota Timberwolves @ New Orleans Pelicans': { awayScore: 125, homeScore: 116 },
    }
  }
};

/**
 * Grade a spread pick based on final score
 */
function gradeSpreadPick(pick, awayScore, homeScore) {
  // Extract spread value from pick text
  const spreadMatch = pick.pick.match(/([+-]?\d+\.?\d*)/);
  if (!spreadMatch) {
    console.error(`Could not extract spread from pick: ${pick.pick}`);
    return null;
  }
  
  const spread = parseFloat(spreadMatch[1]);
  const isHomePick = pick.pick.toLowerCase().includes(pick.homeTeam.toLowerCase());
  
  let adjustedScore;
  let opponentScore;
  
  if (isHomePick) {
    adjustedScore = homeScore + spread;
    opponentScore = awayScore;
  } else {
    adjustedScore = awayScore + spread;
    opponentScore = homeScore;
  }
  
  if (adjustedScore > opponentScore) return 'won';
  if (adjustedScore < opponentScore) return 'lost';
  return 'push';
}

/**
 * Grade a moneyline pick based on final score
 */
function gradeMoneylinePick(pick, awayScore, homeScore) {
  const isHomePick = pick.pick.toLowerCase().includes(pick.homeTeam.toLowerCase());
  const homeWins = homeScore > awayScore;
  
  if (isHomePick) {
    return homeWins ? 'won' : 'lost';
  } else {
    return !homeWins ? 'won' : 'lost';
  }
}

/**
 * Record game results for a date
 */
async function recordGameResults(dateStr) {
  console.log(`\n📊 Recording game results for ${dateStr}...`);
  
  // Check if we have known scores for this date
  const dateScores = KNOWN_SCORES[dateStr];
  if (!dateScores) {
    console.log(`❌ No known scores for ${dateStr}. Add them to KNOWN_SCORES in the script.`);
    return { success: false, message: 'No known scores' };
  }
  
  // Get the daily picks for this date
  const { data: dailyPicksRow, error: picksError } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', dateStr)
    .single();
  
  if (picksError || !dailyPicksRow) {
    console.log(`❌ No daily picks found for ${dateStr}`);
    return { success: false, message: 'No picks found' };
  }
  
  const picks = typeof dailyPicksRow.picks === 'string' 
    ? JSON.parse(dailyPicksRow.picks) 
    : dailyPicksRow.picks;
  
  console.log(`Found ${picks.length} picks to grade...`);
  
  // Check for existing results
  const { data: existingResults } = await supabase
    .from('game_results')
    .select('id, pick_text')
    .eq('game_date', dateStr);
  
  const existingPickTexts = new Set((existingResults || []).map(r => r.pick_text));
  
  const results = {
    processed: 0,
    won: 0,
    lost: 0,
    push: 0,
    skipped: 0,
    errors: []
  };
  
  for (const pick of picks) {
    // Skip if already recorded
    if (existingPickTexts.has(pick.pick)) {
      console.log(`⏭️  Skipping (already recorded): ${pick.pick}`);
      results.skipped++;
      continue;
    }
    
    // Find matching game in known scores
    const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;
    const gameScore = dateScores.games[matchup];
    
    if (!gameScore) {
      console.log(`⚠️  No score found for matchup: ${matchup}`);
      results.errors.push(`No score for: ${matchup}`);
      continue;
    }
    
    // Grade the pick
    let result;
    if (pick.type === 'spread' || pick.pick.match(/[+-]\d/)) {
      result = gradeSpreadPick(pick, gameScore.awayScore, gameScore.homeScore);
    } else if (pick.type === 'moneyline' || pick.pick.includes('ML')) {
      result = gradeMoneylinePick(pick, gameScore.awayScore, gameScore.homeScore);
    } else {
      // Default to spread if unclear
      result = gradeSpreadPick(pick, gameScore.awayScore, gameScore.homeScore);
    }
    
    if (!result) {
      results.errors.push(`Could not grade: ${pick.pick}`);
      continue;
    }
    
    const finalScore = `${gameScore.awayScore}-${gameScore.homeScore}`;
    
    console.log(`${result === 'won' ? '✅' : result === 'push' ? '🟡' : '❌'} ${pick.pick}`);
    console.log(`   Score: ${finalScore} | Result: ${result.toUpperCase()}`);
    
    // Insert into game_results
    const { error: insertError } = await supabase
      .from('game_results')
      .insert({
        pick_id: dailyPicksRow.id,
        game_date: dateStr,
        league: pick.league || 'NBA',
        result: result,
        final_score: finalScore,
        pick_text: pick.pick,
        matchup: matchup,
        confidence: pick.confidence,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (insertError) {
      console.error(`   Error inserting result: ${insertError.message}`);
      results.errors.push(`Insert error: ${insertError.message}`);
      continue;
    }
    
    results.processed++;
    results[result]++;
  }
  
  console.log(`\n📈 Game Results Summary:`);
  console.log(`   Processed: ${results.processed}`);
  console.log(`   Won: ${results.won}`);
  console.log(`   Lost: ${results.lost}`);
  console.log(`   Push: ${results.push}`);
  console.log(`   Skipped: ${results.skipped}`);
  if (results.errors.length > 0) {
    console.log(`   Errors: ${results.errors.length}`);
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const dateStr = getTargetDate();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 Manual Results Recording`);
  console.log(`📅 Date: ${dateStr}`);
  console.log(`${'='.repeat(60)}`);
  
  // Record game results
  const gameResults = await recordGameResults(dateStr);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Recording complete!`);
  console.log(`${'='.repeat(60)}\n`);
  
  return { gameResults };
}

// Run the script
main()
  .then(results => {
    console.log('\n📋 Final Summary:');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

