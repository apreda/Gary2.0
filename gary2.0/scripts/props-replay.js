#!/usr/bin/env node
/**
 * THE AUGUST REPLAY — run THE PROP MODEL over every saved prop menu as if it
 * were that night, grade every market against the box score, and report
 * whether the model's edge holds up at the book's prices.
 *
 *   node scripts/props-replay.js                       # every MLB menu before today
 *   node scripts/props-replay.js --from=2026-08-10 --to=2026-08-31
 *   node scripts/props-replay.js --limit=40            # first N snapshots (smoke)
 *   node scripts/props-replay.js --out=/path/replay.json
 *
 * No peeking: a market on Aug 20 is priced from rows dated before Aug 20.
 * Nothing here touches production tables — read-only, prints, saves JSON.
 */
import '../src/loadEnv.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { ballDontLieService } from '../src/services/ballDontLieService.js';
import { statForProp } from '../src/services/pickdesk/propsBrain.js';
import { screenBoard, lineupRates, payout, LEAGUE, pitcherProfile } from '../src/services/pickdesk/propModel.js';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const FROM = String(args.from || '2026-08-05');
const TO = String(args.to || '2026-09-01');
const LIMIT = args.limit ? Number(args.limit) : null;
const OUT = args.out ? String(args.out) : null;
const BLEND = args.blend != null ? Number(args.blend) : undefined;   // market prior weight (model default when omitted)
// Raw inputs (box scores, lineups, chrono rows) cache to disk so a model
// change replays in seconds instead of re-pulling BDL for an hour.
const CACHE_DIR = String(args['cache-dir'] || path.join(process.env.TMPDIR || '/tmp', 'gary-props-replay-cache'));
mkdirSync(CACHE_DIR, { recursive: true });
const cached = async (name, fetcher) => {
  const file = path.join(CACHE_DIR, `${name}.json`);
  if (existsSync(file)) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* refetch */ } }
  const value = await fetcher();
  try { writeFileSync(file, JSON.stringify(value ?? null)); } catch { /* cache is optional */ }
  return value;
};
const SEASON = 2026;
const norm = (s) => String(s || '').toLowerCase().trim();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: menus, error } = await supabase
  .from('prop_menu')
  .select('game_date,matchup,bdl_game_id,markets')
  .eq('league', 'MLB')
  .gte('game_date', FROM).lte('game_date', TO)
  .order('game_date', { ascending: true });
if (error) { console.error(error.message); process.exit(1); }
const snapshots = (LIMIT ? menus.slice(0, LIMIT) : menus).filter((m) => m.bdl_game_id && Array.isArray(m.markets) && m.markets.length);
console.log(`[replay] ${snapshots.length} menus, ${snapshots.reduce((a, m) => a + m.markets.length, 0)} markets, ${FROM} → ${TO}`);

const chronoCache = new Map();
async function chrono(pid) {
  if (!chronoCache.has(pid)) {
    chronoCache.set(pid, cached(`chrono-${pid}-${SEASON}`, () => ballDontLieService.getMlbPlayerGameRowsChrono(pid, SEASON).catch(() => [])));
  }
  return chronoCache.get(pid);
}

const records = [];   // one per priced market with a model number
const pooled = { pa: 0, hits: 0, singles: 0, doubles: 0, triples: 0, hr: 0, bb: 0, k: 0, sb: 0, runs: 0, rbi: 0, bf: 0, p_k: 0, p_bb: 0, p_h: 0, er: 0, starts: 0 };
let done = 0;

for (const snap of snapshots) {
  const gid = snap.bdl_game_id;
  const asOf = String(snap.game_date).slice(0, 10);
  let box = [];
  let lineup = [];
  try {
    [box, lineup] = await Promise.all([
      cached(`box-${gid}`, () => ballDontLieService.getMlbGameStats({ gameIds: [gid] })),
      cached(`lineup-${gid}`, () => ballDontLieService.getMlbLineups(gid).catch(() => null)),
    ]);
  } catch (e) {
    console.warn(`[replay] ${snap.matchup} ${asOf}: box fetch failed (${e.message})`);
    continue;
  }
  if (!Array.isArray(box) || !box.length) { console.warn(`[replay] ${snap.matchup} ${asOf}: no box score`); continue; }

  // Name → box row (actuals + player id). A market's name may differ from the
  // box's full_name (accents, Jr.) — last-name + first-initial fallback.
  const byName = new Map();
  const byLoose = new Map();
  for (const r of box) {
    const full = norm(r.player?.full_name || `${r.player?.first_name} ${r.player?.last_name}`);
    byName.set(full, r);
    const loose = `${norm(r.player?.first_name).slice(0, 1)}|${norm(r.player?.last_name)}`;
    byLoose.set(loose, r);
  }
  const findBox = (name) => {
    const n = norm(name).replace(/\./g, '');
    if (byName.has(n)) return byName.get(n);
    const parts = n.split(/\s+/);
    return byLoose.get(`${parts[0]?.slice(0, 1)}|${parts[parts.length - 1]}`) || null;
  };

  // The two lineups (for the opposing nine's tendencies). getMlbLineups
  // returns { ABBR: { batters: [{ playerId, ... }], pitcher, teamName } }.
  const sides = Object.values(lineup || {}).filter((sd) => Array.isArray(sd?.batters) && sd.batters.length);
  const oppRowsFor = async (teamName) => {
    const other = sides.find((sd) => norm(sd.teamName) !== norm(teamName)) || (sides.length === 2 ? null : null);
    if (!other) return null;
    const rows = await Promise.all(other.batters.map((b) => (b.playerId != null ? chrono(b.playerId) : Promise.resolve([]))));
    return lineupRates(rows, { asOf });
  };
  const teamOfRow = (r) => r?.team_name ?? r?.team?.display_name ?? r?.team?.full_name ?? null;
  const slotByName = new Map();
  for (const sd of sides) for (const b of sd.batters) if (b?.name && b?.battingOrder != null) slotByName.set(norm(b.name), Number(b.battingOrder));
  // The opposing starter for every hitter: the box's starters (games_started 1) by team.
  const starters = box.filter((r) => Number(r.games_started) === 1 && r.player?.id != null);
  const oppStarterProfile = new Map();   // hitter key → { hr } as of the date
  const starterProfileFor = async (row) => {
    const rows = await chrono(row.player.id);
    return pitcherProfile(rows, { asOf });
  };
  const teamOfHitter = new Map();
  for (const r of box) if (r.player?.id != null) teamOfHitter.set(norm(r.player.full_name || `${r.player.first_name} ${r.player.last_name}`), teamOfRow(r));
  for (const st of starters) {
    const prof = await starterProfileFor(st);
    const stTeam = teamOfRow(st);
    for (const [k, t] of teamOfHitter) if (t && stTeam && norm(t) !== norm(stTeam)) oppStarterProfile.set(k, { hr: prof.rates.hr });
  }

  // Resolve every market's player once; pull rows; screen.
  const marketRows = [];
  const rowsByKey = new Map();
  const lineupByKey = new Map();
  for (const m of snap.markets) {
    const b = findBox(m.player);
    if (!b || b.player?.id == null) continue;
    const k = norm(m.player);
    if (!rowsByKey.has(k)) rowsByKey.set(k, await chrono(b.player.id));
    marketRows.push({ ...m, over_odds: m.over ?? m.over_odds ?? null, under_odds: m.under ?? m.under_odds ?? null, _box: b });
    if (norm(m.prop_type).startsWith('pitcher_') && !lineupByKey.has(k)) {
      lineupByKey.set(k, await oppRowsFor(teamOfRow(b)));
    }
  }
  const screened = screenBoard(marketRows, {
    asOf,
    marketBlend: BLEND,
    slotFor: (k) => slotByName.get(k) ?? null,
    oppPitcherFor: (k) => oppStarterProfile.get(k) || null,
    rowsFor: (k) => rowsByKey.get(k),
    lineupFor: (k) => lineupByKey.get(k) || null,
  });
  for (const s of screened) {
    const b = s.market._box;
    const isPitcher = norm(s.market.prop_type).startsWith('pitcher_');
    const actual = norm(s.market.prop_type) === 'pitcher_outs'
      ? (b.pitching_outs != null ? Number(b.pitching_outs) : statForProp(b, 'pitcher_outs'))
      : statForProp(b, s.market.prop_type);
    if (actual == null) continue;
    // A hitter who did not play (0 PA) is a void, not a loss.
    if (!isPitcher && !(Number(b.plate_appearances) > 0 || Number(b.at_bats) > 0)) continue;
    if (isPitcher && !(Number(b.batters_faced) > 0)) continue;
    const overWon = actual > Number(s.market.line);
    const won = s.side === 'over' ? overWon : !overWon;
    records.push({
      game_date: asOf, matchup: snap.matchup, player: s.market.player, prop_type: s.market.prop_type,
      line: Number(s.market.line), side: s.side, odds: s.odds, edge: s.edge, pModel: s.pModel, pMarket: s.pMarket,
      oneSided: s.oneSided, sample: s.sample, actual, won, units: won ? payout(s.odds) : -1,
      pOverModel: s.side === 'over' ? s.pModel : 1 - s.pModel, overWon,
    });
  }
  // Pooled league rates (hitters and starters actually in the box).
  for (const r of box) {
    const pa = Number(r.plate_appearances) || 0;
    if (pa > 0) {
      pooled.pa += pa; pooled.hits += Number(r.hits) || 0; pooled.doubles += Number(r.doubles) || 0; pooled.triples += Number(r.triples) || 0;
      pooled.hr += Number(r.hr) || 0; pooled.bb += Number(r.bb) || 0; pooled.k += Number(r.k) || 0; pooled.sb += Number(r.stolen_bases) || 0;
      pooled.runs += Number(r.runs) || 0; pooled.rbi += Number(r.rbi) || 0;
      pooled.singles += (Number(r.hits) || 0) - (Number(r.doubles) || 0) - (Number(r.triples) || 0) - (Number(r.hr) || 0);
    }
    if (Number(r.games_started) === 1 && Number(r.batters_faced) > 0) {
      pooled.starts += 1; pooled.bf += Number(r.batters_faced); pooled.p_k += Number(r.p_k) || 0; pooled.p_bb += Number(r.p_bb) || 0;
      pooled.p_h += Number(r.p_hits) || 0; pooled.er += Number(r.er) || 0;
    }
  }
  done += 1;
  if (done % 20 === 0) console.log(`[replay] ${done}/${snapshots.length} menus · ${records.length} graded markets`);
}

// ── report ───────────────────────────────────────────────────────────────
const tally = (list) => {
  const won = list.filter((r) => r.won).length;
  const units = list.reduce((a, r) => a + r.units, 0);
  return { n: list.length, won, lost: list.length - won, pct: list.length ? (100 * won) / list.length : 0, units, roi: list.length ? (100 * units) / list.length : 0 };
};
const fmt = (t) => `${String(t.n).padStart(5)}  ${t.won}-${t.lost} (${t.pct.toFixed(1)}%)  ${t.units >= 0 ? '+' : ''}${t.units.toFixed(1)}u  ROI ${t.roi >= 0 ? '+' : ''}${t.roi.toFixed(1)}%`;
const twoSided = records.filter((r) => !r.oneSided);

console.log(`\nTHE AUGUST REPLAY — ${records.length} graded markets (${twoSided.length} two-sided) across ${done} menus · market blend ${BLEND ?? 'default'}`);
console.log(`Pooled league per PA: hits ${(pooled.hits / pooled.pa).toFixed(3)} 1B ${(pooled.singles / pooled.pa).toFixed(3)} 2B ${(pooled.doubles / pooled.pa).toFixed(3)} HR ${(pooled.hr / pooled.pa).toFixed(3)} BB ${(pooled.bb / pooled.pa).toFixed(3)} K ${(pooled.k / pooled.pa).toFixed(3)} R ${(pooled.runs / pooled.pa).toFixed(3)} RBI ${(pooled.rbi / pooled.pa).toFixed(3)} · per BF: K ${(pooled.p_k / pooled.bf).toFixed(3)} BB ${(pooled.p_bb / pooled.bf).toFixed(3)} H ${(pooled.p_h / pooled.bf).toFixed(3)} ER ${(pooled.er / pooled.bf).toFixed(3)} · BF/start ${(pooled.bf / pooled.starts).toFixed(1)}  (model uses ${JSON.stringify(LEAGUE)})`);

console.log(`\nEvery two-sided market, better side taken (the null strategy):  ${fmt(tally(twoSided))}`);
console.log('\nBy edge threshold (two-sided markets, bet the side the model likes when gap ≥ t):');
for (const t of [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20]) {
  const bets = twoSided.filter((r) => r.edge >= t);
  console.log(`  gap ≥ ${(t * 100).toFixed(0).padStart(2)}%  ${fmt(tally(bets))}`);
}
console.log('\nCalibration (two-sided; model P(over) decile → how often the over actually hit):');
for (let d = 0; d < 10; d++) {
  const b = twoSided.filter((r) => r.pOverModel >= d / 10 && r.pOverModel < (d + 1) / 10);
  if (!b.length) continue;
  const hit = b.filter((r) => r.overWon).length;
  console.log(`  ${(d * 10).toString().padStart(2)}-${d * 10 + 10}%  n=${String(b.length).padStart(5)}  over hit ${(100 * hit / b.length).toFixed(1)}%  (model says ~${(100 * b.reduce((a, r) => a + r.pOverModel, 0) / b.length).toFixed(1)}%)`);
}
console.log('\nBy market and side at gap ≥ 6% (two-sided):');
const byType = new Map();
for (const r of twoSided.filter((r) => r.edge >= 0.06)) {
  const k = `${r.prop_type} ${r.side}`;
  if (!byType.has(k)) byType.set(k, []);
  byType.get(k).push(r);
}
for (const [k, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k.padEnd(32)} ${fmt(tally(list))}`);

// THE PRODUCT: the top two markets per game (distinct players), two-sided only.
console.log('\nTHE PRODUCT — top two per game by gap (distinct players, two-sided):');
const byGame = new Map();
for (const r of twoSided) {
  const k = `${r.game_date}|${r.matchup}`;
  if (!byGame.has(k)) byGame.set(k, []);
  byGame.get(k).push(r);
}
for (const minGap of [0, 0.04, 0.08]) {
  const picks = [];
  for (const list of byGame.values()) {
    const seen = new Set();
    for (const r of list.sort((a, b) => b.edge - a.edge)) {
      if (r.edge < minGap) break;
      if (seen.has(norm(r.player))) continue;
      seen.add(norm(r.player));
      picks.push(r);
      if (seen.size === 2) break;
    }
  }
  console.log(`  min gap ${(minGap * 100).toFixed(0).padStart(2)}%  ${fmt(tally(picks))}  (${byGame.size} games)`);
}
console.log('\nBy price band, top two per game (no min gap):');
{
  const picks = [];
  for (const list of byGame.values()) {
    const seen = new Set();
    for (const r of list.sort((a, b) => b.edge - a.edge)) {
      if (seen.has(norm(r.player))) continue;
      seen.add(norm(r.player)); picks.push(r);
      if (seen.size === 2) break;
    }
  }
  const band = (o) => (o <= -150 ? '-150 and heavier' : o < 0 ? '-149 to -101' : o <= 150 ? '+100 to +150' : '+151 and longer');
  const groups = new Map();
  for (const r of picks) { const k = band(Number(r.odds)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const [k, list] of groups) console.log(`  ${k.padEnd(20)} ${fmt(tally(list))}`);
}

if (OUT) { writeFileSync(OUT, JSON.stringify({ from: FROM, to: TO, menus: done, records }, null, 1)); console.log(`\nsaved ${records.length} records → ${OUT}`); }
process.exit(0);
