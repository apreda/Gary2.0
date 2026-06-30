// gary2.0/src/services/insights/computers/coolingOff.js
//
// LANE: coolingOff  (category token emitted: cooling_off) — the inverse of
// heatCheck. A bat is in a cold stretch relative to its season baseline; the
// line may still be priced off the season number. Recent window = byDayMonth
// "Last 15/7/30 Days" (real BDL splits), compared to season OPS from
// getMlbPlayerSeasonStats. Fully defensive; never throws, returns [] on missing
// data, and emits a one-line examined/emitted summary at the end.
//
// SECOND-ORDER (June 2026): a cold stretch alone is first-order. We tie it to
// TONIGHT'S specific matchup — the opposing probable starter's hand and how the
// batter actually hits that hand (his real vs. Left / vs. Right split). The
// opposing pitcher is already in the lineups object and the split is already in
// the splits object fetched for the recent-window check, so this is a pure,
// $0, in-memory join. The matchup clause is APPEND-ONLY behind a data-presence
// gate: if the pitcher hand is unknown or the split sample is thin, the row
// falls back to the original first-order copy (never a half-sentence). When the
// matchup is the batter's WEAKER side the cold signal is reinforced (relevance
// nudged up); his STRONGER side suggests the slump may not persist (nudged down).
//
// Guards FAIL CLOSED: a missing season GP, a missing/short recent sample, or a
// non-positive OPS (season OR recent) skips the batter. The dip is weighted by
// recent sample size before scoring so a 25-PA slump can't outrank a 120-PA one.
// No prop tie-in here (that's heatCheck only).

import {
  makeRow, TONES, scoreFromEdge, round, pct3, pickVariant,
  getBreakdownSplit, splitNameForPitcherFacing, parseBatsThrows,
} from '../shared.js';

const MIN_RECENT_PA = 25;     // require a real recent PA sample
const MIN_RECENT_AB = 22;     // lower floor when only at_bats is available
const MIN_SEASON_GP = 15;     // require a real season baseline (fail closed if absent)
const MIN_OPS_DIP = 0.130;    // recent OPS must trail season by this much
const PA_FULL_CREDIT = 60;    // recent windows >= this PA get full dip weight
const MIN_SPLIT_AB = 40;      // vs-hand split needs a real sample before we name it
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

  const homeAbbr = game?.home_team?.abbreviation;
  const awayAbbr = game?.visitor_team?.abbreviation;
  const sideTeamIds = {
    [homeAbbr]: game?.home_team?.id,
    [awayAbbr]: game?.visitor_team?.id,
  };
  // Each side's hitters face the OTHER side's probable starter tonight.
  const oppPitcherFor = (abbr) => {
    if (abbr === homeAbbr) return lineups[awayAbbr]?.pitcher || null;
    if (abbr === awayAbbr) return lineups[homeAbbr]?.pitcher || null;
    return null;
  };

  const candidates = [];
  for (const abbr of Object.keys(lineups)) {
    const teamId = sideTeamIds[abbr];
    const batters = Array.isArray(lineups[abbr]?.batters) ? lineups[abbr].batters : [];
    if (!batters.length) continue;
    const oppPitcher = oppPitcherFor(abbr);

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

      // Second-order context: tonight's opposing hand + this batter's vs-hand
      // split. {} when unavailable -> row stays first-order.
      const matchup = buildMatchupContext({ splits, oppPitcher });

      candidates.push({
        playerId,
        teamId,
        name: b.name || seasonRec.player?.full_name || 'Batter',
        position: b.position || null,
        recentOps,
        seasonOps,
        dip,
        effectiveDip,
        recentPa: recentSample,
        recentLabel: recent.split_name || 'recent',
        ...matchup,
      });
    }
  }

  candidates.sort((a, b) => b.effectiveDip - a.effectiveDip);
  return candidates.slice(0, MAX_PER_GAME).map((c) => {
    // The matchup conditions the cold signal: a weaker-side draw reinforces it,
    // a stronger-side draw suggests it may not persist. Deterministic, no model.
    let magnitude = c.effectiveDip;
    if (c.sideWord === 'his weaker side') magnitude *= 1.15;
    else if (c.sideWord === 'his stronger side') magnitude *= 0.9;

    const handWord = c.pitcherHand === 'L' ? 'LHP' : 'RHP';
    const headline = c.pitcherName
      ? `${c.name}: ${pct3(c.recentOps)} OPS in ${shortWindow(c.recentLabel)} — draws ${handWord} ${c.pitcherName}`
      : `${c.name}: ${pct3(c.recentOps)} OPS in ${c.recentLabel}`;

    return makeRow({
      category: 'coolingOff',
      headline,
      detail: buildDetail(c),
      game: label,
      value: pct3(c.recentOps),
      tone: TONES.COLD,
      spark: [round(c.seasonOps, 3), round(c.recentOps, 3)],
      relevance_score: scoreFromEdge(magnitude, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
      // position drives the iOS Insights row's gold position tag; merged with the
      // cold-context matchup payload when a probable pitcher is known.
      meta: (c.position || c.pitcherName) ? {
        ...(c.position ? { position: c.position } : {}),
        ...(c.pitcherName ? {
          kind: 'cold_context',
          pitcher_name: c.pitcherName,
          pitcher_hand: c.pitcherHand,
          vs_hand_ops: round(c.vsHandOps, 3),
          vs_hand_ab: c.vsHandAb,
          side: c.sideWord || null,
        } : {}),
      } : undefined,
    });
  });
}

/**
 * Second-order matchup context: who the cold batter faces tonight (opposing
 * probable starter's hand) and how he hits that hand (his real vs. Left /
 * vs. Right split). Returns {} unless the pitcher hand is known AND the vs-hand
 * split clears MIN_SPLIT_AB — so the detail never emits a half-sentence and the
 * row falls back to first-order copy. `side` calls the matchup his weaker or
 * stronger side by comparing to the opposite split.
 */
function buildMatchupContext({ splits, oppPitcher }) {
  if (!oppPitcher) return {};
  const pitcherName = oppPitcher.name || null;
  const throws = parseBatsThrows(oppPitcher.batsThrows).throws; // 'L' | 'R' | null
  if (!pitcherName || !throws) return {};

  const matchSplit = getBreakdownSplit(splits, splitNameForPitcherFacing(throws));
  const matchAb = Number(matchSplit?.at_bats);
  const matchOps = Number(matchSplit?.ops);
  if (!Number.isFinite(matchAb) || matchAb < MIN_SPLIT_AB) return {};
  if (!Number.isFinite(matchOps) || matchOps <= 0) return {};

  const otherSplit = getBreakdownSplit(splits, splitNameForPitcherFacing(throws === 'L' ? 'R' : 'L'));
  const otherOps = Number(otherSplit?.ops);
  let sideWord = null;
  if (Number.isFinite(otherOps) && otherOps > 0) {
    sideWord = matchOps < otherOps ? 'his weaker side' : 'his stronger side';
  }

  return { pitcherName, pitcherHand: throws, vsHandOps: matchOps, vsHandAb: matchAb, sideWord };
}

/** "Last 15 Days" -> "L15"; falls back to the full label. */
function shortWindow(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('15')) return 'L15';
  if (s.includes('7')) return 'L7';
  if (s.includes('30')) return 'L30';
  return label;
}

/**
 * Detail copy. ADDS what the headline lacks. With matchup context it names the
 * opposing hand + the batter's vs-hand split (the second-order link). Without
 * it, three deterministic first-order variants keyed off player_id so a slate
 * doesn't read machine-stamped.
 */
function buildDetail(c) {
  const recent = pct3(c.recentOps);
  const base = pct3(c.seasonOps);
  const win = c.recentLabel.toLowerCase();
  const drop = round(c.dip, 3);

  if (c.pitcherName && c.pitcherHand) {
    const handWord = c.pitcherHand === 'L' ? 'LHP' : 'RHP';
    const sideClause = c.sideWord ? ` — ${c.sideWord}` : '';
    return `${c.name}'s ${recent} OPS over the ${win} (${c.recentPa} PA) trails his ${base} season mark, down ${drop}. Tonight he draws ${handWord} ${c.pitcherName}${sideClause}: a ${pct3(c.vsHandOps)} OPS vs ${handWord} across ${c.vsHandAb} AB.`;
  }

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
