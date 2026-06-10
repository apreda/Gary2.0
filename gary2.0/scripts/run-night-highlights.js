#!/usr/bin/env node
/**
 * Night Highlights — manual / backfill runner
 *
 * League-wide "what cashed last night" from BDL box scores: every HR, the top
 * multi-hit games, 7+ K pitching shows, dominant starts (gems), 3+ RBI nights,
 * and 2+ SB nights — NOT limited to Gary's picks.
 * gary_result is set only when Gary had a graded prop on that player that
 * night (prop_results join). $0 — data fetches only, no LLM.
 *
 * The nightly path (scripts/run-all-results.js) does this automatically after
 * grading — this CLI exists for backfills and re-runs. Idempotent: upsert on
 * (game_date, league, category, player_name).
 *
 * Usage:
 *   node scripts/run-night-highlights.js --date 2026-06-09
 *   node scripts/run-night-highlights.js --date 2026-06-09 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { runNightHighlights } from '../src/services/nightHighlights.js';
// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}
if (!BDL_API_KEY) {
  console.error('❌ Missing BallDontLie API key.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Arg parsing (mirrors run-game-recaps.js) ────────────────────────────────
const args = process.argv.slice(2);
function getArgValue(flag) {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const dryRun = args.includes('--dry-run');
const targetDate = getArgValue('--date') || (() => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
})();

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

async function main() {
  const { rows, counts } = await runNightHighlights({
    supabase,
    bdlApiKey: BDL_API_KEY,
    date: targetDate,
    dryRun,
  });

  console.log(`\n════════════════════════════════════════`);
  console.log(`NIGHT HIGHLIGHTS FOR ${targetDate}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`hr=${counts.hr}  multi_hit=${counts.multi_hit}  k_show=${counts.k_show}  gem=${counts.gem}  rbi_night=${counts.rbi_night}  sb_night=${counts.sb_night}  gary_result set=${counts.with_gary_result}`);
  console.log(`════════════════════════════════════════`);
  for (const r of rows) {
    console.log(`  [${r.category}] ${r.player_name} (${r.team || '?'}) — ${r.detail}${r.gary_result ? ` [Gary ${r.gary_result.toUpperCase()}]` : ''}`);
  }
}

main().catch((err) => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
