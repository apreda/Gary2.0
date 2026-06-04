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
//   - For each batter, compare the opposing starter's throwing hand to the
//     batter's bats hand, then read the batter's own L/R split from
//     getMlbPlayerSplits().byBreakdown ('vs. Left' / 'vs. Right') vs the
//     batter's overall (other-hand) split to size the platoon edge.
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
//   * "For L/R platoon splits, cross-reference lineup batsThrows against
//     getMlbPlayerSplits().byBreakdown 'vs. Left'/'vs. Right'."
//
// Defensive: missing pitcher hand, missing split, or tiny sample -> skip.

import {
  makeRow, TONES, parseBatsThrows, effectiveBatterSide, splitNameForPitcherFacing,
  scoreFromEdge, round, pct3,
} from '../shared.js';

const MIN_SPLIT_AB = 40;        // require a real split sample
const MIN_OPS_EDGE = 0.130;     // platoon-side OPS must beat off-side by this
const TOP_ORDER_SPOTS = 6;      // only spots 1-6 move a game meaningfully
const MAX_PER_GAME = 2;
const RELEVANCE_SCALE = 180;

export async function computePlatoonEdge(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const rows = [];
  for (const game of games) {
    try {
      rows.push(...(await platoonForGame(game, { season, bdl, gameLabel: helpers.gameLabel })));
    } catch (err) {
      console.error('[platoonEdge] game error:', err?.message || err);
    }
  }
  return rows;
}

async function platoonForGame(game, { season, bdl, gameLabel }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const homeAbbr = game?.home_team?.abbreviation;
  const awayAbbr = game?.visitor_team?.abbreviation;
  if (!homeAbbr || !awayAbbr) return [];

  const home = lineups[homeAbbr];
  const away = lineups[awayAbbr];
  if (!home || !away) return [];

  // Opposing starter for each side.
  const homePitcherThrows = parseBatsThrows(home?.pitcher?.batsThrows).throws;
  const awayPitcherThrows = parseBatsThrows(away?.pitcher?.batsThrows).throws;

  const candidates = [];

  // Home hitters face the AWAY pitcher; away hitters face the HOME pitcher.
  candidates.push(
    ...(await collectSide({
      side: home, teamId: game?.home_team?.id, oppPitcher: away?.pitcher,
      oppThrows: awayPitcherThrows, season, bdl,
    })),
  );
  candidates.push(
    ...(await collectSide({
      side: away, teamId: game?.visitor_team?.id, oppPitcher: home?.pitcher,
      oppThrows: homePitcherThrows, season, bdl,
    })),
  );

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_PER_GAME).map((c) =>
    makeRow({
      category: 'platoonEdge',
      headline:
        `${c.name} (bats ${c.batsLabel}) draws ${c.oppName} (${c.oppThrows}HP), ` +
        `hitting ${ordinal(c.order)}`,
      detail:
        `${c.name} carries a ${pct3(c.favOps)} OPS ${c.favSplitName} vs ` +
        `${pct3(c.offOps)} the other way (${c.favAb} AB sample), and faces ` +
        `${c.oppThrows}HP ${c.oppName} tonight from the ${ordinal(c.order)} spot — ` +
        `a platoon split his blended season line may not reflect.`,
      game: label,
      value: pct3(c.favOps),
      tone: TONES.EDGE,
      spark: [round(c.offOps, 3), round(c.favOps, 3)],
      relevance_score: c.score,
      player_id: c.playerId,
      team_id: c.teamId,
      game_id: gameId,
    }),
  );
}

async function collectSide({ side, teamId, oppPitcher, oppThrows, season, bdl }) {
  const out = [];
  if (!oppThrows) return out; // unknown opposing hand -> no platoon read
  const oppName = oppPitcher?.name || 'the starter';
  const batters = Array.isArray(side?.batters) ? side.batters : [];

  for (const b of batters) {
    const order = Number(b?.battingOrder);
    if (!Number.isFinite(order) || order < 1 || order > TOP_ORDER_SPOTS) continue;

    const playerId = b?.playerId;
    if (playerId == null) continue;

    const bats = parseBatsThrows(b.batsThrows).bats;
    if (!bats) continue;

    // Effective platoon side for switch hitters depends on opposing hand.
    const effSide = effectiveBatterSide(bats, oppThrows); // 'L' | 'R' | null
    if (!effSide) continue;

    // Which split bucket describes facing this pitcher's hand?
    const favSplitName = splitNameForPitcherFacing(oppThrows); // 'vs. Left'|'vs. Right'
    const offSplitName = favSplitName === 'vs. Left' ? 'vs. Right' : 'vs. Left';
    if (!favSplitName) continue;

    const splits = await bdl.getMlbPlayerSplits({ playerId, season });
    const breakdown = Array.isArray(splits?.byBreakdown) ? splits.byBreakdown : null;
    if (!breakdown) continue;

    const fav = breakdown.find((s) => s.split_name === favSplitName && s.category === 'batting');
    const off = breakdown.find((s) => s.split_name === offSplitName && s.category === 'batting');
    if (!fav || !off) continue;

    const favOps = Number(fav.ops);
    const offOps = Number(off.ops);
    const favAb = Number(fav.at_bats);
    if (!Number.isFinite(favOps) || !Number.isFinite(offOps)) continue;
    if (!Number.isFinite(favAb) || favAb < MIN_SPLIT_AB) continue;

    const edge = favOps - offOps;
    if (edge < MIN_OPS_EDGE) continue;

    // Lineup-spot weight: higher in the order = more PAs = more relevant.
    const orderBoost = (TOP_ORDER_SPOTS - order) * 1.5; // spot 1 -> +7.5, spot 6 -> 0
    const score = scoreFromEdge(edge, { scale: RELEVANCE_SCALE, base: 42 }) + orderBoost;

    out.push({
      playerId,
      teamId,
      name: b.name || 'Batter',
      batsLabel: bats === 'S' ? 'S' : bats,
      order,
      oppName,
      oppThrows,
      favSplitName,
      favOps,
      offOps,
      favAb,
      score: Math.min(95, Math.round(score)),
    });
  }
  return out;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default { computePlatoonEdge };
