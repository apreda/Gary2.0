#!/usr/bin/env node
/**
 * THE PROPS BOOK — the ledger of the props system since its Sep 2 2026
 * rebuild, read from the prop_lane_ledger view (analytics only).
 *
 *   node scripts/props-book.js                # since 2026-09-02, core lane
 *   node scripts/props-book.js --since=2026-09-10
 *   node scripts/props-book.js --lane=HR      # the fun lane on its own
 *
 * Prints the record and units, then the same by day, by market + side, by
 * price band, and by era (prompt_sha) — the questions a props owner asks
 * every morning. Money first, then the win rate.
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const SINCE = String(args.since || '2026-09-02');
const LANE = String(args.lane || 'CORE').toUpperCase();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase
  .from('prop_lane_ledger')
  .select('game_date,player,prop_token,bet,odds_num,confidence,league,prompt_sha,board_version,lane,result,units')
  .gte('game_date', SINCE)
  .eq('lane', LANE)
  .order('game_date', { ascending: true });
if (error) { console.error(`prop_lane_ledger read failed: ${error.message}`); process.exit(1); }

const rows = (data || []).filter((r) => r.result === 'won' || r.result === 'lost' || r.result === 'push');
const pending = (data || []).length - rows.length;

const tally = (list) => {
  const won = list.filter((r) => r.result === 'won').length;
  const lost = list.filter((r) => r.result === 'lost').length;
  const push = list.filter((r) => r.result === 'push').length;
  const units = list.reduce((a, r) => a + Number(r.units || 0), 0);
  const decided = won + lost;
  return { n: list.length, won, lost, push, units, pct: decided ? (100 * won) / decided : null };
};
const fmt = (t) => `${t.won}-${t.lost}${t.push ? `-${t.push}` : ''}${t.pct != null ? ` (${t.pct.toFixed(1)}%)` : ''}  ${t.units >= 0 ? '+' : ''}${t.units.toFixed(2)}u`;
const table = (title, keyOf) => {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  console.log(`\n${title}`);
  const entries = [...groups.entries()].map(([k, list]) => [k, tally(list)]).sort((a, b) => b[1].n - a[1].n);
  for (const [k, t] of entries) console.log(`  ${String(k).padEnd(34)} ${String(t.n).padStart(4)}  ${fmt(t)}`);
};

const all = tally(rows);
console.log(`THE PROPS BOOK — ${LANE} lane since ${SINCE}`);
console.log(`Graded: ${all.n} (${pending} pending)  Record: ${fmt(all)}`);
if (!rows.length) process.exit(0);

table('By day', (r) => r.game_date);
table('By market and side', (r) => `${r.prop_token} ${r.bet}`);
table('By price', (r) => {
  const o = Number(r.odds_num);
  if (!Number.isFinite(o)) return 'no price';
  if (o <= -150) return '-150 and heavier';
  if (o < 0) return '-149 to -101';
  if (o <= 150) return '+100 to +150';
  return '+151 and longer';
});
table('By era (prompt_sha · board)', (r) => `${r.prompt_sha || '(none)'} · v${r.board_version ?? '?'}`);
table('By confidence', (r) => {
  const c = Number(r.confidence);
  if (!Number.isFinite(c)) return 'unstated';
  return c >= 0.8 ? '0.80+' : c >= 0.7 ? '0.70-0.79' : c >= 0.6 ? '0.60-0.69' : 'under 0.60';
});
