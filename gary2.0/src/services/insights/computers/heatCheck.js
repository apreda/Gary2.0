// gary2.0/src/services/insights/computers/heatCheck.js
//
// LANE: heatCheck
// "A bat is running hot relative to its own season baseline, and the market
//  line hasn't caught up yet."
//
// Approach (all data from documented BDL methods only):
//   - For each game on the slate, pull the projected lineup via
//     getMlbLineups(gameId) -> { [abbr]: { batters: [{ name, playerId, ... }] } }.
//   - For each batter, fetch getMlbPlayerSplits({ playerId, season }). We use
//     the byDayMonth split bucket (documented category key) as the "recent
//     window" proxy: the most-recent month's OPS vs the player's season OPS
//     from getMlbPlayerSeasonStats({ teamId, season }).
//   - When recent OPS sits well above season OPS we surface a "heat check"
//     connection with the "line hasn't caught up" framing.
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
//
// Defensive: any missing piece -> skip that batter/game silently; never throws.

import {
  makeRow, TONES, scoreFromEdge, round, pct3,
} from '../shared.js';

// Tunables.
const MIN_RECENT_PA = 25;          // require a real recent sample
const MIN_SEASON_GP = 15;          // require a real season baseline
const MIN_OPS_EDGE = 0.120;        // recent OPS must beat season by this much
const MAX_PER_GAME = 2;            // keep at most N hottest bats per game
const RELEVANCE_SCALE = 200;       // 0.120 edge -> ~+24 over base

export async function computeHeatCheck(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];

  // resolveBdlTeamId equivalent: BDL game team objects carry numeric .id.
  for (const game of games) {
    try {
      const gameRows = await heatCheckForGame(game, { season, bdl, gameLabel: helpers.gameLabel });
      rows.push(...gameRows);
    } catch (err) {
      console.error('[heatCheck] game error:', err?.message || err);
      // continue to next game
    }
  }
  return rows;
}

async function heatCheckForGame(game, { season, bdl, gameLabel }) {
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

      const seasonOps = Number(seasonRec.batting_ops);
      if (!Number.isFinite(seasonOps) || seasonOps <= 0) continue;
      // Games-played guard — tolerant of the field name being absent on the record
      // (only skip when a real GP value exists and is below the floor).
      const seasonGp = Number(seasonRec.gp ?? seasonRec.games_played ?? seasonRec.batting_gp);
      if (Number.isFinite(seasonGp) && seasonGp < MIN_SEASON_GP) continue;

      // getMlbPlayerSplits({ playerId, season }) -> object keyed by category.
      // byDayMonth = month buckets; flat fields: ops, at_bats, plate_appearances.
      const splits = await bdl.getMlbPlayerSplits({ playerId, season });
      const recent = mostRecentMonthSplit(splits);
      if (!recent) continue;

      const recentPa = Number(recent.plate_appearances ?? recent.at_bats);
      const recentOps = Number(recent.ops);
      if (!Number.isFinite(recentPa) || recentPa < MIN_RECENT_PA) continue;
      if (!Number.isFinite(recentOps) || recentOps <= 0) continue;

      const edge = recentOps - seasonOps;
      if (edge < MIN_OPS_EDGE) continue;

      const name = b.name || seasonRec.player?.full_name || 'Batter';
      candidates.push({
        playerId,
        teamId,
        name,
        recentOps,
        seasonOps,
        edge,
        recentPa,
        recentLabel: recent.split_name || 'recent',
        seasonHr: Number(seasonRec.batting_hr) || 0,
      });
    }
  }

  // Keep the hottest bats per game (bigger OPS edge = more relevant).
  candidates.sort((a, b) => b.edge - a.edge);
  const top = candidates.slice(0, MAX_PER_GAME);

  return top.map((c) =>
    makeRow({
      category: 'heatCheck',
      headline: `${c.name} is scorching: ${pct3(c.recentOps)} OPS in ${c.recentLabel}`,
      detail:
        `${c.name} is posting a ${pct3(c.recentOps)} OPS over the ${c.recentLabel.toLowerCase()} ` +
        `(${c.recentPa} PA) vs a ${pct3(c.seasonOps)} season OPS — a ${round(c.edge, 3)} jump ` +
        `the season baseline most lines price off may not reflect.`,
      game: label,
      value: pct3(c.recentOps),
      tone: TONES.HOT,
      spark: [round(c.seasonOps, 3), round(c.recentOps, 3)],
      relevance_score: scoreFromEdge(c.edge, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );
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
