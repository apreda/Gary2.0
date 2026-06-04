// gary2.0/src/services/insights/computers/coolingOff.js
//
// LANE: coolingOff — the inverse of heatCheck. A bat is in a cold stretch
// relative to its season baseline; the line may still be priced off the season
// number. Recent window = byDayMonth "Last 15 Days" (a real BDL split), compared
// to season OPS from getMlbPlayerSeasonStats. Fully defensive.

import { makeRow, TONES, scoreFromEdge, round, pct3 } from '../shared.js';

const MIN_RECENT_PA = 25;     // require a real recent sample
const MIN_SEASON_GP = 15;     // require a real season baseline (only when GP is present)
const MIN_OPS_DIP = 0.130;    // recent OPS must trail season by this much
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 200;

export async function computeCoolingOff(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  for (const game of games) {
    try {
      rows.push(...(await coldForGame(game, { season, bdl, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[coolingOff] game error:', err?.message || err);
    }
  }
  return rows;
}

async function coldForGame(game, { season, bdl, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const sideTeamIds = {
    [game?.home_team?.abbreviation]: game?.home_team?.id,
    [game?.visitor_team?.abbreviation]: game?.visitor_team?.id,
  };

  const candidates = [];
  for (const abbr of Object.keys(lineups)) {
    const teamId = sideTeamIds[abbr];
    const batters = Array.isArray(lineups[abbr]?.batters) ? lineups[abbr].batters : [];
    if (!batters.length) continue;

    let seasonRows = [];
    if (teamId != null) seasonRows = (await bdl.getMlbPlayerSeasonStats({ season, teamId })) || [];
    const seasonByPlayerId = indexSeasonHitters(seasonRows);

    for (const b of batters) {
      const playerId = b?.playerId;
      if (playerId == null) continue;
      const seasonRec = seasonByPlayerId.get(String(playerId));
      if (!seasonRec) continue;

      const seasonOps = Number(seasonRec.batting_ops);
      if (!Number.isFinite(seasonOps) || seasonOps <= 0) continue;
      // Games-played guard — tolerant of the field being absent on the record.
      const seasonGp = Number(seasonRec.gp ?? seasonRec.games_played ?? seasonRec.batting_gp);
      if (Number.isFinite(seasonGp) && seasonGp < MIN_SEASON_GP) continue;

      const splits = await bdl.getMlbPlayerSplits({ playerId, season });
      const recent = recentSplit(splits);
      if (!recent) continue;

      const recentPa = Number(recent.plate_appearances ?? recent.at_bats);
      const recentOps = Number(recent.ops);
      if (!Number.isFinite(recentPa) || recentPa < MIN_RECENT_PA) continue;
      if (!Number.isFinite(recentOps) || recentOps < 0) continue;

      const dip = seasonOps - recentOps; // positive = colder than the season baseline
      if (dip < MIN_OPS_DIP) continue;

      candidates.push({
        playerId,
        teamId,
        name: b.name || seasonRec.player?.full_name || 'Batter',
        recentOps,
        seasonOps,
        dip,
        recentPa,
        recentLabel: recent.split_name || 'recent',
      });
    }
  }

  candidates.sort((a, b) => b.dip - a.dip);
  return candidates.slice(0, MAX_PER_GAME).map((c) =>
    makeRow({
      category: 'coolingOff',
      headline: `${c.name} has gone cold: ${pct3(c.recentOps)} OPS in ${c.recentLabel}`,
      detail:
        `${c.name} is down to a ${pct3(c.recentOps)} OPS over the ${c.recentLabel.toLowerCase()} ` +
        `(${c.recentPa} PA) vs a ${pct3(c.seasonOps)} season OPS — a ${round(c.dip, 3)} drop ` +
        `the season baseline most lines price off may not reflect.`,
      game: label,
      value: pct3(c.recentOps),
      tone: TONES.COLD,
      spark: [round(c.seasonOps, 3), round(c.recentOps, 3)],
      relevance_score: scoreFromEdge(c.dip, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );
}

/** Index season hitter records by String(player id). Hitters: batting_ops>0 && !pitching_era. */
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

/** Pick the real recent window from byDayMonth ("Last 7/15/30 Days"). */
function recentSplit(splits) {
  if (!splits || typeof splits !== 'object') return null;
  const buckets = Array.isArray(splits.byDayMonth) ? splits.byDayMonth : null;
  if (!buckets || buckets.length === 0) return null;
  const byName = (n) => buckets.find((e) => String(e?.split_name || '').trim().toLowerCase() === n);
  return byName('last 15 days') || byName('last 7 days') || byName('last 30 days') || null;
}

export default { computeCoolingOff };
