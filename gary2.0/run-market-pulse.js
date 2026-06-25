#!/usr/bin/env node
/**
 * Market Pulse — League-Wide Market Results (Yesterday)
 *
 * Summarizes how the betting market behaved across a full league slate for a
 * given day: the overs/unders record (total points vs the closing total),
 * the favorites moneyline record (more-negative ML = favorite), and the
 * underdogs' flat-stake net units. One `market_pulse` row per (date, league),
 * upserted via the supabase client (onConflict date,league) so re-runs refresh
 * rather than duplicate. iOS reads via the anon SELECT policy.
 *
 * Data sources:
 *   MLB — bdl.getMlbGamesForDate(date) for finals + bdl.getMlbGameOdds({ dates })
 *         for closing total / moneylines, joined per game id.
 *   NBA — ballDontLieOddsService.getGamesWithOddsForSport('basketball_nba', date)
 *         for totals + h2h, joined to bdl.getNbaGamesForDate(date) for finals.
 *
 * Usage:
 *   node run-market-pulse.js                       # yesterday (EST), MLB + NBA
 *   node run-market-pulse.js --date 2026-06-04     # specific date
 *   node run-market-pulse.js --league MLB          # single league
 *   node run-market-pulse.js --dry-run             # print rows, no write
 */

// MUST load env vars FIRST before any other imports
import './src/loadEnv.js';

import { getESTDate } from './src/utils/dateUtils.js';

// Import after env is loaded (services read env at module init time).
// market_pulse is RLS'd anon-read-only — writes need the service-role key,
// so build an admin client here instead of the shared anon client.
const { createClient } = await import('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, adminKey);
const { ballDontLieService: bdl } = await import('./src/services/ballDontLieService.js');
const { ballDontLieOddsService } = await import('./src/services/ballDontLieOddsService.js');
const fifa = await import('./src/services/fifaWorldCupService.js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues with full-slate odds + finals coverage. MLB + NBA + WC (soccer 3-way ML).
const ACTIVE_LEAGUES = ['MLB', 'NBA', 'WC'];

const TABLE = 'market_pulse';

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing (mirrors run-insight-connections.js / run-wire-items.js)
// ─────────────────────────────────────────────────────────────────────────────

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

/** Yesterday in EST (YYYY-MM-DD) — Market Pulse grades the day that just finished. */
function yesterdayEST() {
  const today = getESTDate();
  const d = new Date(`${today}T12:00:00Z`); // noon avoids TZ rollover
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const dryRun = args.includes('--dry-run');
const dateArg = getArgValue('--date');
const leagueArg = getArgValue('--league');

// Date: --date if given, else YESTERDAY in EST (YYYY-MM-DD).
const targetDate = dateArg || yesterdayEST();
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

// Leagues: --league (comma-separated, case-insensitive) filtered to ACTIVE_LEAGUES,
// else all active leagues (default 'MLB,NBA').
let leagues = ACTIVE_LEAGUES;
if (leagueArg) {
  const requested = leagueArg
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  leagues = ACTIVE_LEAGUES.filter((l) => requested.includes(l));
  const unknown = requested.filter((l) => !ACTIVE_LEAGUES.includes(l));
  if (unknown.length) {
    console.warn(`⚠️  Ignoring unsupported league(s): ${unknown.join(', ')}`);
  }
}

if (leagues.length === 0) {
  console.error(
    `❌ No active leagues to run. Active: ${ACTIVE_LEAGUES.join(', ')}` +
      (leagueArg ? ` (requested: ${leagueArg})` : '')
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const teamName = (t) => {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.full_name || t.display_name || t.name || t.abbreviation || '';
};

/** Median of a numeric array (closing-line consensus across vendors). */
function median(values) {
  const arr = values.filter((v) => v !== null && v !== undefined).map(Number).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * Accumulate one finished game into the running tallies.
 *  - overs: combined total points vs closing total (push when equal)
 *  - favorites ML: favorite = more-negative ML, decided by final score
 *  - dogs flat-stake: +american/100 when the dog wins, −1 when it loses
 * Mutates `acc`. Returns the per-game meta record (or null if not gradeable).
 */
function accumulate(acc, { matchup, homeScore, awayScore, total, spreadHome }) {
  const hs = num(homeScore);
  const as = num(awayScore);
  if (hs === null || as === null) return null; // no final score → skip

  const t = num(total);
  const sh = num(spreadHome);

  // A game counts toward the slate only when it has BOTH a final score and a
  // usable market number (a total or a run/point spread).
  const hasOdds = t !== null || sh !== null;
  if (!hasOdds) return null;

  acc.games_counted += 1;

  const combined = hs + as;
  let ouResult = null;
  if (t !== null) {
    if (combined > t) {
      acc.overs_wins += 1;
      ouResult = 'over';
    } else if (combined < t) {
      acc.overs_losses += 1;
      ouResult = 'under';
    } else {
      acc.overs_pushes += 1;
      ouResult = 'push';
    }
  }

  const winner = hs > as ? 'home' : as > hs ? 'away' : 'push';

  // Favorite = the side laying the runs/points: a NEGATIVE home spread means the
  // home team is favored. We read the SPREAD SIGN, not the moneyline — the BDL
  // odds feed only keeps the latest snapshot, which post-game is the settled line,
  // so its moneyline is circular (the winner reads -50000). The run-line sign
  // still reflects who was favored. (A blowout upset can flip a live spread; rare.)
  let favorite = null;
  if (sh !== null && sh !== 0) favorite = sh < 0 ? 'home' : 'away';
  if (favorite && winner !== 'push') {
    if (favorite === winner) { acc.fav_wins += 1; acc.dog_losses += 1; }
    else { acc.fav_losses += 1; acc.dog_wins += 1; }
  }

  return { matchup, total: t, combined, ouResult, favorite, winner, spreadHome: sh };
}

/**
 * Soccer twin of accumulate() for the World Cup's 3-way market. O/U is the same
 * (total goals vs the closing total); the moneyline is home/draw/away, so the
 * favorite is the most-negative of the three and "won" only if that exact
 * outcome (incl. draw) is the 90' result. Dog flat-stake units are not tracked
 * (the strip shows records, not units, and a 3-way dog is ambiguous).
 */
function accumulateSoccer(acc, { matchup, homeScore, awayScore, total, spreadHome }) {
  const hs = num(homeScore);
  const as = num(awayScore);
  if (hs === null || as === null) return null;

  const t = num(total);
  const sh = num(spreadHome);
  const hasOdds = t !== null || sh !== null;
  if (!hasOdds) return null;

  acc.games_counted += 1;

  const combined = hs + as;
  let ouResult = null;
  if (t !== null) {
    if (combined > t) { acc.overs_wins += 1; ouResult = 'over'; }
    else if (combined < t) { acc.overs_losses += 1; ouResult = 'under'; }
    else { acc.overs_pushes += 1; ouResult = 'push'; }
  }

  // 3-way result + favorite from the handicap sign (negative home line → home
  // favored). The settled feed's 3-way moneyline is circular, same as MLB; the
  // handicap sign reflects who was favored. A draw or an upset is a favorite loss.
  const result = hs > as ? 'home' : as > hs ? 'away' : 'draw';
  let favorite = null;
  if (sh !== null && sh !== 0) favorite = sh < 0 ? 'home' : 'away';
  if (favorite) {
    if (favorite === result) acc.fav_wins += 1;
    else acc.fav_losses += 1;
  }

  return { matchup, total: t, combined, ouResult, favorite, result };
}

function freshAcc() {
  return {
    overs_wins: 0,
    overs_losses: 0,
    overs_pushes: 0,
    fav_wins: 0,
    fav_losses: 0,
    dog_wins: 0,
    dog_losses: 0,
    dog_net_units: 0,
    games_counted: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-league builders → { row, meta }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MLB: getMlbGamesForDate(date) for finals + getMlbGameOdds({ dates:[date] })
 * joined by game id. Score fields are home_team_data.runs / away_team_data.runs;
 * odds fields are total_value, moneyline_home_odds, moneyline_away_odds
 * (confirmed in ballDontLieOddsService.js / poll-live-scores.js).
 */
async function buildMlb(date) {
  const [games, oddsRows] = await Promise.all([
    bdl.getMlbGamesForDate(date),
    bdl.getMlbGameOdds({ dates: [date] }),
  ]);

  // Multiple vendor rows per game → take the median closing number per field.
  const oddsByGame = new Map();
  for (const r of oddsRows || []) {
    const gid = r.game_id;
    if (gid == null) continue;
    if (!oddsByGame.has(gid)) oddsByGame.set(gid, []);
    oddsByGame.get(gid).push(r);
  }

  const acc = freshAcc();
  const meta = [];

  for (const g of games || []) {
    const status = String(g.status || '').toUpperCase();
    const isFinal = status.includes('FINAL');
    const homeScore = num(g.home_team_data?.runs);
    const awayScore = num(g.away_team_data?.runs);
    if (!isFinal || homeScore === null || awayScore === null) continue;

    const rows = oddsByGame.get(g.id) || [];
    const total = median(rows.map((r) => num(r.total_value)));
    const spreadHome = median(rows.map((r) => num(r.spread_home_value)));

    const matchup = `${teamName(g.away_team)} @ ${teamName(g.home_team)}`;
    const rec = accumulate(acc, { matchup, homeScore, awayScore, total, spreadHome });
    if (rec) meta.push(rec);
  }

  return { acc, meta };
}

/**
 * NBA: getGamesWithOddsForSport('basketball_nba', date) yields the unified
 * { id, home_team, away_team, bookmakers:[{ markets:[{ key, outcomes }] }] }
 * shape (totals + h2h). Finals come from getNbaGamesForDate(date)
 * (home_team_score / visitor_team_score). Join by game id.
 */
async function buildNba(date) {
  const [oddsGames, finalGames] = await Promise.all([
    ballDontLieOddsService.getGamesWithOddsForSport('basketball_nba', date),
    bdl.getNbaGamesForDate(date),
  ]);

  const finalById = new Map();
  for (const g of finalGames || []) {
    if (g?.id != null) finalById.set(g.id, g);
  }

  const acc = freshAcc();
  const meta = [];

  for (const og of oddsGames || []) {
    const fg = finalById.get(og.id);
    if (!fg) continue;
    const status = String(fg.status || '').toUpperCase();
    if (!status.includes('FINAL')) continue;
    const homeScore = num(fg.home_team_score);
    const awayScore = num(fg.visitor_team_score);
    if (homeScore === null || awayScore === null) continue;

    // Median closing total + ML across the game's bookmakers (extractFromBookmaker
    // shape: markets keyed 'totals' / 'h2h', outcomes named Over/Under or team).
    const totalPoints = [];
    const spreadHomeVals = [];
    const homeNm = og.home_team;
    const awayNm = og.away_team;
    const lastWord = (s) => String(s || '').trim().split(/\s+/).pop().toLowerCase();
    const homeLast = lastWord(homeNm);

    for (const bk of og.bookmakers || []) {
      for (const mkt of bk.markets || []) {
        if (mkt.key === 'totals') {
          const over = (mkt.outcomes || []).find((o) => o.name === 'Over');
          if (over && num(over.point) !== null) totalPoints.push(num(over.point));
        } else if (mkt.key === 'spreads') {
          for (const o of mkt.outcomes || []) {
            if (lastWord(o.name) === homeLast && num(o.point) !== null) spreadHomeVals.push(num(o.point));
          }
        }
      }
    }

    const total = median(totalPoints);
    const spreadHome = median(spreadHomeVals);

    const matchup = `${awayNm} @ ${homeNm}`;
    const rec = accumulate(acc, { matchup, homeScore, awayScore, total, spreadHome });
    if (rec) meta.push(rec);
  }

  return { acc, meta };
}

/**
 * WC: getMatchesForDate(date) for finished matches + getOdds({ matchIds }) for the
 * 3-way moneyline + total (median across vendors). Score is the 90' regulation
 * result (getRegulationScore — half-scores or home_score/away_score). Join by match id.
 */
async function buildWc(date) {
  const matches = (await fifa.getMatchesForDate(date)) || [];
  const completed = matches.filter((m) => String(m.status || '').toLowerCase() === 'completed');
  if (!completed.length) return { acc: freshAcc(), meta: [] };

  let oddsRows = [];
  try {
    oddsRows = (await fifa.getOdds({ matchIds: completed.map((m) => m.id) })) || [];
  } catch (err) {
    console.error('[WC] odds fetch failed:', err?.message || err);
  }
  const oddsByMatch = new Map();
  for (const r of oddsRows) {
    const mid = r.match_id ?? r.matchId ?? r.match?.id;
    if (mid == null) continue;
    if (!oddsByMatch.has(mid)) oddsByMatch.set(mid, []);
    oddsByMatch.get(mid).push(r);
  }

  const acc = freshAcc();
  const meta = [];
  for (const m of completed) {
    const sc = fifa.getRegulationScore(m);
    if (!sc || sc.home == null || sc.away == null) continue;
    const rows = oddsByMatch.get(m.id) || [];
    const total = median(rows.map((r) => num(r.total_value)));
    const spreadHome = median(rows.map((r) => num(r.spread_home_value)));
    const matchup = `${teamName(m.away_team)} @ ${teamName(m.home_team)}`;
    const rec = accumulateSoccer(acc, { matchup, homeScore: sc.home, awayScore: sc.away, total, spreadHome });
    if (rec) meta.push(rec);
  }
  return { acc, meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `\n📊 Market Pulse — date=${targetDate} leagues=${leagues.join(', ')}` +
      (dryRun ? ' (DRY RUN)' : '')
  );

  const rows = [];
  let failures = 0;

  for (const league of leagues) {
    console.log(`\n── ${league} ──`);
    try {
      const { acc, meta } = league === 'MLB' ? await buildMlb(targetDate)
        : league === 'NBA' ? await buildNba(targetDate)
        : await buildWc(targetDate);

      if (acc.games_counted === 0) {
        console.log(`   No gradeable ${league} games (score + odds) for ${targetDate}.`);
        continue;
      }

      const row = {
        date: targetDate,
        league,
        overs_wins: acc.overs_wins,
        overs_losses: acc.overs_losses,
        overs_pushes: acc.overs_pushes,
        fav_wins: acc.fav_wins,
        fav_losses: acc.fav_losses,
        dog_wins: acc.dog_wins,
        dog_losses: acc.dog_losses,
        dog_net_units: Number(acc.dog_net_units.toFixed(2)),
        games_counted: acc.games_counted,
        meta,
        generated_by: 'run-market-pulse.js',
      };
      rows.push(row);

      console.log(
        `   ${league}: ${acc.games_counted} games | O/U ${acc.overs_wins}-${acc.overs_losses}-${acc.overs_pushes} | ` +
          `Fav (spread) ${acc.fav_wins}-${acc.fav_losses}`
      );
    } catch (err) {
      failures += 1;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`   ❌ [${league}] market pulse failed: ${detail}`);
    }
  }

  if (rows.length === 0) {
    console.log(`\n${dryRun ? '🧪 DRY RUN complete' : '✅ Done'} — no rows computed for ${targetDate}.`);
    if (failures > 0 && failures === leagues.length) process.exit(1);
    return;
  }

  if (dryRun) {
    console.log(`\n🧪 Would upsert ${rows.length} row(s):`);
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\n🧪 DRY RUN complete — ${rows.length} row(s) computed for ${targetDate}.`);
    return;
  }

  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'date,league' });
  if (error) {
    console.error(`   ❌ Upsert failed: ${error.message}${error.code ? ' [code=' + error.code + ']' : ''}`);
    process.exit(1);
  }

  console.log(`\n✅ Done — upserted ${rows.length} market_pulse row(s) for ${targetDate}.`);

  // Non-zero exit only if EVERY league failed.
  if (failures > 0 && failures === leagues.length) process.exit(1);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Market Pulse runner crashed:', error);
    process.exit(1);
  });
