// gary2.0/src/services/insights/computers/coolingOff.js
//
// LANE: coolingOff  (category token emitted: cooling_off) — the inverse of
// heatCheck. A bat is in a cold stretch relative to its season baseline; the
// line may still be priced off the season number. Recent window = byDayMonth
// "Last 15/7/30 Days" (real BDL splits), compared to season OPS from
// getMlbPlayerSeasonStats. Fully defensive; never throws, returns [] on missing
// data, and emits a one-line examined/emitted summary at the end.
//
// Guards FAIL CLOSED: a missing season GP, a missing/short recent sample, or a
// non-positive OPS (season OR recent) skips the batter. The dip is weighted by
// recent sample size before scoring so a 25-PA slump can't outrank a 120-PA one.
// No prop tie-in here (that's heatCheck only).

import {
  makeRow, TONES, scoreFromEdge, round, pct3, pickVariant,
} from '../shared.js';

const MIN_RECENT_PA = 25;     // require a real recent PA sample
const MIN_RECENT_AB = 22;     // lower floor when only at_bats is available
const MIN_SEASON_GP = 15;     // require a real season baseline (fail closed if absent)
const MIN_OPS_DIP = 0.130;    // recent OPS must trail season by this much
const PA_FULL_CREDIT = 60;    // recent windows >= this PA get full dip weight
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 200;

export async function computeCoolingOff(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  const stats = { examined: 0, emitted: 0 };
  for (const game of games) {
    try {
      rows.push(...(await coldForGame(
        game, { season, bdl, gameLabel: helpers.gameLabel, stats },
      )));
    } catch (err) {
      console.error('[coolingOff] game error:', err?.message || err);
    }
  }
  stats.emitted = rows.length;
  console.log(`[coolingOff] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function coldForGame(game, { season, bdl, gameLabel, stats }) {
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
      if (stats) stats.examined += 1;

      const seasonOps = Number(seasonRec.batting_ops);
      if (!Number.isFinite(seasonOps) || seasonOps <= 0) continue;
      // Games-played guard — FAIL CLOSED. Require a real, finite GP at/above the
      // floor; a missing GP field means no trustworthy baseline, so skip.
      const seasonGp = Number(seasonRec.gp ?? seasonRec.games_played ?? seasonRec.batting_gp);
      if (!Number.isFinite(seasonGp) || seasonGp < MIN_SEASON_GP) continue;

      const splits = await bdl.getMlbPlayerSplits({ playerId, season });
      const recent = recentSplit(splits);
      if (!recent) continue;

      // Prefer true plate_appearances; fall back to at_bats against a lower floor
      // (AB undercounts PA — reusing the PA floor on an AB count over-demands).
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

      const dip = seasonOps - recentOps; // positive = colder than the season baseline
      if (dip < MIN_OPS_DIP) continue;

      // Weight the dip by sample size so a 25-PA slump can't score like a 120-PA one.
      const effectiveDip = dip * Math.min(1, recentSample / PA_FULL_CREDIT);

      candidates.push({
        playerId,
        teamId,
        name: b.name || seasonRec.player?.full_name || 'Batter',
        recentOps,
        seasonOps,
        dip,
        effectiveDip,
        recentPa: recentSample,
        recentLabel: recent.split_name || 'recent',
      });
    }
  }

  candidates.sort((a, b) => b.effectiveDip - a.effectiveDip);
  return candidates.slice(0, MAX_PER_GAME).map((c) =>
    makeRow({
      category: 'coolingOff',
      headline: `${c.name} has gone cold: ${pct3(c.recentOps)} OPS in ${c.recentLabel}`,
      detail: buildDetail(c),
      game: label,
      value: pct3(c.recentOps),
      tone: TONES.COLD,
      spark: [round(c.seasonOps, 3), round(c.recentOps, 3)],
      relevance_score: scoreFromEdge(c.effectiveDip, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );
}

/**
 * Detail copy. Plain/factual; ADDS what the headline lacks — the PA sample, the
 * season baseline, and the size of the drop. Three deterministic sentence
 * variants keyed off player_id so a slate doesn't read machine-stamped.
 */
function buildDetail(c) {
  const recent = pct3(c.recentOps);
  const base = pct3(c.seasonOps);
  const win = c.recentLabel.toLowerCase();
  const drop = round(c.dip, 3);
  const variants = [
    `Over the ${win} (${c.recentPa} PA) he is at a ${recent} OPS, down ${drop} from his ${base} season mark.`,
    `That ${recent} OPS spans the ${win} (${c.recentPa} PA) against a ${base} season baseline, a ${drop} drop.`,
    `The ${win} sample runs ${c.recentPa} PA: a ${recent} OPS versus ${base} for the season, ${drop} below his norm.`,
  ];
  return pickVariant(variants, c.playerId);
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
