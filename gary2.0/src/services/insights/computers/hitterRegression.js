// gary2.0/src/services/insights/computers/hitterRegression.js
//
// LANE: hitterRegression  (category token emitted: regression_watch)
// "His .310 AVG hides a .240 xBA" — Statcast contact quality vs surface stats
// for tonight's hitters. These rows join the pitcher ERA-vs-xERA rows on the
// iOS REGRESSION BOARD (same regression_watch category), but here the unit is a
// HITTER's batting average / wOBA against his expected (xBA / xwOBA) from
// Baseball Savant's expected_statistics leaderboard. A hitter whose surface
// average sits well above his expected has been flattered by results and tends
// to cool; one whose expected sits above his surface average is hitting the ball
// hard with little to show and is a positive-regression candidate.
//
// Approach (documented methods only):
//   - ONE getBatterXStats(season) call pulls the whole-league expected-stats
//     leaderboard for the slate (24h cached in baseballSavantService).
//   - For each slate game, getMlbLineups(game.id) (skip if not posted). For each
//     of the top-6 batters (lineups are pre-sorted by battingOrder), join to the
//     Savant row by name — exact full-name nameKey first, last-name key fallback
//     — mirroring regressionWatch's indexXStatsByName join helper.
//   - Gates (FAIL CLOSED): Savant sample (pa) >= 100; surface only when
//     |ba - est_ba| >= 0.035 OR |woba - est_woba| >= 0.040.
//
// IMPORTANT — methods/fields quoted from the reference (no invention):
//   * getBatterXStats(year) from baseballSavantService: returns rows
//     "{ player_id, name, ba, est_ba, slg, est_slg, woba, est_woba, ... }".
//     The expected_statistics CSV header is:
//       last_name, first_name, player_id, year, pa, bip, ba, est_ba,
//       est_ba_minus_ba_diff, slg, est_slg, est_slg_minus_slg_diff,
//       woba, est_woba, est_woba_minus_woba_diff
//     So rows carry split last_name/first_name (Savant CSV split), `pa` is the
//     plate-appearance sample, and `est_ba`/`est_woba` are the expected values.
//     The `player_id` ON THE SAVANT ROW is the MLBAM/Savant id — we do NOT use
//     it; the emitted player_id is the BDL lineup playerId (per the table
//     contract / iOS joins).
//   * getMlbLineups(gameId): "Returns a TRANSFORMED OBJECT keyed by team
//     abbreviation ... batters: [ { name, position, battingOrder, batsThrows,
//     playerId } ]", pre-sorted by battingOrder. Skip when null (not posted).
//
// SPARK ORDER: spark is ALWAYS [ba, est_ba] — surface stat first, expected
// second (matching headline "his .310 AVG hides a .240 xBA").
//
// Defensive: any missing piece -> skip that batter/game silently; never throws.
// Emits a one-line examined/emitted summary at the end for 0-row diagnosability.

import {
  makeRow, TONES, scoreFromEdge, pct3, nameKey, pickVariant,
} from '../shared.js';
import { getBatterXStats } from '../../baseballSavantService.js';

// Tunables.
const MIN_SAVANT_PA = 100;     // require a real Savant sample (CSV `pa` field)
const MIN_BA_GAP = 0.035;      // |ba - est_ba| this big -> surface
const MIN_WOBA_GAP = 0.040;    // |woba - est_woba| this big -> surface
const TOP_N_BATTERS = 6;       // examine the top of each lineup only
const MAX_PER_GAME = 2;        // keep at most N regression bats per game
const RELEVANCE_SCALE = 600;   // scoreFromEdge scale for |ba - est_ba|
const RELEVANCE_BASE = 45;
const RELEVANCE_CAP = 90;

export async function computeHitterRegression(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  // ONE whole-league batter expected-stats pull for the slate (24h cached).
  let batterX = [];
  try {
    batterX = (await getBatterXStats(season)) || [];
  } catch (err) {
    console.error('[hitterRegression] savant batter xStats error:', err?.message || err);
  }
  const xByName = indexXStatsByName(batterX);

  // No Savant data -> nothing to join against; emit the summary and bail.
  if (!xByName.size) {
    console.log(`[hitterRegression] examined ${stats.examined}, emitted ${rows.length}`);
    return rows;
  }

  for (const game of games) {
    try {
      const gameRows = await hitterRegressionForGame(
        game, { bdl, xByName, gameLabel: helpers.gameLabel, stats },
      );
      rows.push(...gameRows);
    } catch (err) {
      console.error('[hitterRegression] game error:', err?.message || err);
      // continue to next game
    }
  }

  stats.emitted = rows.length;
  console.log(`[hitterRegression] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function hitterRegressionForGame(game, { bdl, xByName, gameLabel, stats }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  // getMlbLineups(gameId): object keyed by team abbreviation. Null = not posted.
  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  // Map team abbr -> BDL team id so the emitted row carries team_id.
  const sideTeamIds = {
    [game?.home_team?.abbreviation]: game?.home_team?.id,
    [game?.visitor_team?.abbreviation]: game?.visitor_team?.id,
  };

  const candidates = [];

  for (const abbr of Object.keys(lineups)) {
    const teamId = sideTeamIds[abbr];
    const batters = Array.isArray(lineups[abbr]?.batters) ? lineups[abbr].batters : [];
    if (!batters.length) continue;

    // Lineups are pre-sorted by battingOrder — top of the order = first entries.
    const topBatters = batters.slice(0, TOP_N_BATTERS);

    for (const b of topBatters) {
      const name = b?.name;
      const playerId = b?.playerId;
      if (!name || playerId == null) continue;

      // Prefer an exact full-name nameKey match; fall back to last-name key.
      const x = xByName.get(nameKey(name)) || xByName.get(lastNameKey(name));
      if (!x) continue;
      if (stats) stats.examined += 1;

      // Savant sample gate (CSV `pa` field). FAIL CLOSED when absent/short.
      const pa = Number(x.pa);
      if (!Number.isFinite(pa) || pa < MIN_SAVANT_PA) continue;

      const ba = Number(x.ba);
      const estBa = Number(x.est_ba);
      const woba = Number(x.woba);
      const estWoba = Number(x.est_woba);

      // Need both surface+expected sides of AT LEAST one metric to be valid.
      const baValid = Number.isFinite(ba) && Number.isFinite(estBa) && ba > 0 && estBa > 0;
      const wobaValid = Number.isFinite(woba) && Number.isFinite(estWoba) && woba > 0 && estWoba > 0;
      if (!baValid && !wobaValid) continue;

      const baGap = baValid ? ba - estBa : null;
      const wobaGap = wobaValid ? woba - estWoba : null;

      const baFired = baGap != null && Math.abs(baGap) >= MIN_BA_GAP;
      const wobaFired = wobaGap != null && Math.abs(wobaGap) >= MIN_WOBA_GAP;
      if (!baFired && !wobaFired) continue;

      // BA is the headline lane; surface it (and the spark) whenever BA is valid.
      // If only wOBA is present, the row would have no BA spark — skip it so the
      // [ba, est_ba] spark contract always holds.
      if (!baValid) continue;

      candidates.push({
        playerId,
        teamId,
        name,
        ba,
        estBa,
        woba: wobaValid ? woba : null,
        estWoba: wobaValid ? estWoba : null,
        pa: Math.round(pa),
        gap: baGap,
        // Which metric fired drives the copy emphasis.
        firedBa: baFired,
        firedWoba: wobaFired,
      });
    }
  }

  if (!candidates.length) return [];

  // Deterministic tie-break: |gap| desc, then name asc.
  candidates.sort((a, b) => {
    const d = Math.abs(b.gap) - Math.abs(a.gap);
    if (d !== 0) return d;
    return String(a.name).localeCompare(String(b.name));
  });

  const top = candidates.slice(0, MAX_PER_GAME);

  return top.map((c) => {
    const overperforming = c.ba > c.estBa; // surface AVG above expected = flattered
    return makeRow({
      category: 'hitterRegression',
      headline: buildHeadline(c, overperforming),
      detail: buildDetail(c, overperforming),
      game: label,
      // value = expected BA rendered via pct3.
      value: pct3(c.estBa),
      // tone bad = overperforming (results flattered, cooling risk);
      // tone good = underperforming (xBA above BA, positive regression due).
      tone: overperforming ? TONES.CAUTION : TONES.EDGE,
      // spark ALWAYS [ba, est_ba] — surface stat first, expected second.
      spark: [c.ba, c.estBa],
      relevance_score: scoreFromEdge(Math.abs(c.gap), {
        scale: RELEVANCE_SCALE, base: RELEVANCE_BASE, cap: RELEVANCE_CAP,
      }),
      player_id: c.playerId, // BDL lineup playerId (not the Savant row id)
      team_id: c.teamId,
      game_id: gameId,
    });
  });
}

/**
 * Headline copy. Three deterministic variants keyed off player_id so a slate
 * doesn't read machine-stamped. Plain, no bet instructions.
 * e.g. "Bryce Harper's .310 AVG hides a .240 xBA".
 */
function buildHeadline(c, overperforming) {
  const ba = pct3(c.ba);
  const xba = pct3(c.estBa);
  if (overperforming) {
    const variants = [
      `${c.name}'s ${ba} AVG hides a ${xba} xBA`,
      `${c.name} is hitting ${ba}, but his xBA is ${xba}`,
      `${c.name}'s ${ba} average outruns a ${xba} expected`,
    ];
    return pickVariant(variants, c.playerId);
  }
  const variants = [
    `${c.name}'s ${ba} AVG masks a ${xba} xBA`,
    `${c.name} is hitting ${ba} with a ${xba} expected`,
    `${c.name}'s ${xba} xBA outruns a ${ba} average`,
  ];
  return pickVariant(variants, c.playerId);
}

/**
 * Detail copy. ADDS information the headline lacks — the wOBA vs xwOBA pairing
 * (when present), the PA sample, and a plain note that Statcast grades the
 * quality of contact, not the results on the board. Three deterministic
 * variants keyed off player_id. Plain/factual; NO bet instructions.
 */
function buildDetail(c, overperforming) {
  const ba = pct3(c.ba);
  const xba = pct3(c.estBa);

  const wobaBit =
    c.woba != null && c.estWoba != null
      ? ` His wOBA sits at ${pct3(c.woba)} against a ${pct3(c.estWoba)} expected (xwOBA).`
      : '';

  const note = overperforming
    ? `Statcast grades the quality of his contact rather than the results, ` +
      `and the expected marks sit below what he has actually posted.`
    : `Statcast grades the quality of his contact rather than the results, ` +
      `and the expected marks sit above what he has actually posted.`;

  const variants = [
    `${c.name} is hitting ${ba} against a ${xba} expected average (xBA) over ${c.pa} ` +
      `plate appearances.${wobaBit} ${note}`,
    `Across ${c.pa} plate appearances, ${c.name} carries a ${ba} average versus a ` +
      `${xba} xBA.${wobaBit} ${note}`,
    `${c.name}'s ${ba} average comes against a ${xba} expected (xBA) on ${c.pa} ` +
      `plate appearances.${wobaBit} ${note}`,
  ];
  return pickVariant(variants, c.playerId);
}

/**
 * Index Savant batter xStats rows by a full-name key and a last-name key.
 * Rows carry last_name/first_name (Savant CSV split). Mirrors regressionWatch's
 * indexXStatsByName so the join behaves identically across the two lanes.
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

export default { computeHitterRegression };
