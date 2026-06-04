#!/usr/bin/env node
/**
 * Backfill prop_results.odds from the original prop_picks JSON.
 *
 * Context: the grader stopped writing odds into prop_results around Jan 9 2026
 * (the insert in run-all-results.js dropped the field during the props
 * migration — fixed June 4 2026). Every settled prop since then has odds=null,
 * which makes the iOS Billfold fall back to a flat 0.9u payout per win.
 *
 * This joins each null-odds prop_result back to its prop_picks row via
 * prop_pick_id, matches the exact pick by player + prop_type + line + bet,
 * and writes the stored odds. Idempotent: only touches rows where odds IS NULL,
 * never overwrites a non-null value. Safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-prop-odds.js           # dry run (default) — prints what it WOULD write
 *   node scripts/backfill-prop-odds.js --apply   # actually write
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const APPLY = process.argv.includes('--apply');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

async function main() {
  console.log(`Backfill prop_results.odds — ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  // Page through all null-odds rows that have a parent pick
  const targets = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('prop_results')
      .select('id,prop_pick_id,player_name,prop_type,line_value,bet,game_date')
      .is('odds', null)
      .not('prop_pick_id', 'is', null)
      .order('game_date', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`fetch prop_results: ${error.message}`);
    targets.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  console.log(`Null-odds rows with a parent pick: ${targets.length}`);
  if (!targets.length) return;

  // Load each parent prop_picks row once
  const pickIds = [...new Set(targets.map((t) => t.prop_pick_id))];
  const pickMap = new Map();
  for (let i = 0; i < pickIds.length; i += 100) {
    const batch = pickIds.slice(i, i + 100);
    const { data, error } = await supabase.from('prop_picks').select('id,picks').in('id', batch);
    if (error) throw new Error(`fetch prop_picks: ${error.message}`);
    for (const row of data || []) {
      let picks = row.picks;
      if (typeof picks === 'string') { try { picks = JSON.parse(picks); } catch { picks = []; } }
      pickMap.set(row.id, Array.isArray(picks) ? picks : []);
    }
  }

  let matched = 0, noMatch = 0, noOdds = 0, written = 0, failed = 0;
  for (const t of targets) {
    const picks = pickMap.get(t.prop_pick_id) || [];
    const hit = picks.find((p) => {
      const type = (p.prop || p.prop_type || '').split(' ')[0];
      return norm(p.player || p.player_name) === norm(t.player_name)
        && type === t.prop_type
        && parseFloat(p.line ?? p.line_value) === parseFloat(t.line_value)
        && (p.bet || '') === (t.bet || '');
    });
    if (!hit) { noMatch++; continue; }
    if (hit.odds == null) { noOdds++; continue; }
    matched++;
    if (!APPLY) continue;
    const { data: upd, error } = await supabase
      .from('prop_results')
      .update({ odds: String(hit.odds) })
      .eq('id', t.id)
      .is('odds', null) // never clobber a non-null value, even in a race
      .select('id');    // RLS-blocked updates return NO error and 0 rows — detect that
    if (error) { failed++; console.error(`  ❌ ${t.game_date} ${t.player_name} ${t.prop_type}: ${error.message}`); }
    else if (!upd?.length) { failed++; if (failed === 1) console.error('  ❌ UPDATE affected 0 rows (RLS likely blocks UPDATE for this key)'); }
    else written++;
    if (failed >= 5 && written === 0) { console.error('  ⛔ Aborting: every update is a silent no-op — wrong key/RLS.'); break; }
  }

  console.log(`Matched odds for: ${matched}/${targets.length}  (no pick match: ${noMatch}, pick had no odds: ${noOdds})`);
  if (APPLY) console.log(`Written: ${written}, failed: ${failed}`);
  else console.log('Dry run complete — re-run with --apply to write.');
}

main().catch((e) => { console.error(e); process.exit(1); });
