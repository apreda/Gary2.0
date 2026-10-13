// gary2.0/src/services/insights/computers/nbaOwned.js
//
// LANE: owned (NBA — head-to-head lane)
// "How has this season's series between tonight's two teams gone — who leads,
//  and by how much per game (Finals meetings included)?"
//
// Approach (all data from documented BDL methods only):
//   - For the two slate teams we pull this season's completed games for ONE of
//     them via getGames('basketball_nba', { seasons:[season], team_ids:[id],
//     per_page }) for BOTH postseason=false and postseason=true, then keep only
//     the games where the OTHER team is the opponent. This includes the Finals
//     series itself (those are postseason=true games).
//   - If the SDK call yields nothing we fall back to a day-by-day lookback over
//     the last ~120 dates with getNbaGamesForDate, filtering for head-to-head.
//   - We count the W-L from the home team's perspective and the average scoring
//     margin per meeting, and surface "X leads the season series 3-1, winning by
//     7.5 a game." Skipped when fewer than 2 prior meetings exist.
//
// Data path / field names (verified against the live BDL surface):
//   * getGames('basketball_nba', params) -> Array of NBA game objects:
//       { id, date, status, postseason, home_team_score, visitor_team_score,
//         home_team:{id,abbreviation,full_name}, visitor_team:{...} }.
//     Params {seasons, team_ids, postseason, per_page} are supported (see
//     the live BDL surface). A game is FINAL once both scores are present.
//   * getNbaGamesForDate(dateStr) -> same game shape (fallback path).
//
// Defensive contract: never throws; returns [] when data is missing; emits a
// one-line summary log at the end so 0-row runs are diagnosable.

import {
  makeRow, TONES, pickVariant, round,
} from '../shared.js';

// Tunables.
const MIN_MEETINGS = 2;            // need at least this many prior meetings
const LOOKBACK_DAYS = 120;         // fallback day-by-day window
const BASE_RELEVANCE = 55;
const PER_WIN_DIFF = 4;            // +4 relevance per game of series-lead margin
const RELEVANCE_CAP = 80;

/** YYYY-MM-DD for `daysAgo` days before `dateStr`. */
function shiftDate(dateStr, daysAgo) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** A BDL NBA game is "final" once both team scores are present. */
function isFinal(game) {
  // Status-first, matching the codebase's canonical completed-game gate: BDL
  // carries LIVE scores during games, so score-presence alone would count an
  // in-progress game as final on a multi-game slate.
  const status = String(game?.status || '').toLowerCase();
  if (status.includes('final')) return true;
  if (status) return false; // scheduled (ISO datetime) or in-progress ("Qtr 2 ...")
  const h = Number(game?.home_team_score);
  const v = Number(game?.visitor_team_score);
  return Number.isFinite(h) && Number.isFinite(v) && (h > 0 || v > 0);
}

/** Is this game between exactly teamA and teamB (either home/away orientation)? */
function isHeadToHead(game, aId, bId) {
  const hId = game?.home_team?.id;
  const vId = game?.visitor_team?.id;
  return (hId === aId && vId === bId) || (hId === bId && vId === aId);
}

/**
 * The prior head-to-head FINAL meetings this season between teamA and teamB.
 * Primary path uses getGames for teamA (regular + postseason merged); falls
 * back to a day-by-day lookback if that yields nothing. De-duped by game id,
 * sorted newest-first.
 */
async function seriesMeetings(aId, bId, season, slateDate, bdl) {
  let games = [];
  try {
    const [reg, post] = await Promise.all([
      bdl.getGames('basketball_nba', { seasons: [season], team_ids: [aId], postseason: false, per_page: 100 }),
      bdl.getGames('basketball_nba', { seasons: [season], team_ids: [aId], postseason: true, per_page: 100 }),
    ]);
    games = [...(Array.isArray(reg) ? reg : []), ...(Array.isArray(post) ? post : [])];
  } catch {
    games = [];
  }

  if (games.length === 0) {
    for (let back = 1; back <= LOOKBACK_DAYS; back++) {
      const dateStr = shiftDate(slateDate, back);
      if (!dateStr) break;
      const day = (await bdl.getNbaGamesForDate(dateStr)) || [];
      const found = Array.isArray(day) ? day.filter((g) => isHeadToHead(g, aId, bId)) : [];
      games.push(...found);
    }
  }

  const meetings = games
    .filter((g) => isHeadToHead(g, aId, bId) && isFinal(g))
    .filter((g) => !slateDate || String(g?.date || '').slice(0, 10) < slateDate);

  const byId = new Map();
  for (const g of meetings) {
    const id = g?.id;
    if (id != null && !byId.has(id)) byId.set(id, g);
  }

  return [...byId.values()].sort(
    (a, b) => String(b?.date || '').localeCompare(String(a?.date || '')),
  );
}

export async function computeNbaOwned(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const rows = [];
  let examined = 0;

  for (const game of games || []) {
    try {
      const gameId = game?.id;
      const home = game?.home_team;
      const away = game?.visitor_team;
      if (gameId == null || !home?.id || !away?.id) continue;
      examined++;

      const label = helpers.gameLabel(game);
      const meetings = await seriesMeetings(home.id, away.id, season, date, bdl);
      if (meetings.length < MIN_MEETINGS) continue;

      // Tally from the home team's perspective; track absolute margin per game.
      let homeWins = 0;
      let homeMarginSum = 0;
      for (const g of meetings) {
        const h = Number(g?.home_team_score);
        const v = Number(g?.visitor_team_score);
        if (!Number.isFinite(h) || !Number.isFinite(v)) continue;
        const homeIsTonightHome = g?.home_team?.id === home.id;
        const homeScore = homeIsTonightHome ? h : v;
        const awayScore = homeIsTonightHome ? v : h;
        if (homeScore > awayScore) homeWins++;
        homeMarginSum += (homeScore - awayScore);
      }
      const total = meetings.length;
      const awayWins = total - homeWins;
      const winDiff = homeWins - awayWins;
      if (winDiff === 0) continue; // a split series isn't an "owned" angle

      const leader = winDiff > 0 ? home : away;
      const trailer = winDiff > 0 ? away : home;
      const leaderWins = Math.max(homeWins, awayWins);
      const trailerWins = Math.min(homeWins, awayWins);
      // Average margin from the LEADER's perspective.
      const leaderMargin = winDiff > 0 ? (homeMarginSum / total) : (-homeMarginSum / total);
      const marginAbs = round(Math.abs(leaderMargin), 1);
      const key = `${leader.id}-${trailer.id}-${total}`;

      const variants = [
        `${leader.full_name || leader.abbreviation} leads the season series ${leaderWins}-${trailerWins}, ${leaderMargin >= 0 ? 'winning' : 'losing'} by ${marginAbs} a game across ${total} meetings.`,
        `${leader.abbreviation} is ${leaderWins}-${trailerWins} against ${trailer.abbreviation} this season with a ${marginAbs}-point average ${leaderMargin >= 0 ? 'margin' : 'deficit'} over ${total} games.`,
        `Series edge: ${leader.abbreviation} holds a ${leaderWins}-${trailerWins} mark on ${trailer.abbreviation} (avg ${marginAbs}-point ${leaderMargin >= 0 ? 'win' : 'loss'} margin, ${total} prior meetings).`,
      ];

      rows.push(makeRow({
        category: 'owned',
        headline: `${leader.abbreviation} leads the series ${leaderWins}-${trailerWins}`,
        detail: pickVariant(variants, key),
        game: label,
        value: `${leaderWins}-${trailerWins}`,
        tone: TONES.HOT,
        relevance_score: Math.min(RELEVANCE_CAP, BASE_RELEVANCE + PER_WIN_DIFF * Math.abs(winDiff)),
        team_id: leader.id,
        game_id: gameId,
      }));
    } catch (err) {
      console.error('[nbaOwned] game error:', err?.message || err);
    }
  }

  console.log(`[nbaOwned] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaOwned };
