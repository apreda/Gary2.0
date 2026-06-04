// gary2.0/src/services/insights/computers/regressionWatch.js
//
// LANE: regressionWatch
// Two independent regression signals, surfaced as separate connection rows:
//   (A) TEAM one-run-game luck: a team with an extreme one-run record is
//       living on the high-variance edge of the standings; that win% tends to
//       regress. Sourced from getMlbStandings(season).
//   (B) PITCHER ERA vs xERA gap (and opp BA vs xBA) from Baseball Savant's
//       expected_statistics leaderboard — a starter dramatically out- or
//       under-performing his expected run prevention.
//
// IMPORTANT — methods/fields quoted from the reference (no invention):
//   * getMlbStandings(season): "Returns Array of per-team records ... team
//     (object: { id, full_name, name, abbreviation, ... }), wins, losses,
//     home (string '24-12'), road (string), last_ten_games, streak,
//     win_percent (decimal 0-1)." NOTE: the documented standings shape does
//     NOT include a one-run-record field; we DERIVE a one-run proxy from the
//     documented fields and only surface it when a real one-run field is
//     present on the row (checked defensively — never invented).
//   * getPitcherXStats(year) from baseballSavantService: returns rows with
//     "{ player_id, name, era, xera, era_minus_xera_diff, ba (opp), est_ba
//     (xBA), woba, est_woba, ... }". Savant naming is est_ba/est_woba and
//     literal `xera` for pitchers, with convenience `era_minus_xera_diff`.
//     Rows carry last_name/first_name; join via getMlbLineups starter name.
//   * getMlbLineups(gameId): per-team pitcher { name, playerId }.
//
// Defensive: every field is existence-checked; missing -> skip that signal.

import {
  makeRow, TONES, scoreFromEdge, round, pct3, nameKey,
} from '../shared.js';
import { getPitcherXStats } from '../../baseballSavantService.js';

// (A) one-run record tunables.
const MIN_ONE_RUN_GAMES = 12;     // need a real one-run sample
const ONE_RUN_WIN_PCT_EXTREME = 0.640; // |wp - .5| this far -> flag
// (B) ERA-xERA tunables.
const MIN_ERA_XERA_GAP = 1.10;    // |ERA - xERA| this big -> flag
const MAX_TEAM_ROWS = 6;          // cap one-run rows per slate
const REL_ONE_RUN_SCALE = 120;
const REL_XERA_SCALE = 18;

export async function computeRegressionWatch(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];

  // Pull both data sources once for the whole slate.
  // getMlbStandings(season) — positional arg.
  let standings = [];
  try {
    standings = (await bdl.getMlbStandings(season)) || [];
  } catch (err) {
    console.error('[regressionWatch] standings error:', err?.message || err);
  }

  // getPitcherXStats(year) — whole-league CSV, cached 24h.
  let pitcherX = [];
  try {
    pitcherX = (await getPitcherXStats(season)) || [];
  } catch (err) {
    console.error('[regressionWatch] savant pitcher xStats error:', err?.message || err);
  }
  const xByName = indexXStatsByName(pitcherX);

  // --- Signal A: one-run-game regression (team level, slate teams only) ---
  if (Array.isArray(standings) && standings.length) {
    const slateTeamIds = collectSlateTeamIds(games);
    const oneRunRows = oneRunRegression(standings, games, slateTeamIds);
    rows.push(...oneRunRows.slice(0, MAX_TEAM_ROWS));
  }

  // --- Signal B: starter ERA vs xERA gap (per game) ---
  for (const game of games) {
    try {
      rows.push(...(await xeraForGame(game, { season, bdl, xByName, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[regressionWatch] xERA game error:', err?.message || err);
    }
  }

  return rows;
}

/* --------------------------- Signal A helpers --------------------------- */

function collectSlateTeamIds(games) {
  const ids = new Set();
  for (const g of games) {
    if (g?.home_team?.id != null) ids.add(g.home_team.id);
    if (g?.visitor_team?.id != null) ids.add(g.visitor_team.id);
  }
  return ids;
}

/** Map a team id -> the slate game (label/game_id) it appears in. */
function gameForTeamId(games, teamId) {
  for (const g of games) {
    if (g?.home_team?.id === teamId || g?.visitor_team?.id === teamId) return g;
  }
  return null;
}

/**
 * Surface teams whose ONE-RUN record win% is extreme. We ONLY read a one-run
 * field if it actually exists on the standings row under a plausible key — the
 * documented shape does not guarantee it, so this is existence-checked and
 * skipped entirely when absent (no invented fields).
 */
function oneRunRegression(standings, games, slateTeamIds) {
  const out = [];
  for (const row of standings) {
    const teamId = row?.team?.id;
    if (teamId == null || !slateTeamIds.has(teamId)) continue;

    const oneRun = readOneRunRecord(row);
    if (!oneRun) continue; // field not present -> skip (defensive)

    const { w, l } = oneRun;
    const gp = w + l;
    if (gp < MIN_ONE_RUN_GAMES) continue;
    const wp = w / gp;
    if (Math.abs(wp - 0.5) < (ONE_RUN_WIN_PCT_EXTREME - 0.5)) continue;

    const game = gameForTeamId(games, teamId);
    if (!game) continue;

    const lucky = wp > 0.5;
    const teamName = row.team?.full_name || row.team?.name || row.team?.abbreviation || 'Team';
    out.push(
      makeRow({
        category: 'regressionWatch',
        headline: `${teamName} are ${w}-${l} in one-run games (${pct3(wp)} win%)`,
        detail:
          `${teamName} own a ${w}-${l} record in one-run games — a ${pct3(wp)} ` +
          `win rate that is largely high-variance and tends to regress toward .500. ` +
          `Their overall record may ${lucky ? 'overstate' : 'understate'} their ` +
          `true strength relative to where the market prices them.`,
        game: game.home_team && game.visitor_team
          ? `${game.visitor_team.abbreviation || game.visitor_team.name} @ ${game.home_team.abbreviation || game.home_team.name}`
          : 'TBD',
        value: `${w}-${l}`,
        tone: lucky ? TONES.CAUTION : TONES.EDGE,
        spark: [w, l],
        relevance_score: scoreFromEdge(Math.abs(wp - 0.5), { scale: REL_ONE_RUN_SCALE, base: 40 }),
        team_id: teamId,
        game_id: game.id,
      }),
    );
  }
  return out.sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Read a one-run record from a standings row IF a one-run field exists.
 * Accepts a "W-L" string field or {wins,losses} sub-object. Returns null when
 * no such field is present (we do not fabricate one from total record).
 */
function readOneRunRecord(row) {
  const candidates = [
    row?.one_run, row?.one_run_record, row?.record_one_run, row?.oneRun, row?.last_one_run,
  ];
  for (const c of candidates) {
    const parsed = parseWL(c);
    if (parsed) return parsed;
  }
  return null;
}

/** Parse "12-9" or { wins, losses } -> { w, l }. */
function parseWL(v) {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return null;
    return { w: Number(m[1]), l: Number(m[2]) };
  }
  if (typeof v === 'object') {
    const w = Number(v.wins ?? v.w);
    const l = Number(v.losses ?? v.l);
    if (Number.isFinite(w) && Number.isFinite(l)) return { w, l };
  }
  return null;
}

/* --------------------------- Signal B helpers --------------------------- */

async function xeraForGame(game, { season, bdl, xByName, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const starters = [
    { entry: lineups[game?.home_team?.abbreviation], teamId: game?.home_team?.id },
    { entry: lineups[game?.visitor_team?.abbreviation], teamId: game?.visitor_team?.id },
  ];

  const out = [];
  for (const { entry, teamId } of starters) {
    const pitcher = entry?.pitcher;
    const name = pitcher?.name;
    if (!name) continue;

    const x = xByName.get(nameKey(name)) || xByName.get(lastNameKey(name));
    if (!x) continue;

    const era = Number(x.era);
    const xera = Number(x.xera);
    if (!Number.isFinite(era) || !Number.isFinite(xera)) continue;

    // Prefer the documented convenience diff when present.
    const gap = Number.isFinite(Number(x.era_minus_xera_diff))
      ? Number(x.era_minus_xera_diff)
      : era - xera;
    if (Math.abs(gap) < MIN_ERA_XERA_GAP) continue;

    const overperforming = gap < 0; // ERA below xERA = lucky/overperforming
    const oppBa = Number(x.ba);
    const oppXba = Number(x.est_ba);
    const baBit =
      Number.isFinite(oppBa) && Number.isFinite(oppXba)
        ? ` Opponents hit ${pct3(oppBa)} off him vs a ${pct3(oppXba)} expected (xBA).`
        : '';

    out.push(
      makeRow({
        category: 'regressionWatch',
        headline: `${name}: ${round(era, 2)} ERA vs ${round(xera, 2)} xERA`,
        detail:
          `${name} carries a ${round(era, 2)} ERA against a ${round(xera, 2)} ` +
          `expected ERA (${round(Math.abs(gap), 2)} run gap), so he has been ` +
          `${overperforming ? 'outperforming his contact quality' : 'underperforming his contact quality'}.` +
          baBit +
          ` Most lines price off his season ERA, which may not reflect that gap.`,
        game: label,
        value: `${round(xera, 2)}`,
        tone: overperforming ? TONES.CAUTION : TONES.EDGE,
        spark: [round(era, 2), round(xera, 2)],
        relevance_score: scoreFromEdge(gap, { scale: REL_XERA_SCALE, base: 45 }),
        player_id: x.player_id != null ? x.player_id : undefined,
        team_id: teamId,
        game_id: gameId,
      }),
    );
  }
  return out;
}

/**
 * Index Savant pitcher xStats rows by a full-name key and a last-name key.
 * Rows carry last_name/first_name (Savant CSV split).
 */
function indexXStatsByName(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const last = r?.last_name || '';
    const first = r?.first_name || '';
    if (last) {
      map.set(nameKey(`${first} ${last}`), r);
      // last-name-only fallback (collides on duplicate surnames — accepted)
      if (!map.has(nameKey(last))) map.set(nameKey(last), r);
    } else if (r?.name) {
      map.set(nameKey(r.name), r);
    }
  }
  return map;
}

function lastNameKey(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return nameKey(parts[parts.length - 1] || '');
}

export default { computeRegressionWatch };
