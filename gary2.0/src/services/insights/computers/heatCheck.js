// gary2.0/src/services/insights/computers/heatCheck.js
//
// LANE: heatCheck  (category token emitted: heat_check)
// "A bat is running hot relative to its own season baseline, and the market
//  line hasn't caught up yet."
//
// Approach (all data from documented BDL methods only):
//   - For each game on the slate, pull the projected lineup via
//     getMlbLineups(gameId) -> { [abbr]: { batters: [{ name, playerId, ... }] } }.
//   - Season baseline per side via getMlbPlayerSeasonStats({ season, teamId }).
//   - For each batter, fetch getMlbPlayerSplits({ playerId, season }) and read
//     the byDayMonth recent-window bucket ("Last 15/7/30 Days") as the recent
//     sample: its OPS vs the player's season OPS.
//   - Guards FAIL CLOSED: a missing season GP, a missing/short recent sample,
//     or a non-positive OPS (season OR recent) skips the batter — we never emit
//     a row off an absent/zero number.
//   - The raw OPS edge is weighted by recent sample size before scoring
//     (effectiveEdge = edge * min(1, recentPa / PA_FULL_CREDIT)) so a 25-PA
//     flash doesn't outrank a 120-PA surge.
//   - PROP TIE-IN: for a surfaced hot bat we look up tonight's posted player
//     props (getMlbPlayerProps(game.id), cached once per game) and, when found,
//     append the batter's total-bases (preferred) or hits line to the detail as
//     context. The line is NOT written to line_val — the spark is in OPS units
//     and a prop line in line_val would mis-color the iOS chart.
//
// IMPORTANT — methods/fields quoted from the BDL/Savant reference (no invention):
//   * getMlbLineups(gameId): "Returns a TRANSFORMED OBJECT keyed by team
//     abbreviation ... batters: [ { name, position, battingOrder, batsThrows,
//     playerId } ]".
//   * getMlbPlayerSplits({ playerId, season }): returns an OBJECT keyed by
//     split-category camelCase keys, incl. documented key "byDayMonth".
//     "Per-split stat fields are FLAT: avg, ops, home_runs, at_bats, hits,
//     plate_appearances, games".
//   * getMlbPlayerSeasonStats({ season, teamId }): "Returns Array of per-player
//     season records ... player ({ id, full_name, ... }), batting_ops,
//     batting_avg, batting_hr, gp". Hitters distinguished by
//     "batting_ops > 0 && !pitching_era".
//   * getMlbPlayerProps(gameId): rows { player_id, prop_type, line_value,
//     vendor, market:{type, odds} }. 2-min cache.
//
// Defensive: any missing piece -> skip that batter/game silently; never throws.
// Emits a one-line examined/emitted summary at the end for 0-row diagnosability.

import {
  makeRow, TONES, scoreFromEdge, round, pct3, pickVariant,
} from '../shared.js';

// Tunables.
const MIN_RECENT_PA = 25;          // require a real recent PA sample
const MIN_RECENT_AB = 22;          // lower floor when only at_bats is available
const MIN_SEASON_GP = 15;          // require a real season baseline
const MIN_OPS_EDGE = 0.120;        // recent OPS must beat season by this much
const PA_FULL_CREDIT = 60;         // recent windows >= this PA get full edge weight
const MAX_PER_GAME = 2;            // keep at most N hottest bats per game
const RELEVANCE_SCALE = 200;       // 0.120 weighted edge -> ~+24 over base

export async function computeHeatCheck(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  // resolveBdlTeamId equivalent: BDL game team objects carry numeric .id.
  for (const game of games) {
    try {
      const gameRows = await heatCheckForGame(
        game, { season, bdl, gameLabel: helpers.gameLabel, stats },
      );
      rows.push(...gameRows);
    } catch (err) {
      console.error('[heatCheck] game error:', err?.message || err);
      // continue to next game
    }
  }
  stats.emitted = rows.length;
  console.log(`[heatCheck] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function heatCheckForGame(game, { season, bdl, gameLabel, stats }) {
  const gameId = game?.id;
  if (gameId == null) return [];

  const label = gameLabel(game);

  // getMlbLineups(gameId): BDL game id, object keyed by team abbreviation.
  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  // Map team abbr -> BDL team id so we can pull season stats per side.
  const sideTeamIds = {
    [game?.home_team?.abbreviation]: game?.home_team?.id,
    [game?.visitor_team?.abbreviation]: game?.visitor_team?.id,
  };

  const candidates = [];

  for (const abbr of Object.keys(lineups)) {
    const teamId = sideTeamIds[abbr];
    const batters = Array.isArray(lineups[abbr]?.batters) ? lineups[abbr].batters : [];
    if (!batters.length) continue;

    // Season baseline for the whole side in one call (options-object form only).
    // getMlbPlayerSeasonStats({ season, teamId }) -> Array of per-player records.
    let seasonRows = [];
    if (teamId != null) {
      seasonRows = (await bdl.getMlbPlayerSeasonStats({ season, teamId })) || [];
    }
    const seasonByPlayerId = indexSeasonHitters(seasonRows);

    for (const b of batters) {
      const playerId = b?.playerId;
      if (playerId == null) continue;

      const seasonRec = seasonByPlayerId.get(String(playerId));
      if (!seasonRec) continue;
      if (stats) stats.examined += 1;

      const seasonOps = Number(seasonRec.batting_ops);
      if (!Number.isFinite(seasonOps) || seasonOps <= 0) continue;
      // Games-played guard — FAIL CLOSED. Require a real, finite GP at/above the
      // floor; if no GP field is present we cannot trust the season baseline, so
      // we skip rather than wave the batter through.
      const seasonGp = Number(seasonRec.gp ?? seasonRec.games_played ?? seasonRec.batting_gp);
      if (!Number.isFinite(seasonGp) || seasonGp < MIN_SEASON_GP) continue;

      // getMlbPlayerSplits({ playerId, season }) -> object keyed by category.
      // byDayMonth = month buckets; flat fields: ops, at_bats, plate_appearances.
      const splits = await bdl.getMlbPlayerSplits({ playerId, season });
      const recent = mostRecentMonthSplit(splits);
      if (!recent) continue;

      // Prefer true plate_appearances against the PA floor. If only at_bats is
      // present, hold it to a lower AB floor (AB undercounts PA, so applying the
      // PA floor to an AB count would silently demand a bigger real sample).
      const recentPaRaw = Number(recent.plate_appearances);
      const recentAbRaw = Number(recent.at_bats);
      let recentSample;
      if (Number.isFinite(recentPaRaw)) {
        if (recentPaRaw < MIN_RECENT_PA) continue;
        recentSample = recentPaRaw;
      } else if (Number.isFinite(recentAbRaw)) {
        if (recentAbRaw < MIN_RECENT_AB) continue;
        recentSample = recentAbRaw;
      } else {
        continue;
      }

      const recentOps = Number(recent.ops);
      if (!Number.isFinite(recentOps) || recentOps <= 0) continue;

      const edge = recentOps - seasonOps;
      if (edge < MIN_OPS_EDGE) continue;

      // Weight the edge by sample size so a 25-PA flash can't score like a
      // 120-PA surge; windows at/above PA_FULL_CREDIT keep the full edge.
      const effectiveEdge = edge * Math.min(1, recentSample / PA_FULL_CREDIT);

      const name = b.name || seasonRec.player?.full_name || 'Batter';
      candidates.push({
        playerId,
        teamId,
        name,
        recentOps,
        seasonOps,
        edge,
        effectiveEdge,
        recentPa: recentSample,
        recentLabel: recent.split_name || 'recent',
        seasonHr: Number(seasonRec.batting_hr) || 0,
      });
    }
  }

  // Keep the hottest bats per game. Rank on the sample-weighted edge so a small
  // recent window can't jump ahead of a bigger surge of the same raw size.
  candidates.sort((a, b) => b.effectiveEdge - a.effectiveEdge);
  const top = candidates.slice(0, MAX_PER_GAME);
  if (!top.length) return [];

  // Posted props for this game, fetched at most once (2-min cache + local memo).
  const propsByPlayer = await loadGameProps(bdl, gameId);

  return top.map((c) => {
    const propLine = totalBasesOrHitsLine(propsByPlayer, c.playerId);
    return makeRow({
      category: 'heatCheck',
      headline: `${c.name} is scorching: ${pct3(c.recentOps)} OPS in ${c.recentLabel}`,
      detail: buildDetail(c, propLine),
      game: label,
      value: pct3(c.recentOps),
      tone: TONES.HOT,
      spark: [round(c.seasonOps, 3), round(c.recentOps, 3)],
      relevance_score: scoreFromEdge(c.effectiveEdge, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    });
  });
}

/**
 * Detail copy. Plain/factual; ADDS information the headline lacks — the PA
 * sample, the season baseline, the season HR total when meaningful, and (when
 * posted) tonight's total-bases/hits prop line as context. Three deterministic
 * sentence variants keyed off player_id so a slate doesn't read machine-stamped.
 */
function buildDetail(c, propLine) {
  const recent = pct3(c.recentOps);
  const base = pct3(c.seasonOps);
  const win = c.recentLabel.toLowerCase();
  const jump = round(c.edge, 3);
  const hr = c.seasonHr;
  // Only fold the HR total in when it is a meaningful power number.
  const hrClause = hr >= 8 ? ` He has ${hr} home runs on the season.` : '';

  const variants = [
    `Over the ${win} (${c.recentPa} PA) he is at a ${recent} OPS, up ${jump} on his ${base} season mark.${hrClause}`,
    `That ${recent} OPS spans the ${win} (${c.recentPa} PA) against a ${base} season baseline, a ${jump} swing.${hrClause}`,
    `The ${win} sample runs ${c.recentPa} PA: a ${recent} OPS versus ${base} for the season, ${jump} above his norm.${hrClause}`,
  ];
  let detail = pickVariant(variants, c.playerId);
  if (propLine != null) {
    detail += ` His ${propLine.label} line tonight: ${propLine.value}.`;
  }
  return detail;
}

// Per-run memo of getMlbPlayerProps(gameId) -> Map(String(player_id) -> rows[]).
// The BDL method already has a 2-min cache; this local Map keeps multiple hot
// bats in the SAME game from each triggering a call within one run.
const gamePropsMemo = new Map();

/**
 * Fetch & index tonight's player props for a game, once. Returns a Map keyed by
 * String(player_id) -> array of that player's prop rows.
 */
async function loadGameProps(bdl, gameId) {
  const key = String(gameId);
  if (gamePropsMemo.has(key)) return gamePropsMemo.get(key);

  let byPlayer = new Map();
  try {
    const rows = (await bdl.getMlbPlayerProps(gameId)) || [];
    for (const r of rows) {
      const pid = r?.player_id;
      if (pid == null) continue;
      const k = String(pid);
      if (!byPlayer.has(k)) byPlayer.set(k, []);
      byPlayer.get(k).push(r);
    }
  } catch {
    byPlayer = new Map();
  }
  gamePropsMemo.set(key, byPlayer);
  return byPlayer;
}

/**
 * From a player's prop rows, pick a displayable total-bases (preferred) or hits
 * line. Prefers a standard over/under market and avoids extreme-odds milestone
 * rows when a plain line exists. Returns { label, value } or null.
 */
function totalBasesOrHitsLine(propsByPlayer, playerId) {
  const rows = propsByPlayer.get(String(playerId));
  if (!Array.isArray(rows) || !rows.length) return null;

  const pick = (propType) => {
    const matches = rows.filter((r) => String(r?.prop_type || '').toLowerCase() === propType);
    if (!matches.length) return null;
    // Prefer a standard over/under market over milestone/extreme-odds rows.
    const standard = matches.find((r) => {
      const t = String(r?.market?.type || '').toLowerCase();
      return t.includes('over') || t.includes('under') || t === 'over_under';
    });
    const chosen = standard || matches[0];
    const v = Number(chosen?.line_value);
    return Number.isFinite(v) ? v : null;
  };

  const tb = pick('total_bases');
  if (tb != null) return { label: 'total-bases', value: tb };
  const hits = pick('hits');
  if (hits != null) return { label: 'hits', value: hits };
  return null;
}

/**
 * Index season hitter records by player id.
 * Hitters: "batting_ops > 0 && !pitching_era".
 */
function indexSeasonHitters(seasonRows) {
  const map = new Map();
  for (const rec of seasonRows || []) {
    const id = rec?.player?.id;
    if (id == null) continue;
    const isHitter = Number(rec.batting_ops) > 0 && !rec.pitching_era;
    if (!isHitter) continue;
    map.set(String(id), rec);
  }
  return map;
}

/**
 * Pick the most-recent month bucket from getMlbPlayerSplits().byDayMonth.
 * The bucket entries carry the same FLAT fields as other splits
 * (ops, at_bats, plate_appearances, games). We do not assume an ordering
 * field beyond split_name, so we choose the LAST entry as "most recent"
 * (BDL returns these in chronological order) and fall back gracefully.
 */
function mostRecentMonthSplit(splits) {
  if (!splits || typeof splits !== 'object') return null;
  const buckets = Array.isArray(splits.byDayMonth) ? splits.byDayMonth : null;
  if (!buckets || buckets.length === 0) return null;
  // BDL's byDayMonth carries explicit recent windows ("Last 7/15/30 Days") plus
  // month buckets. Use the real recent window — 15 days balances sample vs recency.
  const byName = (n) => buckets.find((e) => String(e?.split_name || '').trim().toLowerCase() === n);
  return byName('last 15 days') || byName('last 7 days') || byName('last 30 days') || null;
}

export default { computeHeatCheck };
