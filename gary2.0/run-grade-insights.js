#!/usr/bin/env node
/**
 * Insight Connections Grader
 *
 * Grades yesterday's `insight_connections` rows against what actually happened.
 * Each row claimed an angle (a hot bat, a fading bat, an owned matchup, a gassed
 * bullpen, a regression watch …); this script joins the relevant player box rows
 * and final scores and stamps result ('hit' | 'miss' | 'push' | NULL) +
 * result_note (one-line evidence) + graded_at on the row.
 *
 * Read pattern + Supabase service-role REST headers MIRROR run-insight-connections.js
 * (axios with the SUPABASE_SERVICE_ROLE_KEY, falling back to the anon key). Reads
 * the day's rows, fetches box stats / final scores ONCE per slate, grades, then
 * PATCHes each graded row. Idempotent: only rows whose result IS NULL are graded
 * unless --force is passed.
 *
 * Fully defensive (house rule): a missing box row / unresolvable game NEVER throws
 * — the row is left untouched (so it grades on the next run) and counted in the log.
 *
 * Usage:
 *   node run-grade-insights.js                       # yesterday (EST), all leagues
 *   node run-grade-insights.js --date 2026-06-02     # specific date
 *   node run-grade-insights.js --league MLB          # single league
 *   node run-grade-insights.js --force               # re-grade already-graded rows
 *   node run-grade-insights.js --dry-run             # print verdicts, write nothing
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GRADING RULES (result_note = one-line evidence, e.g. "2-for-4, 3 TB")
 * ─────────────────────────────────────────────────────────────────────────────
 * MLB player rows — join the box row by String(player.id) === row.player_id.
 *   A missing box row leaves the row fully untouched ("skipped (no box row)").
 *
 *   category          tone   HIT                 PUSH            MISS
 *   ──────────────────────────────────────────────────────────────────────────
 *   heat_check        good   total_bases >= 2    total_bases==1  total_bases==0
 *   cooling_off       (any)  total_bases == 0    total_bases==1  total_bases>=2
 *   platoon_edge      (any)  hits >= 1           0 hits & bb>=1  else
 *   owned             good   hits >= 1           bb >= 1         else  (hitter owns)
 *   owned             bad    hits == 0           hits == 1       hits >= 2  (pitcher owns)
 *   beneficiary       (any)  hits >= 1           bb >= 1         else
 *   ballpark_shift    bad    er >= 4             er == 3         er <= 2   (pitcher; needs ip>0)
 *   ballpark_shift    good   er <= 2             er == 3         er >= 4   (pitcher; needs ip>0)
 *   regression_watch  bad    pitcher er>=4 / hitter hits==0      mirrored push/miss
 *   regression_watch  good   pitcher er<=2 / hitter hits>=2      mirrored push/miss
 *
 *   regression_watch picks its pitcher-vs-hitter branch off the box row itself:
 *   ip > 0 -> pitching grade (er bands), else -> hitter grade (hits bands).
 *   ballpark_shift requires ip > 0 in the box row, else the row is skipped.
 *
 * MLB team rows (player_id null, team_id set):
 *   rest_fatigue      bad    flagged team LOST   —               flagged team WON
 *   (other team rows)        —  WRITES result NULL + note "context row — not graded"
 *                              + graded_at so it never re-processes.
 *
 * NBA rows:
 *   streak            good   team won            —               team lost
 *   streak            bad    team lost           —               team won
 *   owned             (any)  team won            —               team lost
 *   rest_fatigue      bad    flagged team lost   —               flagged team won
 *   beneficiary       —  context-row treatment (NULL + note + graded_at)
 *
 * Postponed / not-final games -> the row is left fully untouched (grades next run).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// MUST load env vars FIRST before any other imports
import './src/loadEnv.js';

import axios from 'axios';
import { getESTDate } from './src/utils/dateUtils.js';
import { nameKey } from './src/services/insights/shared.js';

// Import after env is loaded (services read env at module init time)
const { ballDontLieService: bdl } = await import('./src/services/ballDontLieService.js');
const fifaWorldCup = await import('./src/services/fifaWorldCupService.js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues we grade. Matches ACTIVE_LEAGUES in run-insight-connections.js.
const ACTIVE_LEAGUES = ['MLB', 'NBA', 'WC'];

// Resolve Supabase config exactly like run-insight-connections.js / supabaseClient.js.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role key bypasses RLS on the server; fall back to anon if unset.
const adminKey = supabaseServiceKey || supabaseAnonKey;

const TABLE = 'insight_connections';
const REST_URL = supabaseUrl ? `${supabaseUrl}/rest/v1/${TABLE}` : null;

const restHeaders = {
  apikey: adminKey,
  Authorization: `Bearer ${adminKey}`,
  'Content-Type': 'application/json',
};

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing (mirrors run-insight-connections.js)
// ─────────────────────────────────────────────────────────────────────────────

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

const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const dateArg = getArgValue('--date');
const leagueArg = getArgValue('--league');

/** YYYY-MM-DD shifted by `delta` days via UTC math (no tz drift). */
function addDays(dateStr, delta) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const base = Date.UTC(y, (m || 1) - 1, d || 1);
  const shifted = new Date(base + delta * 86400000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Date: --date if given, else YESTERDAY in EST (today EST minus one day, UTC-safe).
const targetDate = dateArg || addDays(getESTDate(), -1);
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

// Leagues: --league (comma-separated, case-insensitive) filtered to ACTIVE_LEAGUES,
// else all active leagues.
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
    `❌ No active leagues to grade. Active: ${ACTIVE_LEAGUES.join(', ')}` +
      (leagueArg ? ` (requested: ${leagueArg})` : ''),
  );
  process.exit(1);
}

if (!REST_URL || !adminKey) {
  console.error(
    '❌ Supabase configuration missing. Set SUPABASE_URL and ' +
      'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in the environment.',
  );
  process.exit(1);
}
if (!dryRun && !supabaseServiceKey) {
  console.warn(
    '⚠️  SUPABASE_SERVICE_ROLE_KEY not set — falling back to the anon key. ' +
      'Writes will fail unless RLS permits anon updates.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const HIT = 'hit';
const MISS = 'miss';
const PUSH = 'push';

/** A row's tone is "good" (HOT/EDGE) vs "bad" (COLD/CAUTION) — normalizeTone output. */
function isGood(tone) { return String(tone || '').toLowerCase() === 'good'; }
function isBad(tone) { return String(tone || '').toLowerCase() === 'bad'; }

/** Parse an MLB "ip" thirds-decimal value (5.2 = 5 2/3) into true innings; 0 on garbage. */
function parseIp(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n) || n < 0) return 0;
  const whole = Math.floor(n);
  const thirds = Math.round((n - whole) * 10); // 0, 1, 2
  return whole + thirds / 3;
}

/** Coerce a box-stat field to a finite number, or null when absent/garbage. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A game is gradeable only once it is truly final. */
function isFinal(status) {
  return String(status || '').toUpperCase().includes('FINAL');
}

/**
 * Winner of a final MLB game. Prefer the box-derived team_data.runs the games
 * endpoint carries; fall back to summing each team's box-row `runs` by team_name.
 * Returns { home, away, homeRuns, awayRuns } | null when unresolvable.
 */
function mlbWinner(game, boxRowsByGame) {
  const homeRuns = num(game?.home_team_data?.runs);
  const awayRuns = num(game?.away_team_data?.runs);
  if (homeRuns != null && awayRuns != null && homeRuns !== awayRuns) {
    return resolveWinner(game, homeRuns, awayRuns);
  }

  // Fallback: sum box-row runs per team_name (the spec's derive-by-runs path).
  const rows = boxRowsByGame.get(String(game?.id)) || [];
  const tallies = new Map(); // team_name -> runs
  for (const r of rows) {
    const tn = r?.team_name;
    if (!tn) continue;
    const runs = num(r.runs) || 0;
    tallies.set(tn, (tallies.get(tn) || 0) + runs);
  }
  const homeName = game?.home_team?.display_name || game?.home_team_name;
  const awayName = game?.away_team?.display_name || game?.away_team_name;
  const hR = tallies.get(homeName);
  const aR = tallies.get(awayName);
  if (hR == null || aR == null || hR === aR) return null;
  return resolveWinner(game, hR, aR);
}

function resolveWinner(game, homeRuns, awayRuns) {
  return {
    homeId: game?.home_team?.id != null ? String(game.home_team.id) : null,
    awayId: (game?.away_team?.id ?? game?.visitor_team?.id) != null
      ? String(game.away_team?.id ?? game.visitor_team?.id)
      : null,
    homeRuns,
    awayRuns,
    winnerSide: homeRuns > awayRuns ? 'home' : 'away',
  };
}

/** Winner of a final NBA game from home_team_score / visitor_team_score. */
function nbaWinner(game) {
  const homeScore = num(game?.home_team_score);
  const awayScore = num(game?.visitor_team_score);
  if (homeScore == null || awayScore == null || homeScore === awayScore) return null;
  return {
    homeId: game?.home_team?.id != null ? String(game.home_team.id) : null,
    awayId: game?.visitor_team?.id != null ? String(game.visitor_team.id) : null,
    homeScore,
    awayScore,
    winnerSide: homeScore > awayScore ? 'home' : 'away',
  };
}

/** Did this team_id WIN the resolved game? null when the team isn't in the game. */
function teamWon(winner, teamId) {
  if (!winner || teamId == null) return null;
  const id = String(teamId);
  if (id === winner.homeId) return winner.winnerSide === 'home';
  if (id === winner.awayId) return winner.winnerSide === 'away';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read path (service-role REST — mirrors run-insight-connections.js)
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the day's rows for a league. */
async function fetchRows(date, league) {
  const res = await axios({
    method: 'GET',
    url: REST_URL,
    headers: restHeaders,
    params: {
      date: `eq.${date}`,
      league: `eq.${league}`,
      select: 'id,league,category,tone,player_id,team_id,game_id,headline,value,result,result_note,graded_at',
    },
  });
  return Array.isArray(res.data) ? res.data : [];
}

/** PATCH one row's grade. Prefer return=minimal. */
async function writeGrade(id, result, resultNote, gradedAt) {
  await axios({
    method: 'PATCH',
    url: REST_URL,
    headers: { ...restHeaders, Prefer: 'return=minimal' },
    params: { id: `eq.${id}` },
    data: { result, result_note: resultNote, graded_at: gradedAt },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-row graders
// ─────────────────────────────────────────────────────────────────────────────

// A grader returns one of:
//   { result, note }          -> write result + note + graded_at
//   { result: null, note }    -> context row: write NULL result + note + graded_at
//   { skip, reason }          -> leave the row fully untouched, count under `reason`
function skip(reason) { return { skip: true, reason }; }

/** Build the "2-for-4, N TB" style evidence string for a hitter box row. */
function hitterNote(box) {
  const ab = num(box.at_bats);
  const h = num(box.hits) || 0;
  const tb = num(box.total_bases);
  const bb = num(box.bb) || 0;
  const parts = [];
  if (ab != null) parts.push(`${h}-for-${ab}`);
  else parts.push(`${h} hit${h === 1 ? '' : 's'}`);
  if (tb != null) parts.push(`${tb} TB`);
  if (bb) parts.push(`${bb} BB`);
  return parts.join(', ');
}

/** Build the "5.2 IP, N ER" style evidence string for a pitcher box row. */
function pitcherNote(box) {
  const parts = [];
  if (box.ip != null) parts.push(`${box.ip} IP`);
  const er = num(box.er);
  if (er != null) parts.push(`${er} ER`);
  const k = num(box.p_k);
  if (k != null) parts.push(`${k} K`);
  return parts.join(', ');
}

function gradeHeatCheck(row, box) {
  const tb = num(box.total_bases);
  if (tb == null) return skip('no total_bases');
  const result = tb >= 2 ? HIT : tb === 1 ? PUSH : MISS;
  return { result, note: hitterNote(box) };
}

function gradeCoolingOff(row, box) {
  const tb = num(box.total_bases);
  if (tb == null) return skip('no total_bases');
  // Cold-bat claim grades INVERSELY to production: 0 TB confirms the cold note.
  const result = tb === 0 ? HIT : tb === 1 ? PUSH : MISS;
  return { result, note: hitterNote(box) };
}

function gradePlatoonEdge(row, box) {
  const hits = num(box.hits);
  if (hits == null) return skip('no hits');
  const bb = num(box.bb) || 0;
  const result = hits >= 1 ? HIT : (hits === 0 && bb >= 1) ? PUSH : MISS;
  return { result, note: hitterNote(box) };
}

function gradeBeneficiary(row, box) {
  const hits = num(box.hits);
  if (hits == null) return skip('no hits');
  const bb = num(box.bb) || 0;
  const result = hits >= 1 ? HIT : bb >= 1 ? PUSH : MISS;
  return { result, note: hitterNote(box) };
}

function gradeOwned(row, box) {
  const hits = num(box.hits);
  if (hits == null) return skip('no hits');
  const bb = num(box.bb) || 0;
  if (isGood(row.tone)) {
    // Hitter owns the matchup — a hit confirms it.
    const result = hits >= 1 ? HIT : bb >= 1 ? PUSH : MISS;
    return { result, note: hitterNote(box) };
  }
  // Pitcher owns the hitter — holding him hitless confirms it.
  const result = hits === 0 ? HIT : hits === 1 ? PUSH : MISS;
  return { result, note: hitterNote(box) };
}

function gradeBallparkShift(row, box) {
  const ip = parseIp(box.ip);
  if (!(ip > 0)) return skip('no pitching work (ip<=0)');
  const er = num(box.er);
  if (er == null) return skip('no er');
  let result;
  if (isBad(row.tone)) {
    // Claim: he is WORSE at this park — a rough outing confirms it.
    result = er >= 4 ? HIT : er === 3 ? PUSH : MISS;
  } else {
    // Claim: he is BETTER at this park — a clean outing confirms it.
    result = er <= 2 ? HIT : er === 3 ? PUSH : MISS;
  }
  return { result, note: pitcherNote(box) };
}

function gradeRegressionWatch(row, box) {
  const ip = parseIp(box.ip);
  if (ip > 0) {
    // Pitcher row: ERA-vs-xERA regression claim grades on earned runs.
    const er = num(box.er);
    if (er == null) return skip('no er');
    let result;
    if (isBad(row.tone)) {
      // ERA was FLATTERED (running hot) — a rough outing confirms regression.
      result = er >= 4 ? HIT : er === 3 ? PUSH : MISS;
    } else {
      // ERA was INFLATED (unlucky) — a clean outing confirms positive regression.
      result = er <= 2 ? HIT : er === 3 ? PUSH : MISS;
    }
    return { result, note: pitcherNote(box) };
  }
  // Hitter row.
  const hits = num(box.hits);
  if (hits == null) return skip('no hits');
  let result;
  if (isBad(row.tone)) {
    // Due to cool off — a hitless night confirms it.
    result = hits === 0 ? HIT : hits === 1 ? PUSH : MISS;
  } else {
    // Due to break out — a multi-hit night confirms it.
    result = hits >= 2 ? HIT : hits === 1 ? PUSH : MISS;
  }
  return { result, note: hitterNote(box) };
}

/** MLB team-context rows. rest_fatigue grades on the flagged team's result. */
function gradeMlbTeamRow(row, winner) {
  if (row.category === 'rest_fatigue') {
    const won = teamWon(winner, row.team_id);
    if (won == null) return skip('team not resolvable in game');
    // The flagged (gassed) side is tagged bad/caution — a loss confirms it.
    const result = won ? MISS : HIT;
    const note = `flagged side ${won ? 'won' : 'lost'} ` +
      `${winner.awayRuns}-${winner.homeRuns}`;
    return { result, note };
  }
  // Any other team-context row is not gradeable — write a note so it stops
  // re-processing on every run, but leave result NULL.
  return { result: null, note: 'context row — not graded' };
}

/** NBA rows: streak / owned / rest_fatigue grade on the team result; beneficiary is context. */
function gradeNbaRow(row, winner) {
  if (row.category === 'beneficiary') {
    return { result: null, note: 'context row — not graded' };
  }
  const won = teamWon(winner, row.team_id);
  if (won == null) return skip('team not resolvable in game');
  const score = `${winner.awayScore}-${winner.homeScore}`;
  if (row.category === 'streak') {
    if (isBad(row.tone)) {
      // Slide claim — a loss confirms it.
      return { result: won ? MISS : HIT, note: `team ${won ? 'won' : 'lost'} ${score}` };
    }
    // Win-streak claim — a win confirms it.
    return { result: won ? HIT : MISS, note: `team ${won ? 'won' : 'lost'} ${score}` };
  }
  if (row.category === 'owned') {
    return { result: won ? HIT : MISS, note: `team ${won ? 'won' : 'lost'} ${score}` };
  }
  if (row.category === 'rest_fatigue') {
    // Flagged (tired) side tagged bad — a loss confirms it.
    return { result: won ? MISS : HIT, note: `flagged side ${won ? 'won' : 'lost'} ${score}` };
  }
  // Unknown NBA category — treat as non-graded context so it never re-processes.
  return { result: null, note: 'context row — not graded' };
}

// Dispatch table for MLB PLAYER rows (player_id set).
const MLB_PLAYER_GRADERS = {
  heat_check: gradeHeatCheck,
  cooling_off: gradeCoolingOff,
  platoon_edge: gradePlatoonEdge,
  beneficiary: gradeBeneficiary,
  owned: gradeOwned,
  ballpark_shift: gradeBallparkShift,
  regression_watch: gradeRegressionWatch,
};

// ─────────────────────────────────────────────────────────────────────────────
// League graders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grade one league's rows for the date. Returns
 * { verdicts: [{ row, verdict }], counts, finalLine }.
 * A `verdict` is { result, note } (write), { result:null, note } (context write),
 * or { skip, reason } (leave untouched). Never throws on missing data.
 */
async function gradeMlb(rows) {
  // Distinct slate game ids that actually have rows to grade.
  const gameIds = [...new Set(rows.map((r) => r.game_id).filter((id) => id != null))]
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n));

  // Final scores / winners for the slate (one cached call).
  let slate = [];
  try {
    slate = (await bdl.getMlbGamesForDate(targetDate)) || [];
  } catch (err) {
    console.error(`[grade-insights][MLB] slate fetch failed: ${err?.message || err}`);
    slate = [];
  }
  const gameById = new Map(slate.map((g) => [String(g.id), g]));

  // Box rows for the slate game ids, ONE call, indexed by game_id and player id.
  let boxRows = [];
  if (gameIds.length) {
    try {
      boxRows = (await bdl.getMlbGameStats({ gameIds })) || [];
    } catch (err) {
      console.error(`[grade-insights][MLB] box fetch failed: ${err?.message || err}`);
      boxRows = [];
    }
  }
  const boxByPlayer = new Map();     // String(player.id) -> box row
  const boxRowsByGame = new Map();   // String(game_id) -> rows[]
  // Per-game nameKey -> box row, the fallback when a row's player_id is from a
  // DIFFERENT id namespace than the BDL box (regression_watch pitcher rows carry
  // the Baseball Savant/MLBAM id, which never matches box player.id — so the
  // primary id-join always misses and we have to fall back to the name).
  const boxByGameAndName = new Map(); // String(game_id) -> Map(nameKey -> row)
  for (const r of boxRows) {
    const pid = r?.player?.id;
    if (pid != null) boxByPlayer.set(String(pid), r);
    const gid = r?.game_id;
    if (gid != null) {
      const k = String(gid);
      if (!boxRowsByGame.has(k)) boxRowsByGame.set(k, []);
      boxRowsByGame.get(k).push(r);
      const nk = nameKey(r?.player?.full_name
        || [r?.player?.first_name, r?.player?.last_name].filter(Boolean).join(' '));
      if (nk) {
        if (!boxByGameAndName.has(k)) boxByGameAndName.set(k, new Map());
        boxByGameAndName.get(k).set(nk, r);
      }
    }
  }

  const verdicts = [];
  for (const row of rows) {
    const game = row.game_id != null ? gameById.get(String(row.game_id)) : null;

    // Not-final / postponed / missing-from-slate -> leave fully untouched.
    if (!game) { verdicts.push({ row, verdict: skip('game not on slate') }); continue; }
    if (!isFinal(game.status)) { verdicts.push({ row, verdict: skip('game not final') }); continue; }

    if (row.player_id != null) {
      // Primary join: BDL box player.id === row.player_id (the spec's join).
      let box = boxByPlayer.get(String(row.player_id));
      // Fallback: some rows store a non-BDL id (regression_watch carries the
      // Savant id), so match the headline player name inside the same game.
      if (!box) {
        const nk = nameKey(playerNameFromHeadline(row.headline));
        if (nk) box = boxByGameAndName.get(String(row.game_id))?.get(nk);
      }
      if (!box) { verdicts.push({ row, verdict: skip('no box row') }); continue; }
      const grader = MLB_PLAYER_GRADERS[row.category];
      if (!grader) { verdicts.push({ row, verdict: skip(`no grader for ${row.category}`) }); continue; }
      verdicts.push({ row, verdict: grader(row, box) });
      continue;
    }

    // Team row.
    if (row.team_id != null) {
      const winner = mlbWinner(game, boxRowsByGame);
      if (!winner && row.category === 'rest_fatigue') {
        verdicts.push({ row, verdict: skip('winner unresolvable') });
        continue;
      }
      verdicts.push({ row, verdict: gradeMlbTeamRow(row, winner) });
      continue;
    }

    verdicts.push({ row, verdict: skip('row has neither player_id nor team_id') });
  }

  return verdicts;
}

async function gradeNba(rows) {
  let slate = [];
  try {
    slate = (await bdl.getNbaGamesForDate(targetDate)) || [];
  } catch (err) {
    console.error(`[grade-insights][NBA] slate fetch failed: ${err?.message || err}`);
    slate = [];
  }
  const gameById = new Map(slate.map((g) => [String(g.id), g]));

  const verdicts = [];
  for (const row of rows) {
    const game = row.game_id != null ? gameById.get(String(row.game_id)) : null;
    if (!game) { verdicts.push({ row, verdict: skip('game not on slate') }); continue; }

    const homeScore = num(game.home_team_score);
    const awayScore = num(game.visitor_team_score);
    // Status-first like the MLB path — BDL carries LIVE scores in-progress,
    // so score presence alone must not count as final.
    const final = isFinal(game.status);
    if (!final) { verdicts.push({ row, verdict: skip('game not final') }); continue; }

    const winner = nbaWinner(game);
    if (!winner && row.category !== 'beneficiary') {
      verdicts.push({ row, verdict: skip('winner unresolvable') });
      continue;
    }
    verdicts.push({ row, verdict: gradeNbaRow(row, winner) });
  }

  return verdicts;
}

/**
 * WC rows grade on the match result with soccer draw semantics:
 *   streak (wcForm)  tone good = "unbeaten" claim -> win OR draw extends it (hit);
 *                    a loss breaks it (miss). tone bad = "winless" -> loss/draw
 *                    confirms (hit), a win breaks it (miss).
 *   owned (wcH2h)    the dominant nation (team_id): win hit / draw push / loss miss.
 *   tournament       context lane (group picture / title odds) — NULL + note.
 * Match is final only when status === 'completed'. Winner resolution prefers
 * getAdvanceResult (handles ET + penalties); a level group-stage match is a draw.
 */
function gradeWcRow(row, outcome) {
  if (row.category === 'tournament') {
    return { result: null, note: 'context row — not graded' };
  }
  const teamId = row.team_id != null ? String(row.team_id) : null;
  if (!teamId) return { result: null, note: 'context row — not graded' };

  const { winnerTeamId, isDraw, score } = outcome;
  const won = !isDraw && winnerTeamId != null && String(winnerTeamId) === teamId;
  const lost = !isDraw && winnerTeamId != null && String(winnerTeamId) !== teamId;

  if (row.category === 'streak') {
    if (isBad(row.tone)) {
      // Winless claim — anything but a win confirms it.
      return { result: won ? MISS : HIT, note: `team ${won ? 'won' : isDraw ? 'drew' : 'lost'} ${score}` };
    }
    // Unbeaten claim — a draw still extends it.
    return { result: lost ? MISS : HIT, note: `team ${lost ? 'lost' : isDraw ? 'drew' : 'won'} ${score}` };
  }
  if (row.category === 'owned') {
    if (isDraw) return { result: PUSH, note: `draw ${score}` };
    return { result: won ? HIT : MISS, note: `team ${won ? 'won' : 'lost'} ${score}` };
  }
  return { result: null, note: 'context row — not graded' };
}

async function gradeWc(rows) {
  let slate = [];
  try {
    slate = (await fifaWorldCup.getMatchesForDate(targetDate)) || [];
  } catch (err) {
    console.error(`[grade-insights][WC] slate fetch failed: ${err?.message || err}`);
    slate = [];
  }
  const matchById = new Map(slate.map((m) => [String(m.id), m]));

  const verdicts = [];
  for (const row of rows) {
    const match = row.game_id != null ? matchById.get(String(row.game_id)) : null;
    if (!match) { verdicts.push({ row, verdict: skip('match not on slate') }); continue; }
    if (String(match.status).toLowerCase() !== 'completed') {
      verdicts.push({ row, verdict: skip('match not completed') });
      continue;
    }

    // Winner: advance result first (covers ET + penalties), then full-time score.
    const adv = fifaWorldCup.getAdvanceResult(match);
    const home = Number(match.home_score);
    const away = Number(match.away_score);
    const haveScore = Number.isFinite(home) && Number.isFinite(away);
    const score = haveScore ? `${away}-${home}` : '—';
    let outcome = null;
    if (adv?.teamId != null) {
      outcome = { winnerTeamId: adv.teamId, isDraw: false, score };
    } else if (haveScore && home !== away) {
      outcome = { winnerTeamId: home > away ? match.home_team?.id : match.away_team?.id, isDraw: false, score };
    } else if (haveScore) {
      outcome = { winnerTeamId: null, isDraw: true, score };
    }
    if (!outcome) { verdicts.push({ row, verdict: skip('result unresolvable') }); continue; }

    verdicts.push({ row, verdict: gradeWcRow(row, outcome) });
  }

  return verdicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `\n📊 Grade Insights — date=${targetDate} leagues=${leagues.join(', ')}` +
      (force ? ' (FORCE)' : '') + (dryRun ? ' (DRY RUN)' : ''),
  );

  const nowIso = new Date().toISOString();
  let totalGraded = 0;
  let totalHit = 0;
  let totalMiss = 0;
  let totalPush = 0;
  let hadError = false;

  for (const league of leagues) {
    console.log(`\n── ${league} ──`);

    let allRows;
    try {
      allRows = await fetchRows(targetDate, league);
    } catch (err) {
      hadError = true;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`   ❌ [${league}] read failed: ${detail}`);
      continue;
    }

    if (!allRows.length) {
      console.log(`   No ${league} rows for ${targetDate}.`);
      continue;
    }

    // Idempotency: only ungraded rows unless --force. Context rows keep a
    // NULL result but get graded_at stamped — skip those too so they really
    // never re-process.
    const rows = force ? allRows : allRows.filter((r) => r.result == null && r.graded_at == null);
    const alreadyGraded = allRows.length - rows.length;
    if (alreadyGraded && !force) {
      console.log(`   ${alreadyGraded} row(s) already graded (skipping; use --force to re-grade).`);
    }
    if (!rows.length) {
      console.log(`   Nothing to grade for ${league}.`);
      continue;
    }

    let verdicts;
    try {
      verdicts = league === 'NBA' ? await gradeNba(rows)
        : league === 'WC' ? await gradeWc(rows)
        : await gradeMlb(rows);
    } catch (err) {
      hadError = true;
      console.error(`   ❌ [${league}] grading crashed: ${err?.message || err}`);
      continue;
    }

    // Per-category tally + dry-run verdict table.
    const catCounts = {}; // category -> { hit, miss, push, context, skipped }
    const bump = (cat, key) => {
      if (!catCounts[cat]) catCounts[cat] = { hit: 0, miss: 0, push: 0, context: 0, skipped: 0 };
      catCounts[cat][key] += 1;
    };

    if (dryRun) {
      console.log('   VERDICTS:');
    }

    for (const { row, verdict } of verdicts) {
      if (verdict.skip) {
        bump(row.category, 'skipped');
        if (dryRun) {
          console.log(`     [skip ] ${pad(row.category, 18)} ${pad(idLabel(row), 14)} ${verdict.reason}`);
        }
        continue;
      }

      if (verdict.result == null) {
        bump(row.category, 'context');
      } else {
        bump(row.category, verdict.result);
        totalGraded += 1;
        if (verdict.result === HIT) totalHit += 1;
        else if (verdict.result === MISS) totalMiss += 1;
        else if (verdict.result === PUSH) totalPush += 1;
      }

      if (dryRun) {
        const tag = verdict.result == null ? 'ctx ' : verdict.result;
        console.log(`     [${pad(tag, 4)}] ${pad(row.category, 18)} ${pad(idLabel(row), 14)} ${verdict.note}`);
        continue;
      }

      try {
        await writeGrade(row.id, verdict.result, verdict.note, nowIso);
      } catch (err) {
        hadError = true;
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error(`   ❌ [${league}] write failed for row ${row.id}: ${detail}`);
      }
    }

    // Per-category summary.
    console.log(`   ${league} per-category:`);
    for (const cat of Object.keys(catCounts).sort()) {
      const c = catCounts[cat];
      const bits = [
        `${c.hit} hit`, `${c.miss} miss`, `${c.push} push`,
        c.context ? `${c.context} context` : null,
        c.skipped ? `${c.skipped} skipped` : null,
      ].filter(Boolean);
      console.log(`     ${pad(cat, 18)} ${bits.join(' / ')}`);
    }
  }

  console.log(
    `\n${dryRun ? '🧪 DRY RUN' : '✅'} GRADED: ${totalGraded} rows -> ` +
      `${totalHit} hit / ${totalMiss} miss / ${totalPush} push` +
      (dryRun ? ' (nothing written)' : ''),
  );

  if (hadError) process.exit(1);
}

/** Right-pad a string to width for the dry-run table. */
function pad(s, w) {
  const str = String(s ?? '');
  return str.length >= w ? str : str + ' '.repeat(w - str.length);
}

/**
 * Best-effort player name from a row headline. Insight headlines lead with the
 * player's name followed by a delimiter — ":" (regression_watch), " is "
 * (heat_check / owned), " has " (cooling_off / owned-pitcher), " (" or " draws "
 * (platoon_edge). We cut at the earliest of those. Used only as the box-row
 * fallback when the stored player_id is from a non-BDL namespace.
 */
function playerNameFromHeadline(headline) {
  const h = String(headline || '');
  if (!h) return '';
  let cut = h.length;
  for (const delim of [':', ' (', ' is ', ' has ', ' draws ']) {
    const i = h.indexOf(delim);
    if (i > 0 && i < cut) cut = i;
  }
  return h.slice(0, cut).trim();
}

/** Compact id label for the dry-run table. */
function idLabel(row) {
  if (row.player_id != null) return `p:${row.player_id}`;
  if (row.team_id != null) return `t:${row.team_id}`;
  return '-';
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Grade insights runner crashed:', error);
    process.exit(1);
  });
