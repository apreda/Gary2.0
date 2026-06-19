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
  makeRow, TONES, scoreFromEdge, round, pct3, nameKey, shiftDateStr,
} from '../shared.js';
import { getPitcherXStats, getPitcherStatcastProfiles } from '../../baseballSavantService.js';
import { getMlbSchedule } from '../../mlbStatsApiService.js';

// (A) one-run record tunables.
const MIN_ONE_RUN_GAMES = 12;     // need a real one-run sample
const ONE_RUN_WIN_PCT_EXTREME = 0.640; // |wp - .5| this far -> flag
// (B) ERA-xERA tunables.
const MIN_ERA_XERA_GAP = 1.10;    // |ERA - xERA| this big -> flag
const MAX_ERA_XERA_GAP = 5.0;     // beyond this is small-sample noise / bad data, not a real edge
const MIN_XERA_PA = 80;           // batters faced — xERA is unstable on a tiny sample (~20 IP)
const MAX_TEAM_ROWS = 6;          // cap one-run rows per slate
const REL_ONE_RUN_SCALE = 120;
const REL_XERA_SCALE = 18;
// (C) tomorrow's projected starters — a look-ahead board. Slightly looser gap
// (informational, never graded) and its own per-slate cap.
const MIN_TOMORROW_GAP = 0.80;
const MAX_TOMORROW_ROWS = 8;

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

  // Pitcher contact-quality profile (barrel% / hard-hit% allowed) — the "why"
  // behind an ERA-xERA gap. Whole-league CSV, cached 24h; keyed by MLBAM
  // player_id (the same id the Savant xStats row carries, so the join is exact).
  let statcastById = new Map();
  try {
    statcastById = indexStatcastById(await getPitcherStatcastProfiles(season));
  } catch (err) {
    console.error('[regressionWatch] savant statcast profiles error:', err?.message || err);
  }
  // Full-name -> abbreviation, harvested from the standings we already pulled, so
  // tomorrow's MLB-Stats-API probables (which carry only the long team name) get
  // compact "PIT @ COL" labels like the rest of the board.
  const teamAbbrByName = teamAbbrFromStandings(standings);

  // --- Signal B: tonight's starter ERA vs xERA gap (per game) ---
  for (const game of games) {
    try {
      rows.push(...(await xeraForGame(game, { season, bdl, xByName, statcastById, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[regressionWatch] xERA game error:', err?.message || err);
    }
  }

  // --- Signal C: TOMORROW's projected starters (look-ahead, never graded) ---
  try {
    rows.push(...(await tomorrowRegression(ctx, xByName, statcastById, teamAbbrByName)));
  } catch (err) {
    console.error('[regressionWatch] tomorrow regression error:', err?.message || err);
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

async function xeraForGame(game, { season, bdl, xByName, statcastById, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const homeAbbr = game?.home_team?.abbreviation;
  const visAbbr = game?.visitor_team?.abbreviation;
  const starters = [
    { entry: lineups[homeAbbr], teamId: game?.home_team?.id, oppName: visAbbr || game?.visitor_team?.name },
    { entry: lineups[visAbbr], teamId: game?.visitor_team?.id, oppName: homeAbbr || game?.home_team?.name },
  ];

  const out = [];
  for (const { entry, teamId, oppName } of starters) {
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
    // Sanity: a tiny batters-faced sample or a physically-implausible gap is
    // noise, not an edge (e.g. a 10.29 ERA vs 1.7 xERA on a handful of innings —
    // a real season ERA-xERA gap rarely exceeds ~4). Drop those so the board
    // never ships a garbage "8.59 run gap" insight.
    const pa = Number(x.pa);
    if (Number.isFinite(pa) && pa < MIN_XERA_PA) continue;
    if (Math.abs(gap) > MAX_ERA_XERA_GAP) continue;

    const overperforming = gap < 0; // ERA below xERA = lucky/overperforming
    const oppBa = Number(x.ba);
    const oppXba = Number(x.est_ba);
    const baBit =
      Number.isFinite(oppBa) && Number.isFinite(oppXba)
        ? ` Opponents hit ${pct3(oppBa)} off him vs a ${pct3(oppXba)} expected (xBA).`
        : '';

    // Real, optional peripherals: WHIP / K9 (BDL season stats, by lineup id) and
    // barrel% / hard-hit% (Savant statcast, by name). Each is existence-checked;
    // a missing source simply isn't shown — never fabricated.
    const { whip, k9 } = await fetchPitcherRates(bdl, season, pitcher?.playerId);
    const sc = statcastById.get(String(x.player_id));
    const hardHit = firstFinite(sc?.ev95percent, sc?.ev95Percent);
    const barrel = firstFinite(sc?.brl_percent, sc?.brlPercent);

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
        // BDL lineup playerId (NOT the Savant x.player_id, which is the MLBAM
        // id) — the grading pass joins box rows by BDL id.
        player_id: pitcher?.playerId != null ? pitcher.playerId : undefined,
        team_id: teamId,
        game_id: gameId,
        meta: pitcherRegressionMeta({
          day: 'tonight', era, xera, gap, overperforming,
          oppBa, oppXba, whip, k9, hardHit, barrel, oppName,
        }),
      }),
    );
  }
  return out;
}

/** WHIP + K/9 for a pitcher from BDL season stats. Defensive; NaN when absent. */
async function fetchPitcherRates(bdl, season, playerId) {
  if (playerId == null) return { whip: NaN, k9: NaN };
  try {
    const rows = await bdl.getMlbPlayerSeasonStats({ season, playerIds: [playerId] });
    const r = Array.isArray(rows)
      ? (rows.find((row) => String(row?.player?.id ?? row?.player_id) === String(playerId)) || rows[0])
      : null;
    return { whip: Number(r?.pitching_whip), k9: Number(r?.pitching_k_per_9) };
  } catch (err) {
    console.error('[regressionWatch] season-rate error:', err?.message || err);
    return { whip: NaN, k9: NaN };
  }
}

/** First finite number among the candidates, else NaN. */
function firstFinite(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

/**
 * Structured regression payload for the iOS board's rich pitcher row + detail.
 * Only real, existence-checked fields are attached (no fabrication). `day` is
 * 'tonight' | 'tomorrow'; `direction` drives the iOS up/down read + colour.
 */
function pitcherRegressionMeta({ day, era, xera, gap, overperforming, oppBa, oppXba, whip, k9, hardHit, barrel, oppName }) {
  const m = { kind: 'regression_pitcher', day };
  if (Number.isFinite(era)) m.era = round(era, 2);
  if (Number.isFinite(xera)) m.xera = round(xera, 2);
  if (Number.isFinite(gap)) m.gap = round(Math.abs(gap), 2);
  m.direction = overperforming ? 'overperforming' : 'underperforming';
  if (Number.isFinite(oppBa)) m.opp_ba = pct3(oppBa);
  if (Number.isFinite(oppXba)) m.opp_xba = pct3(oppXba);
  if (Number.isFinite(whip)) m.whip = round(whip, 2);
  if (Number.isFinite(k9)) m.k9 = round(k9, 1);
  if (Number.isFinite(hardHit)) m.hard_hit = round(hardHit, 1);
  if (Number.isFinite(barrel)) m.barrel = round(barrel, 1);
  if (oppName) m.opp = oppName;
  m.verdict = pitcherVerdict({ overperforming, gap, xera, oppBa, oppXba, oppName });
  return m;
}

/** One-line, data-forward conviction read in the Hub's existing voice. */
function pitcherVerdict({ overperforming, gap, xera, oppBa, oppXba, oppName }) {
  const opp = oppName || 'the opposing bats';
  if (overperforming) {
    if (Number.isFinite(oppBa) && Number.isFinite(oppXba)) {
      return `Soft-contact luck — ${pct3(oppBa)} opp avg vs ${pct3(oppXba)} expected. ${opp} can collect.`;
    }
    return `ERA flatters him by ${round(Math.abs(gap), 2)} runs — contact says regression vs ${opp}.`;
  }
  if (Number.isFinite(xera)) {
    return `Better than his ERA reads — ${round(xera, 2)} xERA. Buy-low spot vs ${opp}.`;
  }
  return `His expected ERA says the runs aren't on him — buy-low vs ${opp}.`;
}

/**
 * TOMORROW's projected starters (look-ahead). Probable pitchers from the MLB
 * Stats API schedule, joined to Savant ERA/xERA by name. Never graded (no
 * player_id / game_id) — it is a planning board, not a settled edge.
 */
async function tomorrowRegression({ date, season }, xByName, statcastById, teamAbbrByName) {
  const out = [];
  let games = [];
  try {
    games = (await getMlbSchedule(shiftDateStr(date, 1))) || [];
  } catch (err) {
    console.error('[regressionWatch] tomorrow schedule error:', err?.message || err);
    return [];
  }

  for (const g of games) {
    const away = g?.teams?.away;
    const home = g?.teams?.home;
    if (!away?.team?.name || !home?.team?.name) continue;
    const awayAbbr = abbrFor(away.team.name, away.team.abbreviation, teamAbbrByName);
    const homeAbbr = abbrFor(home.team.name, home.team.abbreviation, teamAbbrByName);
    const label = `${awayAbbr} @ ${homeAbbr}`;

    const probs = [
      { p: away?.probablePitcher, oppName: homeAbbr },
      { p: home?.probablePitcher, oppName: awayAbbr },
    ];
    for (const { p, oppName } of probs) {
      const name = p?.fullName;
      if (!name) continue;

      const x = xByName.get(nameKey(name)) || xByName.get(lastNameKey(name));
      if (!x) continue;
      const era = Number(x.era);
      const xera = Number(x.xera);
      if (!Number.isFinite(era) || !Number.isFinite(xera)) continue;

      const gap = Number.isFinite(Number(x.era_minus_xera_diff))
        ? Number(x.era_minus_xera_diff)
        : era - xera;
      const pa = Number(x.pa);
      if (Number.isFinite(pa) && pa < MIN_XERA_PA) continue;
      if (Math.abs(gap) < MIN_TOMORROW_GAP || Math.abs(gap) > MAX_ERA_XERA_GAP) continue;

      const overperforming = gap < 0;
      const oppBa = Number(x.ba);
      const oppXba = Number(x.est_ba);
      const sc = statcastById.get(String(x.player_id));
      const hardHit = firstFinite(sc?.ev95percent, sc?.ev95Percent);
      const barrel = firstFinite(sc?.brl_percent, sc?.brlPercent);
      const baBit =
        Number.isFinite(oppBa) && Number.isFinite(oppXba)
          ? ` Opponents hit ${pct3(oppBa)} vs ${pct3(oppXba)} expected.`
          : '';

      out.push(
        makeRow({
          category: 'regression_tomorrow',
          headline: `${name}: ${round(era, 2)} ERA vs ${round(xera, 2)} xERA`,
          detail:
            `Projected to start tomorrow vs ${oppName}. A ${round(era, 2)} ERA against a ` +
            `${round(xera, 2)} expected ERA (${round(Math.abs(gap), 2)} run gap) — ` +
            `${overperforming ? 'running hot, due to regress' : 'unlucky, due to bounce back'}.` +
            baBit,
          game: label,
          value: `${round(xera, 2)}`,
          tone: overperforming ? TONES.CAUTION : TONES.EDGE,
          spark: [round(era, 2), round(xera, 2)],
          relevance_score: scoreFromEdge(gap, { scale: REL_XERA_SCALE, base: 42 }),
          meta: pitcherRegressionMeta({
            day: 'tomorrow', era, xera, gap, overperforming,
            oppBa, oppXba, hardHit, barrel, oppName,
          }),
        }),
      );
    }
  }
  return out.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, MAX_TOMORROW_ROWS);
}

/** Index Savant statcast profile rows by MLBAM player_id (string). */
function indexStatcastById(rows) {
  const map = new Map();
  const arr = Array.isArray(rows) ? rows : (rows && typeof rows === 'object' ? Object.values(rows) : []);
  for (const r of arr) {
    const id = r?.player_id;
    if (id == null) continue;
    map.set(String(id), r);
  }
  return map;
}

/**
 * Build a team-name -> abbreviation map from BDL standings rows. BDL exposes
 * `display_name` ("Cleveland Guardians") + nickname `name` ("Guardians") +
 * `location` — the MLB Stats API schedule sends the full display name, so we
 * key on every variant we can form.
 */
function teamAbbrFromStandings(standings) {
  const map = new Map();
  for (const row of standings || []) {
    const t = row?.team;
    if (!t?.abbreviation) continue;
    const variants = [
      t.display_name,
      t.full_name,
      t.name,
      t.location && t.name ? `${t.location} ${t.name}` : null,
    ];
    for (const nm of variants) if (nm) map.set(teamKey(nm), t.abbreviation);
  }
  return map;
}

function teamKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Resolve a long team name to its abbreviation, with graceful fallbacks. */
function abbrFor(name, providedAbbr, map) {
  if (providedAbbr) return providedAbbr;
  return (map && map.get(teamKey(name))) || name;
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
