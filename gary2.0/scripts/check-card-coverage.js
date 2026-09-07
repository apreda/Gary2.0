#!/usr/bin/env node
/** Read-only Hub card watch. Historical --date audits simulate that slate day.
 * node scripts/check-card-coverage.js [--date=YYYY-MM-DD] [--strict] [--json]
 * Partial player gaps keep the full story readable and warn by default;
 * --strict fails any such gap. Broken collections and zero coverage fail.
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { auditCardCoverage, readCoverageRows, SIGNAL_COLUMNS, CARD_COLUMNS } from './lib/cardCoverage.js';

export async function runCardWatch({ argv = process.argv.slice(2), env = process.env, now = () => new Date(),
  clientFactory = createClient, log = console.log, error = console.error } = {}) {
  const args = Object.fromEntries(argv.filter(arg => arg.startsWith('--')).map(arg => {
    const [key, ...value] = arg.slice(2).split('=');
    return [key, value.length ? value.join('=') : true];
  }));
  const clock = typeof now === 'function' ? now : () => now;
  const etDate = () => clock().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today = etDate();
  const date = args.date == null ? today : String(args.date);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Card watch requires a valid --date=YYYY-MM-DD');
  }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const key = anonKey || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  const sb = clientFactory(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const reads = await Promise.allSettled([
    readCoverageRows(sb, 'insight_connections', SIGNAL_COLUMNS, date),
    readCoverageRows(sb, 'player_insight_cards', CARD_COLUMNS, date),
  ]);
  const readErrors = reads.filter(read => read.status === 'rejected').map(read => read.reason.message);
  if (readErrors.length) throw new Error(readErrors.join('; '));
  if (args.date == null && etDate() !== date) throw new Error('Slate date changed during the card watch; rerun for the current day');
  const report = auditCardCoverage({ signals: reads[0].value, cards: reads[1].value, date, strict: !!args.strict });
  report.read_access = anonKey ? 'public' : 'service_role';
  report.historical = date !== etDate();
  if (!anonKey) {
    report.warnings.push('Public read credentials unavailable; this run does not verify the app can read these rows');
    report.complete = false;
  }
  if (args.json) log(JSON.stringify(report, null, 2));
  else {
    log(`THE CARD WATCH — ${date}${report.historical ? ' (historical snapshot audit)' : ''}`);
    for (const row of report.rows) {
      log(`  ${row.league.padEnd(6)} ${String(row.cards).padStart(4)} card(s) · ${row.reachable}/${row.player_rows} player row(s) reach a unique populated card`
        + `${row.name_only_reachable ? ` (+${row.name_only_reachable} by name)` : ''} · ${row.thin} thin`);
      if (row.excluded.fantasy_briefing) log(`         ${row.excluded.fantasy_briefing} dedicated Fantasy decision(s) outside main Hub card coverage`);
      for (const gap of row.gaps.slice(0, 12)) log(`         ${gap.reason}: ${gap.headline} [player ${gap.player_id}; game ${gap.game_id ?? 'unspecified'}]`);
      if (row.gaps.length > 12) log(`         ${row.gaps.length - 12} additional fallback(s); --json includes all rows`);
    }
    if (!report.rows.length) log('  no supported Hub signals or cards for this date');
    for (const warning of report.warnings) log(`  ⚠️  ${warning}`);
    if (report.failures.length) {
      error('\n❌ THE CARD WATCH FAILED');
      for (const failure of report.failures) error(`   ${failure}`);
    } else if (report.warnings.length) log('\nCard watch completed with the coverage limitations shown above.');
    else log('\n✅ All audited player rows have populated cards; rendered stats and data are present.');
  }
  return report.failures.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runCardWatch(); }
  catch (error) { console.error(`Card watch failed: ${error.message}`); process.exitCode = 1; }
}
