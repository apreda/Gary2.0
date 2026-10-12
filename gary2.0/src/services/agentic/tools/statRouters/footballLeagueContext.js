import { ballDontLieService } from '../../../ballDontLieService.js';
import { BDL_API_KEY } from './statRouterCommon.js';
import { toTeamResults } from './footballTeamGames.js';
import { FBS } from '../../scoutReport/sports/ncaafFcsGap.js';

/**
 * League-wide context: what each opponent allowed and scored on the season.
 *
 * The founder's standard, Aug 25 2026: "if we're going to show a team's last
 * three games and the stats from those games, there's a lot of context we'd
 * still have to get — who played that game, how good was the team's defense,
 * was it home or away, what happened in that game."
 *
 * A 300-yard passing game against a defense allowing 30 a game and one
 * against a defense allowing 15 are not the same evidence; the opponent's
 * season numbers ride beside the game.
 *
 * Two readers, two forms:
 *   - `opponentQualityLine` (the stat tools' form lines): the figures alone.
 *     Until Oct 1 2026 each carried its league rank; the founder removed
 *     rankings from the tool line ("Gary knows what good is").
 *   - `opponentSeasonClause` (the desks' game-by-game lines, founder GO Oct 12
 *     2026 on the Colorado State @ Texas State read): the figures with the
 *     opponent's rank in its league. Gary had read "Texas State can't finish
 *     drives" off games against the only two good defenses it had faced, and
 *     the desk never said they were good; the market had.
 *
 * NFL: the whole league is one request (BDL's team_season_stats accepts every
 * team_id at once). College: BDL's season rows carry no points, so the table
 * is built from the season's finished games, counted up to the game being
 * handicapped, and ranked among FBS teams. Both results are cached.
 */

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

const ordinal = (n) => {
  const v = n % 100;
  const suffix = (v >= 11 && v <= 13) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  return `${n}${suffix}`;
};

/** Lower is better for these; higher is better for the rest. */
const LOWER_IS_BETTER = new Set([
  'opp_total_points_per_game',
  'opp_total_offensive_yards_per_game',
  'opp_net_passing_yards_per_game',
  'opp_rushing_yards_per_game',
  'misc_total_giveaways'
]);

function rankAll(rows, field) {
  const scored = rows
    .map((r) => ({ id: r?.team?.id, value: Number(r?.[field]) }))
    .filter((r) => r.id != null && Number.isFinite(r.value));
  scored.sort((a, b) => (LOWER_IS_BETTER.has(field) ? a.value - b.value : b.value - a.value));
  const byTeam = new Map();
  scored.forEach((r, i) => byTeam.set(Number(r.id), { rank: i + 1, value: r.value, of: scored.length }));
  return byTeam;
}

/**
 * @returns {Promise<{byTeamId:Map, teams:number}|null>} null on any failure —
 *          context is never a reason to lose the stat it was decorating.
 */
export async function loadLeagueContext(bdlSport, season) {
  if (bdlSport !== 'americanfootball_nfl') return null; // college: loadNcaafLeagueContext (BDL's NCAAF season rows carry no points)
  const key = `${bdlSport}_${season}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const teams = await ballDontLieService.getTeams(bdlSport);
    const ids = (teams || []).map((t) => t.id).filter((id) => id != null);
    if (ids.length === 0) return null;

    // Direct call, not getTeamSeasonStats: that helper batches in PAIRS (it
    // was built for home+away) and treats teamId as a scalar, so handing it 32
    // ids produced a nested array that matched no rows and returned zero. The
    // endpoint itself takes every id at once.
    const params = new URLSearchParams({ season: String(season), per_page: '100', postseason: 'false' });
    for (const id of ids) params.append('team_ids[]', String(id));
    const response = await fetch(`https://api.balldontlie.io/nfl/v1/team_season_stats?${params}`, {
      headers: { Authorization: BDL_API_KEY },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    if (list.length < 8) return null; // not a league, not worth ranking against

    const fields = [
      'opp_total_points_per_game',
      'opp_total_offensive_yards_per_game',
      'total_points_per_game',
      'total_offensive_yards_per_game',
      'misc_turnover_differential'
    ];
    const ranks = Object.fromEntries(fields.map((f) => [f, rankAll(list, f)]));

    const byTeamId = new Map();
    for (const row of list) {
      const id = Number(row?.team?.id);
      if (!Number.isFinite(id)) continue;
      byTeamId.set(id, {
        name: row?.team?.full_name || row?.team?.name || null,
        pointsAllowed: ranks.opp_total_points_per_game.get(id) || null,
        yardsAllowed: ranks.opp_total_offensive_yards_per_game.get(id) || null,
        pointsScored: ranks.total_points_per_game.get(id) || null,
        yardsGained: ranks.total_offensive_yards_per_game.get(id) || null,
        turnoverDiff: ranks.misc_turnover_differential.get(id) || null
      });
    }

    const value = { byTeamId, teams: byTeamId.size };
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

/**
 * College's league table, from the season's finished games (founder GO, Oct 12
 * 2026). Every FBS team's points scored and allowed per game, counted up to
 * `cutoff` (the kickoff of the game being handicapped, so a replayed game never
 * reads results from after it), ranked among the FBS teams that have played.
 * An FCS opponent has no entry: its games against FBS teams are not a season.
 * Same shape as the NFL context; null on any failure.
 */
export async function loadNcaafLeagueContext({ season, cutoff = null, teams = null } = {}) {
  if (!season) return null;
  try {
    const key = `ncaaf_games_${season}`;
    const hit = cache.get(key);
    let games = hit && hit.expires > Date.now() ? hit.value : null;
    if (!games) {
      games = await ballDontLieService.getGames('americanfootball_ncaaf', { seasons: [season], per_page: 100 });
      if (!Array.isArray(games) || games.length === 0) return null;
      cache.set(key, { value: games, expires: Date.now() + CACHE_TTL_MS });
    }
    const list = teams || await ballDontLieService.getTeams('americanfootball_ncaaf');
    const fbs = (list || []).filter((t) => t?.id != null && FBS.has(Number(t.conference)));
    const before = (r) => !cutoff || new Date(r.date) < new Date(cutoff);
    const rows = fbs.map((t) => {
      const results = toTeamResults(games, t.id).filter(before);
      if (!results.length) return null;
      const mean = (field) => results.reduce((sum, r) => sum + r[field], 0) / results.length;
      return { id: Number(t.id), name: t.full_name || t.name || null, games: results.length, allowed: mean('allowed'), scored: mean('scored') };
    }).filter(Boolean);
    if (rows.length < 8) return null; // not a league, not worth ranking against

    const rank = (field, lowerIsBetter) => {
      const sorted = [...rows].sort((a, b) => (lowerIsBetter ? a[field] - b[field] : b[field] - a[field]));
      return new Map(sorted.map((r, i) => [r.id, { rank: i + 1, value: r[field], of: sorted.length }]));
    };
    const allowed = rank('allowed', true);
    const scored = rank('scored', false);
    const byTeamId = new Map(rows.map((r) => [r.id, {
      name: r.name,
      games: r.games,
      pointsAllowed: allowed.get(r.id) || null,
      pointsScored: scored.get(r.id) || null,
      yardsAllowed: null,
      yardsGained: null,
      turnoverDiff: null
    }]));
    return { byTeamId, teams: byTeamId.size };
  } catch {
    return null;
  }
}

/**
 * How good the opponent was, in one clause for the stat tools. Facts only —
 * no rank (founder, Oct 1 2026), and no claim about what it means for the
 * game being handicapped.
 */
export function opponentQualityLine(context, opponentTeamId) {
  if (!context || opponentTeamId == null) return null;
  const entry = context.byTeamId.get(Number(opponentTeamId));
  if (!entry) return null;
  const bits = [];
  if (entry.pointsAllowed) {
    bits.push(`allowed ${entry.pointsAllowed.value.toFixed(1)} ppg on the season`);
  }
  if (entry.pointsScored) {
    bits.push(`scored ${entry.pointsScored.value.toFixed(1)} ppg`);
  }
  return bits.length ? `opponent ${bits.join(', ')}` : null;
}

/**
 * The desks' form (founder GO, Oct 12 2026): "allows 17.8 pts/game (12th of
 * 134), scores 27.4 (70th)". The opponent's season figures and where they
 * stand in its league; nothing about what that means for this game.
 */
export function opponentSeasonClause(context, opponentTeamId) {
  if (!context || opponentTeamId == null) return null;
  const entry = context.byTeamId.get(Number(opponentTeamId));
  if (!entry?.pointsAllowed || !entry?.pointsScored) return null;
  const allowed = entry.pointsAllowed;
  const scored = entry.pointsScored;
  return `allows ${allowed.value.toFixed(1)} pts/game (${ordinal(allowed.rank)} of ${allowed.of}), `
    + `scores ${scored.value.toFixed(1)} (${ordinal(scored.rank)})`;
}
