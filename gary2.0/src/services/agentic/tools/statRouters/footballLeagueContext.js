import { ballDontLieService } from '../../../ballDontLieService.js';
import { BDL_API_KEY } from './statRouterCommon.js';

/**
 * League-wide context, so a number arrives with the field it beat.
 *
 * The founder's standard, Aug 25 2026: "if we're going to show a team's last
 * three games and the stats from those games, there's a lot of context we'd
 * still have to get — who played that game, how good was the team's defense,
 * was it home or away, what happened in that game."
 *
 * "How good was that defense" cannot be answered by a raw number. 21.4 points
 * allowed means nothing on its own; 21.4 points allowed, 11th-fewest in the
 * league, is a fact about quality. A 300-yard passing game against the worst
 * pass defense in football and one against the best are not the same evidence,
 * and until now they reached Gary looking identical.
 *
 * The whole league is one request — BDL's team_season_stats accepts every
 * team_id at once — so ranks cost no more than a single team's numbers, and
 * the result is cached.
 */

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

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
  if (bdlSport !== 'americanfootball_nfl') return null; // NCAAF season rows carry no points
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

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * How good the opponent was, in one clause. Facts and a rank — no claim about
 * what it means for the game being handicapped.
 */
export function opponentQualityLine(context, opponentTeamId) {
  if (!context || opponentTeamId == null) return null;
  const entry = context.byTeamId.get(Number(opponentTeamId));
  if (!entry) return null;
  const bits = [];
  if (entry.pointsAllowed) {
    bits.push(`allowed ${entry.pointsAllowed.value.toFixed(1)} ppg on the season (${ordinal(entry.pointsAllowed.rank)} of ${entry.pointsAllowed.of})`);
  }
  if (entry.pointsScored) {
    bits.push(`scored ${entry.pointsScored.value.toFixed(1)} ppg (${ordinal(entry.pointsScored.rank)})`);
  }
  return bits.length ? `opponent ${bits.join(', ')}` : null;
}

/** Test seam. */
export function _clearLeagueContextCache() {
  cache.clear();
}
