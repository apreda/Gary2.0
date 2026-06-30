// gary2.0/src/services/insights/computers/headToHead.js
//
// LANE: headToHead  (category token emitted: head_to_head)
// MATCHUP HISTORY — "the Brewers are 8-1 vs the Pirates this season" + the last
// meeting (the revenge spot). The angle a bettor knows about their OWN team but
// not about a team they're fading because they don't follow it.
//
// Pure data, $0: this season's head-to-head FINALS pulled straight from the
// BDL season game index (getMlbSeasonGameIndex) — every real game between the two
// teams, with home/away ids + runs + date. No external call beyond the index the
// other team-level computers already cache.
//
// TEAM-subject row (team_id of the dominant side + the SLATE game_id, so the
// orchestrator's slate-membership gate keeps it). Surface only a lopsided series
// (|wins - losses| >= SURFACE_DIFF over >= MIN_GAMES) — a 4-3 is noise.
//
// Defensive: any missing piece -> skip that game silently; never throws.

import { makeRow, TONES, scoreFromEdge } from '../shared.js';

const MIN_GAMES = 4;        // a real H2H sample (division rivals have plenty by June)
const SURFACE_DIFF = 3;     // |wins - losses| over the series to be an angle
const MAX_ROWS = 8;         // slate-wide cap, most-lopsided first
const RELEVANCE_SCALE = 13;

const isFinal = (g) => String(g?.status || '').toUpperCase().includes('FINAL');
const decided = (g) =>
  isFinal(g) && Number.isFinite(Number(g?.homeRuns)) && Number.isFinite(Number(g?.awayRuns))
  && Number(g.homeRuns) !== Number(g.awayRuns);

export async function computeHeadToHead(ctx) {
  const { games, season, bdl, helpers } = ctx;

  let index;
  try {
    index = await bdl.getMlbSeasonGameIndex(season);
  } catch (err) {
    console.error('[headToHead] season index error:', err?.message || err);
    return [];
  }
  if (!index || typeof index.values !== 'function') return [];
  const seasonGames = [...index.values()].filter(decided);

  const candidates = [];
  let examined = 0;

  for (const game of games) {
    if (isFinal(game)) continue;
    const gameId = game?.id;
    const home = { id: game?.home_team?.id, abbr: game?.home_team?.abbreviation, name: game?.home_team?.name };
    const away = { id: game?.away_team?.id, abbr: game?.away_team?.abbreviation, name: game?.away_team?.name };
    if (gameId == null || home.id == null || away.id == null) continue;
    examined += 1;

    // Every decided game between THESE two teams this season.
    const h2h = seasonGames.filter((g) =>
      (g.homeId === home.id && g.awayId === away.id) || (g.homeId === away.id && g.awayId === home.id),
    );
    if (h2h.length < MIN_GAMES) continue;
    h2h.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));   // oldest -> newest

    // Record from today's HOME team's perspective.
    let homeWins = 0;
    for (const g of h2h) {
      const homeIsTodaysHome = g.homeId === home.id;
      const hRuns = Number(homeIsTodaysHome ? g.homeRuns : g.awayRuns);
      const aRuns = Number(homeIsTodaysHome ? g.awayRuns : g.homeRuns);
      if (hRuns > aRuns) homeWins += 1;
    }
    const awayWins = h2h.length - homeWins;       // no ties (decided() filtered them)
    const diff = Math.abs(homeWins - awayWins);
    if (diff < SURFACE_DIFF) continue;

    // The dominant side leads the series.
    const homeDominant = homeWins > awayWins;
    const dom = homeDominant ? home : away;
    const sub = homeDominant ? away : home;
    const domWins = Math.max(homeWins, awayWins);
    const subWins = Math.min(homeWins, awayWins);
    const record = `${domWins}-${subWins}`;

    // The last meeting — the revenge read.
    const last = h2h[h2h.length - 1];
    const lastHomeIsDom = last.homeId === dom.id;
    const domRuns = Number(lastHomeIsDom ? last.homeRuns : last.awayRuns);
    const subRuns = Number(lastHomeIsDom ? last.awayRuns : last.homeRuns);
    const domWonLast = domRuns > subRuns;
    const lastScore = `${Math.max(domRuns, subRuns)}-${Math.min(domRuns, subRuns)}`;

    const domName = dom.name || dom.abbr || 'The team';
    const subName = sub.name || sub.abbr || 'the opponent';
    const headline = `${domName} are ${record} vs ${subName} this season`;
    const lastClause = domWonLast
      ? `${dom.abbr} won the last meeting ${lastScore}`
      : `${sub.abbr} took the last meeting ${lastScore} — a revenge spot`;
    const detail = `${domName} lead the season series ${record} over ${subName}. ${lastClause}.`;

    candidates.push(makeRow({
      category: 'headToHead',
      headline,
      detail,
      game: helpers.gameLabel(game),
      value: record,
      tone: TONES.HOT,
      relevance_score: scoreFromEdge(diff, { scale: RELEVANCE_SCALE, base: 52 }),
      team_id: dom.id,
      game_id: gameId,            // SLATE game id — slate-membership gate keeps it
      meta: {
        kind: 'h2h',
        dominant: dom.abbr,
        dominant_name: domName,
        opponent: sub.abbr,
        opponent_name: subName,
        wins: domWins,
        losses: subWins,
        games: h2h.length,
        last_meeting: { winner: domWonLast ? dom.abbr : sub.abbr, score: lastScore, revenge: !domWonLast },
        season,
      },
    }));
  }

  candidates.sort((a, b) => b.relevance_score - a.relevance_score);
  const rows = candidates.slice(0, MAX_ROWS);
  console.log(`[headToHead] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeHeadToHead };
