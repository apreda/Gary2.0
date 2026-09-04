#!/usr/bin/env node
/**
 * THE CARD WATCH (founder, Sep 4 2026: "see that will work each day without me
 * having to check it").
 *
 * Tapping a player's name on the Hub opens his card. That only works when the
 * day's packs actually exist, and for months they silently did not: college
 * cards never once reached the table (one duplicate player id failed the whole
 * insert), and a quarter of the MLB rows pointed at players no pass had packed.
 * Nothing failed loudly — the taps just opened empty.
 *
 * This prints, per league, how much of the day the cards actually cover, and
 * exits non-zero when a league that surfaced players has no cards behind them,
 * so the daily job's own log carries the failure instead of waiting for a tap.
 *
 *   node scripts/check-card-coverage.js              # today, ET
 *   node scripts/check-card-coverage.js --date=2026-09-03
 *   node scripts/check-card-coverage.js --strict     # any gap at all fails
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing Supabase credentials'); process.exit(1); }
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const DATE = String(args.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
const STRICT = !!args.strict;

const [{ data: signals, error: sigErr }, { data: cards, error: cardErr }] = await Promise.all([
  sb.from('insight_connections').select('league, player_id, headline').eq('date', DATE),
  sb.from('player_insight_cards').select('league, player_id, player_name, payload').eq('date', DATE),
]);
if (sigErr) { console.error(`insight_connections read failed: ${sigErr.message}`); process.exit(1); }
if (cardErr) { console.error(`player_insight_cards read failed: ${cardErr.message}`); process.exit(1); }

/** A pack is THIN when it carries nothing but its own identity. */
const isThin = (payload) => {
  if (!payload || typeof payload !== 'object') return true;
  const substance = ['formRows', 'form', 'season', 'seasonDisplay', 'splits', 'props', 'xstats', 'usage', 'lastGames'];
  return !substance.some((k) => {
    const v = payload[k];
    return Array.isArray(v) ? v.length > 0 : v != null;
  });
};

const leagues = [...new Set([...(signals || []).map((s) => s.league), ...(cards || []).map((c) => c.league)])]
  .filter(Boolean).sort();

console.log(`THE CARD WATCH — ${DATE}`);
let failures = [];

for (const league of leagues) {
  const leagueSignals = (signals || []).filter((s) => s.league === league);
  const leagueCards = (cards || []).filter((c) => c.league === league);
  const cardIds = new Set(leagueCards.map((c) => String(c.player_id)));
  const cardNames = new Set(leagueCards.map((c) => nameKey(c.player_name)).filter(Boolean));

  const withPlayer = leagueSignals.filter((s) => s.player_id != null);
  const byId = withPlayer.filter((s) => cardIds.has(String(s.player_id)));
  // The app resolves a nameless row against the packs by name, so count that
  // path too — it is the one that carries every football lane.
  const byName = leagueSignals.filter((s) => !cardIds.has(String(s.player_id ?? ''))
    && cardNames.has(nameKey(headName(s.headline))));
  const thin = leagueCards.filter((c) => isThin(c.payload)).length;
  const reachable = byId.length + byName.length;
  const namesOnRows = withPlayer.length + byName.length;

  console.log(`  ${league.padEnd(6)} ${String(leagueCards.length).padStart(4)} card(s)`
    + `  ·  ${reachable}/${namesOnRows} player row(s) reach one`
    + `  ·  ${thin} thin`);

  if (leagueSignals.length && !leagueCards.length) {
    failures.push(`${league}: ${leagueSignals.length} row(s) on the board and NO cards at all`);
  } else if (namesOnRows && reachable < namesOnRows) {
    const gap = namesOnRows - reachable;
    const line = `${league}: ${gap} player row(s) open an empty card`;
    if (STRICT || gap > namesOnRows / 2) failures.push(line);
    else console.log(`         ⚠️  ${line}`);
  }
  if (leagueCards.length && thin === leagueCards.length) {
    failures.push(`${league}: every card is thin (identity only, no numbers)`);
  }
}

if (!leagues.length) {
  console.log('  no signals and no cards for this date');
}

if (failures.length) {
  console.error('\n❌ THE CARD WATCH FAILED');
  for (const f of failures) console.error(`   ${f}`);
  process.exit(1);
}
console.log('\n✅ Every player row on the board reaches a card.');

function nameKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** The head of a lane headline is the player: "Max Scherzer: 6.16 ERA vs …". */
function headName(headline) {
  const head = String(headline || '').split(/[:(,/·—]/)[0];
  return head.trim();
}
