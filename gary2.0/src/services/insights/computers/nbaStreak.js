// gary2.0/src/services/insights/computers/nbaStreak.js
//
// LANE: streak (NBA)
// "Which side of tonight's slate is riding a run? Current win/loss streak and
//  last-10 record, with the scoring margin across the run."
//
// Approach (all data from documented BDL methods only):
//   - For each slate team we pull this season's completed games via
//     getGames('basketball_nba', { seasons:[season], team_ids:[id], per_page })
//     for BOTH postseason=false (regular season) and postseason=true (playoffs),
//     then merge. This is the same call shape nbaPicksHandler.js uses in
//     production, so the param support is verified, not assumed.
//   - If that returns nothing (e.g. SDK shape drift), we fall back to a
//     day-by-day lookback over the last ~45 dates with getNbaGamesForDate.
//   - From the merged, FINAL games sorted newest-first we compute the current
//     win/loss streak and the last-10 record, plus the average scoring margin
//     across the active streak.
//   - Streaks of STREAK_MIN+ are surfaced; relevance scales with streak length.
//
// Data path / field names (verified against the live BDL surface):
//   * getGames('basketball_nba', params) -> Array of NBA game objects:
//       { id, date, status, postseason, home_team_score, visitor_team_score,
//         home_team:{id,abbreviation,full_name}, visitor_team:{...} }.
//     Params {seasons, team_ids, postseason, per_page} are supported (see
//     nbaPicksHandler.js getGames calls). A game is FINAL once both scores are
//     present; scheduled games carry null scores.
//   * getNbaGamesForDate(dateStr) -> same game shape (fallback path).
//
// Defensive contract: never throws; returns [] when data is missing; emits a
// one-line summary log at the end so 0-row runs are diagnosable.

import {
  makeRow, TONES, pickVariant, round,
} from '../shared.js';

// Tunables.
const STREAK_MIN = 3;              // only surface streaks of this length+
const LOOKBACK_DAYS = 45;          // fallback day-by-day window
const BASE_RELEVANCE = 55;
const PER_STREAK = 5;              // +5 relevance per game of streak length
const RELEVANCE_CAP = 85;

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

function involvesTeam(game, teamId) {
  return game?.home_team?.id === teamId || game?.visitor_team?.id === teamId;
}

/**
 * From a team's perspective, the result of one FINAL game.
 * Returns { win: boolean, margin: number (team score - opp score) } or null.
 */
function resultForTeam(game, teamId) {
  const h = Number(game?.home_team_score);
  const v = Number(game?.visitor_team_score);
  if (!Number.isFinite(h) || !Number.isFinite(v)) return null;
  const isHome = game?.home_team?.id === teamId;
  const teamScore = isHome ? h : v;
  const oppScore = isHome ? v : h;
  return { win: teamScore > oppScore, margin: teamScore - oppScore };
}

/**
 * This season's FINAL games for a team, newest-first. Primary path uses the
 * SDK getGames (regular + postseason merged); falls back to a day-by-day
 * lookback if the primary path yields nothing.
 */
async function seasonGamesForTeam(teamId, season, slateDate, bdl) {
  let games = [];
  try {
    const [reg, post] = await Promise.all([
      bdl.getGames('basketball_nba', { seasons: [season], team_ids: [teamId], postseason: false, per_page: 100 }),
      bdl.getGames('basketball_nba', { seasons: [season], team_ids: [teamId], postseason: true, per_page: 100 }),
    ]);
    games = [...(Array.isArray(reg) ? reg : []), ...(Array.isArray(post) ? post : [])];
  } catch {
    games = [];
  }

  // Fallback: day-by-day lookback when the season call came back empty.
  if (games.length === 0) {
    for (let back = 1; back <= LOOKBACK_DAYS; back++) {
      const dateStr = shiftDate(slateDate, back);
      if (!dateStr) break;
      const day = (await bdl.getNbaGamesForDate(dateStr)) || [];
      const found = Array.isArray(day) ? day.filter((g) => involvesTeam(g, teamId)) : [];
      games.push(...found);
    }
  }

  const finals = games
    .filter((g) => involvesTeam(g, teamId) && isFinal(g))
    .filter((g) => !slateDate || String(g?.date || '').slice(0, 10) < slateDate);

  // De-dupe by game id (the two SDK calls + fallback can overlap).
  const byId = new Map();
  for (const g of finals) {
    const id = g?.id;
    if (id != null && !byId.has(id)) byId.set(id, g);
  }

  return [...byId.values()].sort(
    (a, b) => String(b?.date || '').localeCompare(String(a?.date || '')),
  );
}

/**
 * Compute current streak (sign + length), last-10 record, and the average
 * scoring margin across the active streak from newest-first FINAL games.
 */
function summarize(gamesNewestFirst, teamId) {
  const results = [];
  for (const g of gamesNewestFirst) {
    const r = resultForTeam(g, teamId);
    if (r) results.push(r);
  }
  if (results.length === 0) return null;

  const firstWin = results[0].win;
  let streakLen = 0;
  let marginSum = 0;
  for (const r of results) {
    if (r.win !== firstWin) break;
    streakLen++;
    marginSum += r.margin;
  }
  const last10 = results.slice(0, 10);
  const wins10 = last10.filter((r) => r.win).length;

  return {
    won: firstWin,
    streakLen,
    avgMargin: streakLen ? marginSum / streakLen : 0,
    last10: `${wins10}-${last10.length - wins10}`,
    sampleSize: results.length,
  };
}

export async function computeNbaStreak(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const rows = [];
  let examined = 0;

  for (const game of games || []) {
    try {
      const gameId = game?.id;
      const sides = [game?.home_team, game?.visitor_team].filter((t) => t?.id);
      if (gameId == null || sides.length === 0) continue;
      const label = helpers.gameLabel(game);

      for (const team of sides) {
        examined++;
        const seasonGames = await seasonGamesForTeam(team.id, season, date, bdl);
        const s = summarize(seasonGames, team.id);
        if (!s || s.streakLen < STREAK_MIN) continue;

        const verb = s.won ? 'won' : 'lost';
        const marginAbs = round(Math.abs(s.avgMargin), 1);
        const marginWord = s.won ? 'winning' : 'losing';
        const tone = s.won ? TONES.HOT : TONES.COLD;
        const key = `${team.id}-${s.streakLen}`;

        const variants = [
          `${team.full_name || team.abbreviation} has ${verb} ${s.streakLen} straight, ${marginWord} by ${marginAbs} a game over the run; ${s.last10} across the last ${Math.min(10, s.sampleSize)}.`,
          `${s.streakLen} ${verb === 'won' ? 'wins' : 'losses'} in a row for ${team.abbreviation} (${marginAbs}-point average ${s.won ? 'margin' : 'deficit'}), sitting ${s.last10} over their last ${Math.min(10, s.sampleSize)}.`,
          `${team.abbreviation} ${verb} its last ${s.streakLen} by an average of ${marginAbs}; their last-10 mark is ${s.last10}.`,
        ];

        rows.push(makeRow({
          category: 'streak',
          headline: `${team.abbreviation} has ${verb} ${s.streakLen} straight`,
          detail: pickVariant(variants, key),
          game: label,
          value: `${s.won ? 'W' : 'L'}${s.streakLen}`,
          tone,
          relevance_score: Math.min(RELEVANCE_CAP, BASE_RELEVANCE + PER_STREAK * s.streakLen),
          team_id: team.id,
          game_id: gameId,
        }));
      }
    } catch (err) {
      console.error('[nbaStreak] game error:', err?.message || err);
    }
  }

  console.log(`[nbaStreak] examined ${examined}, emitted ${rows.length}`);
  return rows;
}

export default { computeNbaStreak };
