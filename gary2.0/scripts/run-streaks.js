#!/usr/bin/env node
/**
 * Streaks — manual / backfill runner
 *
 * Active MLB streaks as of an ET date: team W/L runs (4+), team over/under
 * runs (5+), hitting streaks (8+ games), hitless skids (0-for-15+ AB, regulars
 * only), and consecutive-HR-game runs (3+). $0 — BDL + MLB Stats API data
 * fetches only, no LLM.
 *
 * The nightly path (scripts/run-all-results.js) does this automatically after
 * grading — this CLI exists for backfills and re-runs. Idempotent:
 * delete-then-insert per (game_date, league).
 *
 * Usage:
 *   node scripts/run-streaks.js --date 2026-06-09
 *   node scripts/run-streaks.js --date 2026-06-09 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { writeStreaks } from '../src/services/streaksService.js';
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

// ── Arg parsing (mirrors run-night-highlights.js) ───────────────────────────
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
  const { rows, counts } = await writeStreaks({
    supabase,
    bdlApiKey: BDL_API_KEY,
    date: targetDate,
    dryRun,
  });

  console.log(`\n════════════════════════════════════════`);
  console.log(`STREAKS AS OF ${targetDate}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(['win', 'loss', 'hit', 'hitless', 'hr', 'over', 'under']
    .map((k) => `${k}=${counts[k] || 0}`).join('  '));
  console.log(`════════════════════════════════════════`);
  for (const r of rows) {
    console.log(`  [${r.kind}] ${r.subject}${r.subject_type === 'player' ? ` (${r.team || '?'})` : ''} — len ${r.length} — ${r.detail}${r.next_game ? ` — ${r.next_game}` : ''}`);
  }
}

main().catch((err) => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
