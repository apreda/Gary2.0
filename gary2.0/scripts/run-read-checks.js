#!/usr/bin/env node
/**
 * NFL read checks: backfill and report. The nightly results job writes these on its own after each NFL pick
 * settles (scripts/lib/results/enrichment.js readCheckGradedPick); this CLI fills a date that was graded
 * before the lane existed and prints the report. Safe to run again: a checked game is skipped.
 *
 *   node scripts/run-read-checks.js --date 2026-10-04      # check that date's settled NFL picks, then report
 *   node scripts/run-read-checks.js --report               # report only, the whole season
 *   node scripts/run-read-checks.js --report --from 2026-10-01
 */
import { createClient } from '@supabase/supabase-js';
import { createResultsEnrichment } from './lib/results/enrichment.js';
await import('../src/loadEnv.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const date = arg('--date');

if (date && !process.argv.includes('--report')) {
  const { readCheckGradedPick } = createResultsEnrichment({ supabase });
  const { data: settled, error } = await supabase.from('nfl_results')
    .select('game_date, pick_text, result, home_team, away_team, home_score, away_score, game_id').eq('game_date', date);
  if (error) throw error;
  for (const row of settled || []) {
    if (!['won', 'lost', 'push'].includes(row.result) || row.home_score == null || row.away_score == null) continue;
    const { data: written } = await supabase.from('winners_candidates').select('rationale:pick_snapshot->>rationale')
      .eq('game_date', date).eq('league', 'NFL').eq('kind', 'game').eq('pick_text', row.pick_text).order('id', { ascending: false }).limit(1);
    const rationale = written?.[0]?.rationale;
    if (!rationale) { console.log(`  no stored write-up for ${row.pick_text}; skipped`); continue; }
    await readCheckGradedPick({ pick: { pick: row.pick_text, rationale, homeTeam: row.home_team, awayTeam: row.away_team, game_id: row.game_id },
      league: 'NFL', gameDate: date, result: row.result, hs: row.home_score, vs: row.away_score, matchedGame: { id: row.game_id } });
  }
}

const { data: report, error: reportError } = await supabase.rpc('gary_read_report', { p_league: 'NFL', p_from: arg('--from') || date || null, p_to: arg('--to') || date || null });
if (reportError) throw reportError;
console.log(`\nNFL READ CHECK${date ? `, ${date}` : ''}: ${report.picks} picks`);
console.log(`  won, read held ${report.won_read_held} · won, read missed ${report.won_read_missed} · lost, read held ${report.lost_read_held} · lost, read missed ${report.lost_read_missed} · no clear read ${report.no_clear_read}`);
for (const r of report.rows) console.log(`  ${r.date} ${String(r.result).toUpperCase().padEnd(4)} read ${String(r.read).padEnd(7)} ${r.right} right / ${r.wrong} wrong / ${r.unclear} unclear · ${r.pick}`);
process.exit(0);
