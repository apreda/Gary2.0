// gary2.0/src/services/insights/computers/platoonEdge.js
//
// LANE: platoonEdge
// "A hitter in tonight's lineup has a pronounced split vs the hand of the
//  OPPOSING probable starter, and he's hitting high enough in the order for
//  it to matter."
//
// Approach (documented BDL methods only):
//   - getMlbLineups(gameId) gives BOTH sides' batters (with battingOrder and
//     batsThrows) AND each side's probable pitcher (with batsThrows). The
//     opposing pitcher for a hitter is the pitcher on the OTHER team's entry.
//   - For each batter, resolve the platoon-advantage side vs the opposing
//     starter's hand (switch hitters bat opposite the pitcher), then read the
//     batter's own L/R split from getMlbPlayerSplits().byBreakdown via the
//     shared getBreakdownSplit() lookup ('vs. Left' / 'vs. Right'). The edge is
//     the favored-side OPS minus the off-side (other-hand) OPS — but ONLY when
//     BOTH sides carry a real sample (favAb >= MIN_SPLIT_AB and
//     offAb >= MIN_OFFSIDE_AB), so a tiny off-side denominator can't manufacture
//     a fake gap.
//
// Scoring (see fix history):
//   - Magnitude score = scoreFromEdge(edge, { scale, base, cap:88 }). The eased
//     scoreFromEdge approaches the cap asymptotically, so cap:88 leaves real
//     headroom below 95 for the lineup-spot boost to live in.
//   - orderBoost (higher in the order = more PAs = more relevant) is ADDED to
//     the magnitude score, then the sum is clamped ONCE via clampScore (<=95).
//     The old code clamped inside scoreFromEdge AND again after the boost, which
//     crushed the boost back out for every strong edge.
//
// IMPORTANT — methods/fields quoted from the reference (no invention):
//   * getMlbLineups(gameId): keyed by team abbreviation; per team
//     { pitcher: { name, batsThrows, playerId }, batters: [{ name, position,
//     battingOrder, batsThrows, playerId }] }. "Handedness = batsThrows
//     (string like 'R/R','L/L','S/R') ... Probable pitcher identified via raw
//     is_probable_pitcher".
//   * getMlbPlayerSplits({ playerId, season }).byBreakdown: "array of L/R +
//     home/away + day/night splits. split_name values include exactly
//     'vs. Left' and 'vs. Right'. Entry keys: { category, split_name,
//     split_abbreviation, avg, ops, home_runs, at_bats }". For hitters use
//     avg/ops/home_runs.
//
// Defensive: missing pitcher hand, missing split, or thin sample on EITHER
// side -> skip silently; never throws.

import {
  makeRow, TONES, parseBatsThrows, effectiveBatterSide, splitNameForPitcherFacing,
  scoreFromEdge, getBreakdownSplit, pickVariant, clampScore, round, pct3,
} from '../shared.js';

const MIN_SPLIT_AB = 40;        // require a real platoon-side sample
const MIN_OFFSIDE_AB = 25;      // off-side must also be real or the gap is noise
const MIN_OPS_EDGE = 0.130;     // platoon-side OPS must beat off-side by this
const TOP_ORDER_SPOTS = 6;      // only spots 1-6 move a game meaningfully
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 180;
const SCORE_BASE = 42;
const SCORE_CAP = 88;           // asymptotic ceiling; boost lives in 88..95
const SCORE_HARD_CAP = 95;      // final clamp after orderBoost

// Plain-voice prose variants. Picked deterministically by player_id so cards
// vary across the slate but stay stable across idempotent re-runs.
const HEADLINE_VARIANTS = [
  ({ name, batsLabel, oppName, oppThrows, order }) =>
    `${name} (${batsLabel}) draws ${oppName} (${oppThrows}HP), batting ${ordinal(order)}`,
  ({ name, batsLabel, oppName, oppThrows, order }) =>
    `${name} (${batsLabel}) hits ${ordinal(order)} against ${oppName} (${oppThrows}HP)`,
  ({ name, batsLabel, oppThrows, order }) =>
    `${name} (${batsLabel}) gets a ${oppThrows}HP from the ${ordinal(order)} spot`,
];

const DETAIL_VARIANTS = [
  ({ name, favOps, favSplitName, offOps, favAb, offAb, oppThrows, oppName, order }) =>
    `${name} carries a ${pct3(favOps)} OPS ${favSplitName} (${favAb} AB) against ` +
    `${pct3(offOps)} the other way (${offAb} AB), and faces ${oppThrows}HP ${oppName} ` +
    `from the ${ordinal(order)} spot — a split his blended season line may not reflect.`,
  ({ name, favOps, favSplitName, offOps, favAb, offAb, oppThrows, oppName, order }) =>
    `Over ${favAb} AB ${favSplitName}, ${name} owns a ${pct3(favOps)} OPS versus ` +
    `${pct3(offOps)} in ${offAb} AB the other way. He sees ${oppThrows}HP ${oppName} ` +
    `tonight hitting ${ordinal(order)}, where the platoon side lines up his way.`,
  ({ name, favOps, favSplitName, offOps, favAb, offAb, oppThrows, oppName }) =>
    `${name}'s ${favSplitName} line (${pct3(favOps)} OPS, ${favAb} AB) sits well above ` +
    `his ${pct3(offOps)} mark the other way (${offAb} AB). Tonight's starter ${oppName} ` +
    `throws ${oppThrows}HP, the hand he hits best.`,
];

export async function computePlatoonEdge(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  let examined = 0;
  for (const game of games) {
    try {
      const result = await platoonForGame(game, { season, bdl, gameLabel: helpers.gameLabel });
      examined += result.examined;
      rows.push(...result.rows);
    } catch (err) {
      console.error('[platoonEdge] game error:', err?.message || err);
    }
  }
  console.log(`[platoonEdge] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

async function platoonForGame(game, { season, bdl, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return { examined: 0, rows: [] };
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return { examined: 0, rows: [] };

  const homeAbbr = game?.home_team?.abbreviation;
  const awayAbbr = game?.visitor_team?.abbreviation;
  if (!homeAbbr || !awayAbbr) return { examined: 0, rows: [] };

  const home = lineups[homeAbbr];
  const away = lineups[awayAbbr];
  if (!home || !away) return { examined: 0, rows: [] };

  // Opposing starter for each side.
  const homePitcherThrows = parseBatsThrows(home?.pitcher?.batsThrows).throws;
  const awayPitcherThrows = parseBatsThrows(away?.pitcher?.batsThrows).throws;

  let examined = 0;
  const candidates = [];

  // Home hitters face the AWAY pitcher; away hitters face the HOME pitcher.
  const homeSide = await collectSide({
    side: home, teamId: game?.home_team?.id, oppPitcher: away?.pitcher,
    oppThrows: awayPitcherThrows, season, bdl,
  });
  const awaySide = await collectSide({
    side: away, teamId: game?.visitor_team?.id, oppPitcher: home?.pitcher,
    oppThrows: homePitcherThrows, season, bdl,
  });
  examined += homeSide.examined + awaySide.examined;
  candidates.push(...homeSide.candidates, ...awaySide.candidates);

  // Deterministic ordering: strongest raw OPS edge first, ties broken by the
  // earlier (lower) lineup spot so the MAX_PER_GAME slice is stable run-to-run.
  candidates.sort((a, b) => (b.edge - a.edge) || (a.order - b.order));

  const rows = candidates.slice(0, MAX_PER_GAME).map((c) =>
    makeRow({
      category: 'platoonEdge',
      headline: pickVariant(HEADLINE_VARIANTS, c.playerId)(c),
      detail: pickVariant(DETAIL_VARIANTS, c.playerId)(c),
      game: label,
      value: pct3(c.favOps),
      tone: TONES.EDGE,
      spark: [round(c.offOps, 3), round(c.favOps, 3)],
      // position drives the iOS Insights row's gold position tag (e.g. "SS").
      meta: c.position ? { position: c.position } : undefined,
      relevance_score: c.score,
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );

  return { examined, rows };
}

async function collectSide({ side, teamId, oppPitcher, oppThrows, season, bdl }) {
  const candidates = [];
  let examined = 0;
  if (!oppThrows) return { examined, candidates }; // unknown opposing hand -> no read
  const oppName = oppPitcher?.name || 'the starter';
  const batters = Array.isArray(side?.batters) ? side.batters : [];

  for (const b of batters) {
    const order = Number(b?.battingOrder);
    if (!Number.isFinite(order) || order < 1 || order > TOP_ORDER_SPOTS) continue;

    const playerId = b?.playerId;
    if (playerId == null) continue;

    const bats = parseBatsThrows(b.batsThrows).bats;
    if (!bats) continue;

    // Effective platoon side for switch hitters depends on the opposing hand.
    const effSide = effectiveBatterSide(bats, oppThrows); // 'L' | 'R' | null
    if (!effSide) continue;

    // Which of the hitter's own split buckets describes facing this pitcher's
    // hand, and which is the off-side (other-hand) comparison?
    const favSplitName = splitNameForPitcherFacing(oppThrows); // 'vs. Left'|'vs. Right'
    if (!favSplitName) continue;
    const offSplitName = favSplitName === 'vs. Left' ? 'vs. Right' : 'vs. Left';

    examined += 1;

    const splits = await bdl.getMlbPlayerSplits({ playerId, season });
    const fav = getBreakdownSplit(splits, favSplitName);
    const off = getBreakdownSplit(splits, offSplitName);
    if (!fav || !off) continue;

    const favOps = Number(fav.ops);
    const offOps = Number(off.ops);
    const favAb = Number(fav.at_bats);
    const offAb = Number(off.at_bats);
    if (!Number.isFinite(favOps) || !Number.isFinite(offOps)) continue;
    // BOTH samples must be real — a thin off-side denominator otherwise invents
    // an edge out of noise.
    if (!Number.isFinite(favAb) || favAb < MIN_SPLIT_AB) continue;
    if (!Number.isFinite(offAb) || offAb < MIN_OFFSIDE_AB) continue;

    const edge = favOps - offOps;
    if (edge < MIN_OPS_EDGE) continue;

    // Magnitude score with headroom (asymptotic, never pins at the cap), THEN
    // add the lineup-spot boost, THEN clamp once. cap:88 keeps room below the
    // 95 hard cap for the boost to actually move the ranking.
    const magnitude = scoreFromEdge(edge, { scale: RELEVANCE_SCALE, base: SCORE_BASE, cap: SCORE_CAP });
    const orderBoost = (TOP_ORDER_SPOTS - order) * 1.5; // spot 1 -> +7.5, spot 6 -> 0
    const score = clampScore(Math.min(SCORE_HARD_CAP, magnitude + orderBoost));

    candidates.push({
      playerId,
      teamId,
      name: b.name || 'Batter',
      position: b.position || null,
      // Switch hitters: show the side they'll actually bat from tonight.
      batsLabel: bats === 'S' ? `switch (bats ${effSide} tonight)` : `bats ${bats}`,
      order,
      oppName,
      oppThrows,
      favSplitName,
      favOps,
      offOps,
      favAb,
      offAb,
      edge,
      score,
    });
  }
  return { examined, candidates };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default { computePlatoonEdge };
