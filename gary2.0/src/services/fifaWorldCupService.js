/**
 * FIFA World Cup Service — 2026 (with 2018/2022 historical editions).
 *
 * BALLDONTLIE FIFA World Cup API: https://api.balldontlie.io/fifa/worldcup/v1
 * GOAT tier. Auth via existing BALLDONTLIE_API_KEY (Authorization header).
 * Seasons: 2018, 2022, 2026 (default 2026). Cursor-paginated list endpoints.
 *
 * Standalone by design — does NOT touch ballDontLieService.js shared core.
 * Reuses bdlCore only for API-key resolution + the array-aware query builder.
 */
import { API_KEY, BALLDONTLIE_API_BASE_URL, buildQuery } from './ballDontLie/bdlCore.js';

const FIFA_BASE = `${BALLDONTLIE_API_BASE_URL}/fifa/worldcup/v1`;
export const DEFAULT_SEASON = 2026;

// Sportsbooks in priority order for single-book consensus odds.
export const PREFERRED_VENDORS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'betrivers', 'fanatics'];

// TTLs by volatility.
const TTL_STATIC = 24 * 60 * 60 * 1000; // teams, stadiums
const TTL_SLOW = 30 * 60 * 1000;        // standings, rosters, form, futures
const TTL_FAST = 60 * 1000;             // matches, odds, lineups, live stats

const cache = new Map();
function getCached(key) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < e.ttl) return e.data;
  return null;
}
function setCache(key, data, ttl) {
  cache.set(key, { data, ts: Date.now(), ttl });
}
export function clearFifaCache() {
  cache.clear();
}

function n(v) {
  return typeof v === 'number' ? v : 0;
}

/**
 * Low-level FIFA API call. Adds the Authorization header, builds an array-aware
 * query string (seasons[]=, team_ids[]=), and—when paginate is true—follows
 * meta.next_cursor accumulating each page's data[]. Returns data[] (or the
 * accumulated array when paginating).
 */
async function fifaFetch(path, params = {}, { paginate = false } = {}) {
  let cursor = params.cursor;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const qs = buildQuery({ ...params, cursor });
    const url = `${FIFA_BASE}${path}${qs}`;
    const res = await fetch(url, { headers: { Authorization: API_KEY } });
    if (!res.ok) throw new Error(`FIFA API ${res.status}: ${path}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!paginate) return rows;
    all.push(...rows);
    const next = json?.meta?.next_cursor;
    if (next == null || next === cursor || rows.length === 0) break;
    cursor = next;
  }
  return all;
}

export async function getTeams(seasons = [DEFAULT_SEASON]) {
  const key = `teams_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/teams', { seasons });
  setCache(key, data, TTL_STATIC);
  return data;
}

export async function getMatches({ seasons = [DEFAULT_SEASON], teamIds, matchIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (teamIds) params.team_ids = teamIds;
  if (matchIds) params.match_ids = matchIds;
  const key = `matches_${JSON.stringify(params)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/matches', params, { paginate: true });
  setCache(key, data, TTL_FAST);
  return data;
}

/**
 * 90-minute regulation score = first half + second half (EXCLUDES extra time).
 * home_score/away_score include ET in knockouts, so never use them directly for
 * 90' settlement. Falls back to home_score/away_score only when half data is
 * absent AND no extra time was played (safe for not-yet-started/partial rows).
 */
export function getRegulationScore(match) {
  if (!match) return { home: null, away: null };
  const halvesMissing =
    match.first_half_home_score == null && match.second_half_home_score == null &&
    match.first_half_away_score == null && match.second_half_away_score == null;
  if (halvesMissing) {
    if (!match.has_extra_time && match.home_score != null) {
      return { home: n(match.home_score), away: n(match.away_score) };
    }
    return { home: null, away: null };
  }
  return {
    home: n(match.first_half_home_score) + n(match.second_half_home_score),
    away: n(match.first_half_away_score) + n(match.second_half_away_score),
  };
}

/**
 * Determine the advancing team of a COMPLETED knockout match.
 * Order: 90' regulation → full-time incl. extra time (home_score/away_score) →
 * penalty shootout. Returns { teamId, method } or null if incomplete / still level.
 */
export function getAdvanceResult(match) {
  if (!match || match.status !== 'completed') return null;
  const homeId = match.home_team?.id ?? null;
  const awayId = match.away_team?.id ?? null;
  if (homeId == null || awayId == null) return null;

  const reg = getRegulationScore(match);
  if (reg.home != null && reg.home !== reg.away) {
    return { teamId: reg.home > reg.away ? homeId : awayId, method: 'regulation' };
  }
  const fh = n(match.home_score), fa = n(match.away_score); // incl. ET
  if (fh !== fa) {
    return { teamId: fh > fa ? homeId : awayId, method: 'extra_time' };
  }
  if (match.has_penalty_shootout) {
    const ph = n(match.home_score_penalties), pa = n(match.away_score_penalties);
    if (ph !== pa) return { teamId: ph > pa ? homeId : awayId, method: 'penalties' };
  }
  return null;
}

/**
 * Match a country name / abbreviation / ISO code to a team object.
 * Exact name/abbr/code first, then partial-name contains. Null on no match.
 */
export function resolveTeam(nameOrCode, teams) {
  if (!nameOrCode || !Array.isArray(teams)) return null;
  const q = String(nameOrCode).toLowerCase().trim();
  if (!q) return null;
  return teams.find(t =>
    (t.name || '').toLowerCase() === q ||
    (t.abbreviation || '').toLowerCase() === q ||
    (t.country_code || '').toLowerCase() === q
  ) || teams.find(t => (t.name || '').toLowerCase().includes(q)) || null;
}

/** Keep matches whose UTC calendar date equals dateStr (YYYY-MM-DD). */
export function filterMatchesByDate(matches, dateStr) {
  if (!Array.isArray(matches)) return [];
  return matches.filter(m => typeof m.datetime === 'string' && m.datetime.slice(0, 10) === dateStr);
}

/**
 * Reduce a match's odds rows (one per vendor) to a single consensus quote,
 * preferring the highest-priority available sportsbook. Spread/total are only
 * surfaced when the book actually offers them (null otherwise).
 */
export function selectConsensusOdds(oddsRows, vendors = PREFERRED_VENDORS) {
  if (!Array.isArray(oddsRows) || oddsRows.length === 0) return null;
  let row = null;
  for (const v of vendors) {
    row = oddsRows.find(o => o.vendor === v);
    if (row) break;
  }
  if (!row) row = oddsRows[0];
  return {
    vendor: row.vendor,
    moneyline: {
      home: row.moneyline_home_odds ?? null,
      draw: row.moneyline_draw_odds ?? null,
      away: row.moneyline_away_odds ?? null,
    },
    spread: row.spread_home_value != null ? {
      homeValue: row.spread_home_value,
      homeOdds: row.spread_home_odds ?? null,
      awayValue: row.spread_away_value ?? null,
      awayOdds: row.spread_away_odds ?? null,
    } : null,
    total: row.total_value != null ? {
      line: row.total_value,
      over: row.total_over_odds ?? null,
      under: row.total_under_odds ?? null,
    } : null,
  };
}

export async function getStadiums(seasons = [DEFAULT_SEASON]) {
  const key = `stadiums_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/stadiums', { seasons });
  setCache(key, data, TTL_STATIC);
  return data;
}

export async function getGroupStandings(seasons = [DEFAULT_SEASON]) {
  const key = `standings_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/group_standings', { seasons });
  setCache(key, data, TTL_SLOW);
  return data;
}

export async function getOdds({ seasons = [DEFAULT_SEASON], matchIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (matchIds) params.match_ids = matchIds;
  const key = `odds_${JSON.stringify(params)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/odds', params, { paginate: true });
  setCache(key, data, TTL_FAST);
  return data;
}

export async function getFutures(seasons = [DEFAULT_SEASON]) {
  const key = `futures_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/odds/futures', { seasons }, { paginate: true });
  setCache(key, data, TTL_SLOW);
  return data;
}

export async function getRosters({ seasons = [DEFAULT_SEASON], teamIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (teamIds) params.team_ids = teamIds;
  return fifaFetch('/rosters', params, { paginate: true });
}

export async function getPlayers({ search, seasons, teamIds } = {}) {
  const params = { per_page: 100 };
  if (search) params.search = search;
  if (seasons) params.seasons = seasons;
  if (teamIds) params.team_ids = teamIds;
  return fifaFetch('/players', params, { paginate: true });
}

export async function getMatchesForDate(dateStr, seasons = [DEFAULT_SEASON]) {
  const matches = await getMatches({ seasons });
  return filterMatchesByDate(matches, dateStr);
}

// Match-scoped stat endpoints share one helper.
async function matchScoped(path, matchIds, ttl = TTL_FAST) {
  const ids = Array.isArray(matchIds) ? matchIds : [matchIds];
  const key = `${path}_${ids.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch(path, { match_ids: ids, per_page: 100 }, { paginate: true });
  setCache(key, data, ttl);
  return data;
}

export const getMatchLineups = (matchIds) => matchScoped('/match_lineups', matchIds);
export const getMatchEvents = (matchIds) => matchScoped('/match_events', matchIds);
export const getTeamMatchStats = (matchIds) => matchScoped('/team_match_stats', matchIds);
export const getPlayerMatchStats = (matchIds) => matchScoped('/player_match_stats', matchIds);
export const getMatchShots = (matchIds) => matchScoped('/match_shots', matchIds);
export const getMatchTeamForm = (matchIds) => matchScoped('/match_team_form', matchIds);
export const getMatchBestPlayers = (matchIds) => matchScoped('/match_best_players', matchIds);

/**
 * Normalize a FIFA match (+ optional consensus odds) into the pipeline's game
 * shape (id/home_team/away_team/home_team_data/commence_time/status/venue),
 * with soccer-specific fields embedded for the storage layer (Plan B).
 */
export function formatMatchForPipeline(match, consensus = null) {
  const teamData = (t) => (t ? { id: t.id, full_name: t.name, abbreviation: t.abbreviation } : null);
  return {
    id: match.id,
    soccer_match_id: match.id,
    home_team: match.home_team?.name ?? null,
    away_team: match.away_team?.name ?? null,
    home_team_data: teamData(match.home_team),
    away_team_data: teamData(match.away_team),
    commence_time: match.datetime,
    start_time: match.datetime,
    status: match.status,
    venue: match.stadium?.name ?? null,
    soccer_competition: 'FIFA World Cup 2026',
    soccer_stage: match.stage?.name ?? null,
    soccer_round: match.round_name ?? null,
    soccer_group: match.group?.name ?? null,
    soccer_three_way_ml: consensus?.moneyline ?? null,
    description: `FIFA World Cup — ${match.stage?.name ?? ''}${match.group ? ` (${match.group.name})` : ''}`.trim(),
    _raw: match,
  };
}

export default {
  DEFAULT_SEASON,
  PREFERRED_VENDORS,
  clearFifaCache,
  getTeams,
  getStadiums,
  getGroupStandings,
  getMatches,
  getMatchesForDate,
  getOdds,
  getFutures,
  getRosters,
  getPlayers,
  getMatchLineups,
  getMatchEvents,
  getTeamMatchStats,
  getPlayerMatchStats,
  getMatchShots,
  getMatchTeamForm,
  getMatchBestPlayers,
  getRegulationScore,
  getAdvanceResult,
  resolveTeam,
  filterMatchesByDate,
  selectConsensusOdds,
  formatMatchForPipeline,
};
