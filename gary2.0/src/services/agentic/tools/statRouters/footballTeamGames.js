import { ballDontLieService } from '../../../ballDontLieService.js';
import { isGameCompleted } from '../../sharedUtils.js';

/**
 * Shared game-ledger helpers for the NFL and NCAAF stat routers.
 *
 * BDL does not use the same score keys in both football leagues: NFL rows
 * carry home_team_score/visitor_team_score, NCAAF rows carry home_score/
 * away_score. Reading one league's key on the other returns undefined, not an
 * error — the exact shape that makes a lane go quiet instead of loud. Both
 * spellings are normalized here, once, so no fetcher has to know.
 */

/**
 * BDL stamps postseason football games with week 999 — a sentinel, not a week.
 * Ohio State's 2025 season carries 28 such rows (a Jan 1 bowl), and rendering
 * it raw printed "Wk 999" into the desk as if it were a real week number.
 * Verified Aug 25 2026 on both /player_stats and /games.
 */
const POSTSEASON_WEEK_FLOOR = 900;

export function footballWeekLabel(week) {
  if (week === null || week === undefined || week === '') return 'Wk ?';
  const n = Number(week);
  if (!Number.isFinite(n)) return 'Wk ?';
  return n >= POSTSEASON_WEEK_FLOOR ? 'Postseason' : `Wk ${n}`;
}

/** Score for one side of a game row, across both leagues' key spellings. */
function sideScore(game, side) {
  const value = side === 'home'
    ? (game?.home_team_score ?? game?.home_score)
    : (game?.visitor_team_score ?? game?.away_score);
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function teamIdOf(game, side) {
  const team = side === 'home' ? game?.home_team : (game?.visitor_team || game?.away_team);
  return team?.id ?? null;
}

function teamNameOf(game, side) {
  const team = side === 'home' ? game?.home_team : (game?.visitor_team || game?.away_team);
  return team?.full_name || team?.name || null;
}

/**
 * Completed games for one team, newest first, with each result reduced to the
 * facts a bettor reads: who it was against, where, the score, the margin.
 */
export function toTeamResults(games, teamId) {
  const id = Number(teamId);
  return (games || [])
    .filter((g) => isGameCompleted(g?.status))
    .map((g) => {
      const isHome = Number(teamIdOf(g, 'home')) === id;
      const isAway = Number(teamIdOf(g, 'away')) === id;
      if (!isHome && !isAway) return null;

      const side = isHome ? 'home' : 'away';
      const opponentSide = isHome ? 'away' : 'home';
      const scored = sideScore(g, side);
      const allowed = sideScore(g, opponentSide);
      if (scored === null || allowed === null) return null;

      return {
        // Kept so per-player game rows (whose embedded game object has null
        // teams in NCAAF) can be joined back to a real opponent.
        gameId: g.id ?? null,
        date: g.date || null,
        week: g.week ?? null,
        home: isHome,
        opponent: teamNameOf(g, opponentSide),
        scored,
        allowed,
        margin: scored - allowed,
        won: scored > allowed
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function loadTeamResults(bdlSport, teamId, season) {
  const games = await ballDontLieService.getGames(bdlSport, {
    team_ids: [teamId],
    seasons: [season],
    per_page: 100
  });
  return toTeamResults(games, teamId);
}

/** W-L plus the games themselves, so a rate always arrives with its schedule. */
export function formSummary(results, count = 5) {
  const window = results.slice(0, count);
  if (window.length === 0) return null;
  const wins = window.filter((r) => r.won).length;
  return {
    record: `${wins}-${window.length - wins}`,
    games_used: window.length,
    points_per_game: round(avg(window.map((r) => r.scored)), 1),
    points_allowed_per_game: round(avg(window.map((r) => r.allowed)), 1),
    results: window.map((r) => (
      `${r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home ? 'vs' : '@'} ${r.opponent || 'Unknown'}`
    ))
  };
}

export function homeAwaySplit(results) {
  const build = (subset) => {
    if (subset.length === 0) return null;
    const wins = subset.filter((r) => r.won).length;
    return {
      record: `${wins}-${subset.length - wins}`,
      games_used: subset.length,
      points_per_game: round(avg(subset.map((r) => r.scored)), 1),
      points_allowed_per_game: round(avg(subset.map((r) => r.allowed)), 1),
      avg_margin: round(avg(subset.map((r) => r.margin)), 1)
    };
  };
  return { home: build(results.filter((r) => r.home)), away: build(results.filter((r) => !r.home)) };
}

/**
 * Margin shape. A 3-1 built on three one-score wins is a different team from a
 * 3-1 with two blowouts, and the season average hides which one it is.
 */
export function marginProfile(results) {
  if (results.length === 0) return null;
  const margins = results.map((r) => r.margin);
  const mean = avg(margins);
  const variance = avg(margins.map((m) => (m - mean) ** 2));
  return {
    games_used: results.length,
    avg_margin: round(mean, 1),
    margin_std_dev: round(Math.sqrt(variance), 1),
    one_score_games: margins.filter((m) => Math.abs(m) <= 8).length,
    one_score_record: recordFor(results.filter((r) => Math.abs(r.margin) <= 8)),
    blowouts_for: margins.filter((m) => m >= 17).length,
    blowouts_against: margins.filter((m) => m <= -17).length,
    largest_win: margins.length ? Math.max(...margins) : null,
    largest_loss: margins.length ? Math.min(...margins) : null
  };
}

export function closeGameRecord(results, withinPoints = 7) {
  const close = results.filter((r) => Math.abs(r.margin) <= withinPoints);
  if (close.length === 0) return null;
  return {
    record: recordFor(close),
    games_used: close.length,
    results: close.map((r) => (
      `${r.won ? 'W' : 'L'} ${r.scored}-${r.allowed} ${r.home ? 'vs' : '@'} ${r.opponent || 'Unknown'}`
    ))
  };
}

function recordFor(results) {
  const wins = results.filter((r) => r.won).length;
  return `${wins}-${results.length - wins}`;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value, decimals) {
  return Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
}
