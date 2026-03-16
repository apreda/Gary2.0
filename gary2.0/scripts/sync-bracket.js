#!/usr/bin/env node
/**
 * Sync NCAAB bracket data from BDL to Supabase.
 *
 * Usage:
 *   node scripts/sync-bracket.js           # Current season
 *   node scripts/sync-bracket.js --season 2024  # Specific season (for testing)
 *
 * Run this:
 *   - Once on Selection Sunday after bracket is set
 *   - Periodically during tournament to update scores and match new picks
 *   - After each day's games to refresh results
 */

import '../src/loadEnv.js';

const { syncBracketToSupabase } = await import('../src/services/bracketService.js');

const args = process.argv.slice(2);
let season = null;

const seasonIdx = args.indexOf('--season');
if (seasonIdx !== -1 && args[seasonIdx + 1]) {
  season = parseInt(args[seasonIdx + 1]);
}

console.log('=== NCAAB Bracket Sync ===');
console.log(`Season: ${season || 'current'}`);
console.log('');

const result = await syncBracketToSupabase(season);

if (result.success) {
  console.log(`\nDone! ${result.games} games synced, ${result.picks_matched} matched with Gary's picks.`);
} else {
  console.log(`\nSync incomplete: ${result.reason}`);
  if (result.reason === 'no_data') {
    console.log('Bracket data not yet available from BDL. Try again after Selection Sunday.');
  }
}

process.exit(0);
