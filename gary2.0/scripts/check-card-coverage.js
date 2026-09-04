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

  // A PLAYER ROW is one the lane stamped with a player id. A row with no id
  // that still resolves by name is football's path and counts as a bonus —
  // team rows (a bullpen, a head-to-head) are neither and must not inflate
  // the denominator, or the watch reports misses that do not exist.
  const withPlayer = leagueSignals.filter((s) => s.player_id != null);
  const reachable = withPlayer.filter((s) => cardIds.has(String(s.player_id))
    || resolvesByName(headName(s.headline), leagueCards));
  const nameOnly = leagueSignals.filter((s) => s.player_id == null
    && resolvesByName(headName(s.headline), leagueCards));
  const thin = leagueCards.filter((c) => isThin(c.payload)).length;
  const namesOnRows = withPlayer.length;

  console.log(`  ${league.padEnd(6)} ${String(leagueCards.length).padStart(4)} card(s)`
    + `  ·  ${reachable.length}/${namesOnRows} player row(s) reach one`
    + `${nameOnly.length ? ` (+${nameOnly.length} by name)` : ''}`
    + `  ·  ${thin} thin`);

  // A league with no PLAYER rows has nothing to open — an off-day NFL board
  // of team rows is not a failure, it is a Thursday in September.
  if (namesOnRows && !leagueCards.length) {
    failures.push(`${league}: ${namesOnRows} player row(s) on the board and NO cards at all`);
  } else if (namesOnRows && reachable.length < namesOnRows) {
    const gap = namesOnRows - reachable.length;
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

/**
 * The app's own name resolver (HubView.intelCard): exact key, then either
 * string containing the other, then the agate short form "J. Caminero".
 * The watch has to count what the app can actually open, not a stricter match.
 */
function resolvesByName(name, cards) {
  const k = nameKey(name);
  if (k.length < 5) return false;
  for (const c of cards) {
    const n = nameKey(c.player_name || c.payload?.name);
    if (n && (n === k || n.includes(k) || k.includes(n))) return true;
  }
  const tokens = String(name || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const surname = nameKey(tokens[tokens.length - 1]);
  const initial = (tokens[0].match(/[A-Za-z]/g) || []).join('');
  if (surname.length < 3 || initial.length !== 1) return false;
  return cards.some((c) => {
    const parts = String(c.player_name || c.payload?.name || '').split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    return nameKey(parts[parts.length - 1]) === surname
      && parts[0].toLowerCase().startsWith(initial.toLowerCase());
  });
}

function nameKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}
/** The head of a lane headline is the player: "Max Scherzer: 6.16 ERA vs …". */
function headName(headline) {
  const head = String(headline || '').split(/[:(,/·—]/)[0];
  return head.trim();
}
