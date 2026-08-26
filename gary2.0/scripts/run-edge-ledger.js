#!/usr/bin/env node
/**
 * Edge-outcome ledger runner — ANALYST TOOLING, NOT A GARY SURFACE.
 *
 * Joins stored rationales (daily_picks) to graded outcomes (game_results)
 * and prints, per cited edge family, the record of picks whose own language
 * leaned on it. Read-only; runs on demand; wired into no pipeline, no
 * prompt, no scout report, no table Gary reads.
 *
 * Usage:
 *   node scripts/run-edge-ledger.js --from 2026-08-18 --to 2026-08-25
 *   node scripts/run-edge-ledger.js --from 2026-08-18 --to 2026-08-25 --league MLB
 *   node scripts/run-edge-ledger.js ... --family pen_recency   # list that family's picks
 */
import '../src/loadEnv.js';
import { EDGE_FAMILIES, tagRationale, tallyByFamily } from './lib/edgeLedger.js';

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

const args = process.argv.slice(2);
const argValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : undefined;
};
const from = argValue('--from');
const to = argValue('--to');
const league = (argValue('--league') || 'MLB').toUpperCase();
const focusFamily = argValue('--family');
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
  console.error('Usage: node scripts/run-edge-ledger.js --from YYYY-MM-DD --to YYYY-MM-DD [--league MLB] [--family key]');
  process.exit(1);
}

const { data: pickDays, error: pickErr } = await supabase
  .from('daily_picks').select('date, picks').gte('date', from).lte('date', to);
if (pickErr) { console.error(`daily_picks read failed: ${pickErr.message}`); process.exit(1); }

const { data: results, error: resErr } = await supabase
  .from('game_results').select('game_date, league, matchup, pick_text, result')
  .gte('game_date', from).lte('game_date', to).eq('league', league);
if (resErr) { console.error(`game_results read failed: ${resErr.message}`); process.exit(1); }

// Join by (date, pick_text) — the pick string is the stable identity both
// sides carry verbatim.
const resultByKey = new Map();
for (const r of results || []) resultByKey.set(`${r.game_date}|${r.pick_text}`, r.result);

const rows = [];
let unmatched = 0;
for (const day of pickDays || []) {
  for (const p of day.picks || []) {
    if ((p.league || '').toUpperCase() !== league) continue;
    const result = resultByKey.get(`${day.date}|${p.pick}`);
    if (!result) { unmatched += 1; continue; }
    const { families, decisive } = tagRationale(p.rationale);
    rows.push({ date: day.date, pick: p.pick, result, families, decisive });
  }
}

const graded = rows.filter((r) => r.result === 'won' || r.result === 'lost');
const overallW = graded.filter((r) => r.result === 'won').length;
console.log(`\nEdge ledger — ${league} ${from} → ${to}`);
console.log(`${graded.length} graded picks (${overallW}-${graded.length - overallW} overall)` +
  (unmatched ? `; ${unmatched} pick(s) had no graded result and are excluded` : ''));
console.log('Cited-language tally: a pick counts under EVERY family its rationale cites.');
console.log('"decisive" = the family also appears in the final paragraph, where the ticket is argued.\n');

const tally = tallyByFamily(rows);
const table = EDGE_FAMILIES
  .map((f) => ({ f, t: tally.get(f.key) }))
  .filter(({ t }) => t.cited > 0)
  .sort((a, b) => b.t.cited - a.t.cited);
for (const { f, t } of table) {
  const pct = t.cited ? ((t.wins / t.cited) * 100).toFixed(0) : '—';
  const dec = t.decisiveWins + t.decisiveLosses;
  console.log(
    `${f.label.padEnd(32)} cited ${String(t.cited).padStart(3)}: ${t.wins}-${t.losses} (${pct}%)` +
    (dec ? `  | decisive ${t.decisiveWins}-${t.decisiveLosses}` : ''),
  );
}

if (focusFamily) {
  console.log(`\n── Picks citing ${focusFamily} ──`);
  for (const r of graded.filter((x) => x.families.includes(focusFamily))) {
    console.log(`${r.date}  ${r.result.toUpperCase().padEnd(4)}  ${r.pick}${r.decisive.includes(focusFamily) ? '  [decisive]' : ''}`);
  }
}
process.exit(0);
