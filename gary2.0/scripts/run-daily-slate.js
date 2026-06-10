#!/usr/bin/env node
/**
 * Daily Slate snapshot CLI
 *
 * Writes the full public slate (every scheduled game + opening lines) for a
 * day into the `daily_slate` Supabase table via dailySlateService. The 5 AM
 * scheduler plan step calls the same service automatically; this CLI exists
 * for backfills and manual re-snapshots.
 *
 * Usage:
 *   node scripts/run-daily-slate.js                      # today (ET)
 *   node scripts/run-daily-slate.js --date 2026-06-10    # specific ET date
 */

import '../src/loadEnv.js';

const args = process.argv.slice(2);

function getArgValue(flag) {
  // Supports: --flag value  |  --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const dateArg = getArgValue('--date');
const targetDate =
  dateArg || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

const { writeDailySlate } = await import('../src/services/dailySlateService.js');

try {
  const result = await writeDailySlate(targetDate);
  const summary = Object.entries(result.byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  console.log(`\n🏁 Daily slate for ${result.date}: ${result.total} game(s)${summary ? ` (${summary})` : ''}`);
  process.exit(0);
} catch (e) {
  console.error(`❌ Daily slate write failed: ${e.message}`);
  process.exit(1);
}
