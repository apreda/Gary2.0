// Football scoring environment, grounded only in current BDL sportsbook totals.
// A row ships when a game's total materially differs from the median total on
// the same exact-date slate. Missing/incomplete markets simply emit nothing.

import { makeRow, TONES, median } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { selectFootballOddsByGame } from '../footballData.js';

const DEVIATION_MIN = Object.freeze({ nfl: 3.5, ncaaf: 4 });

function display(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(1).replace(/\.0$/, '');
}

export async function computeFootballMarketEdges(ctx) {
  const { games, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (!['nfl', 'ncaaf'].includes(league) || !Array.isArray(games) || games.length === 0) return [];

  let odds = [];
  try {
    odds = await bdl.getOddsV2(
      { game_ids: games.map((game) => game?.id).filter((id) => id != null), per_page: 100 },
      league === 'nfl' ? 'americanfootball_nfl' : 'americanfootball_ncaaf',
      1,
    );
  } catch (err) {
    console.warn(`[footballMarketEdges] ${league.toUpperCase()} odds omitted: ${err?.message || err}`);
    return [];
  }

  const selected = selectFootballOddsByGame(odds, new Set(games.map((game) => game?.id)));
  const slateTotals = [...selected.values()].map((item) => item.total);
  if (slateTotals.length < 3) return [];
  const midpoint = median(slateTotals);
  if (!Number.isFinite(midpoint)) return [];

  const rows = [];
  for (const game of games) {
    const picked = selected.get(String(game?.id));
    if (!picked) continue;
    const deviation = picked.total - midpoint;
    if (Math.abs(deviation) < DEVIATION_MIN[league]) continue;
    const totalText = display(picked.total);
    const medianText = display(midpoint);
    const gapText = display(Math.abs(deviation));
    if (!totalText || !medianText || !gapText) continue;
    const direction = deviation > 0 ? 'above' : 'below';
    const label = helpers.gameLabel(game);

    rows.push(makeRow({
      category: 'pace_script',
      headline: `${label} carries a ${totalText} market total`,
      detail:
        `The current ${picked.row?.vendor || 'sportsbook'} total is ${totalText}, ` +
        `${gapText} points ${direction} the ${medianText} median across ${slateTotals.length} games with posted totals on this slate.`,
      game: label,
      value: totalText,
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(90, Math.round(55 + Math.abs(deviation) * 3)),
      line_val: picked.total,
      game_id: game.id,
      meta: {
        source: 'balldontlie_odds',
        metric: 'market_total_vs_slate_median',
        league: league.toUpperCase(),
        date,
        vendor: picked.row?.vendor || null,
        total: picked.total,
        slate_median: midpoint,
        slate_games_with_totals: slateTotals.length,
      },
    }));
  }

  await attachLaneReads('footballMarketEdges', rows, detailFact, {
    ask: 'what a total sitting this far from the slate median says about how scoring is expected to arrive in this one — and what would have to be true tonight for that expectation to crack',
  });

  console.log(`[footballMarketEdges] ${league.toUpperCase()} ${date}: ${slateTotals.length} totals -> ${rows.length} row(s)`);
  return rows;
}

export default { computeFootballMarketEdges };
