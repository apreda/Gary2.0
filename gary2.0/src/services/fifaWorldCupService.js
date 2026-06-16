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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A momentary network blip — undici's "TypeError: fetch failed" (DNS / connection
// reset, no HTTP response) — must NOT drop a whole sport for the day. Retry the
// transport a few times with backoff. HTTP error STATUSES are not retried here;
// they surface to the caller via res.ok. Root cause of the 2026-06-16 WC miss: a
// single 7:31am "fetch failed" on /matches killed World Cup for the entire day,
// because buildPlanResilient only retries when EVERY sport is empty (MLB had games).
async function fifaFetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { headers: { Authorization: API_KEY } });
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(500 * (i + 1)); // 0.5s, then 1s
    }
  }
  throw lastErr;
}

async function fifaFetch(path, params = {}, { paginate = false } = {}) {
  let cursor = params.cursor;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const qs = buildQuery({ ...params, cursor });
    const url = `${FIFA_BASE}${path}${qs}`;
    const res = await fifaFetchWithRetry(url);
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
 * 90-minute regulation score (EXCLUDES extra time).
 * No-ET matches: home_score/away_score IS the 90' result — use it directly.
 * ET matches: full-time includes ET, so 90' can only be derived from COMPLETE
 * half data; partial half data returns null rather than a corrupted score.
 * (The 2018 edition populates first_half_* but leaves second_half_* null on
 * every row — the previous halves-sum coerced null→0 and returned the
 * HALFTIME score for the whole tournament; verified live: the 2018 final
 * France 4-2 Croatia read as 2-1.)
 */
export function getRegulationScore(match) {
  if (!match) return { home: null, away: null };
  const halvesComplete =
    match.first_half_home_score != null && match.second_half_home_score != null &&
    match.first_half_away_score != null && match.second_half_away_score != null;
  const halvesSum = () => ({
    home: n(match.first_half_home_score) + n(match.second_half_home_score),
    away: n(match.first_half_away_score) + n(match.second_half_away_score),
  });

  if (!match.has_extra_time) {
    if (match.home_score != null && match.away_score != null) {
      return { home: n(match.home_score), away: n(match.away_score) };
    }
    return halvesComplete ? halvesSum() : { home: null, away: null };
  }

  // Extra time played — only a complete set of half fields can yield the 90' score.
  return halvesComplete ? halvesSum() : { home: null, away: null };
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
    } : extractMainSpread(row.markets),
    total: row.total_value != null ? {
      line: row.total_value,
      over: row.total_over_odds ?? null,
      under: row.total_under_odds ?? null,
    } : extractMainTotal(row.markets),
  };
}

// The flat spread_*/total_* fields are null on every 2026 row (verified live)
// while the real ladders live in the nested markets[] — full-match spread
// markets carry one Asian-handicap line each (home/away outcomes), totals
// carry Over/Under pairs per goal line. "Main" line = most balanced juice
// (smallest |homeOdds + awayOdds| in American terms), which lands on the
// book's true main number (e.g. Total 2.5) rather than a ladder extreme.
function extractMainSpread(markets) {
  const lines = [];
  for (const mkt of (markets || [])) {
    if (mkt.type !== 'spread' || mkt.period !== 'match' || mkt.scope !== 'match') continue;
    const home = (mkt.outcomes || []).find(o => o.side === 'home' || o.type === 'home');
    const away = (mkt.outcomes || []).find(o => o.side === 'away' || o.type === 'away');
    const value = parseFloat(home?.handicap ?? home?.line_value);
    if (!home || !away || !Number.isFinite(value)) continue;
    lines.push({
      homeValue: value,
      homeOdds: home.american_odds ?? null,
      awayValue: parseFloat(away.handicap ?? away.line_value),
      awayOdds: away.american_odds ?? null,
    });
  }
  if (lines.length === 0) return null;
  // Balanced juice alone can crown a ladder EXTREME as the "main" line. Real soccer
  // Asian handicaps don't exceed ~±4.5 even for big mismatches — reject anything
  // beyond that, then balance-pick within the realistic band.
  const realistic = lines.filter(l => Math.abs(l.homeValue) <= 4.5);
  if (realistic.length === 0) return null;
  realistic.sort((a, b) =>
    Math.abs((a.homeOdds ?? 0) + (a.awayOdds ?? 0)) - Math.abs((b.homeOdds ?? 0) + (b.awayOdds ?? 0)));
  return realistic[0];
}

function extractMainTotal(markets) {
  const byLine = new Map(); // line -> { over, under }
  for (const mkt of (markets || [])) {
    if (mkt.type !== 'total' || mkt.period !== 'match' || mkt.scope !== 'match') continue;
    for (const o of (mkt.outcomes || [])) {
      const line = parseFloat(o.line_value);
      if (!Number.isFinite(line)) continue;
      const entry = byLine.get(line) || { line, over: null, under: null };
      if (o.type === 'over') entry.over = o.american_odds ?? null;
      if (o.type === 'under') entry.under = o.american_odds ?? null;
      byLine.set(line, entry);
    }
  }
  const pairs = [...byLine.values()].filter(e => e.over != null && e.under != null);
  if (pairs.length === 0) return null;
  // Balanced juice alone once crowned a "10 goals" alt line as the main total and
  // shipped "Under 10 -115". Restrict the election to a realistic main match-goals
  // band (~1.0-5.0) FIRST, then balance-pick within it. If the book only offers
  // extreme lines, return null so the scout report omits the total rather than
  // feeding Gary an absurd number.
  const realistic = pairs.filter(e => e.line >= 1.0 && e.line <= 5.0);
  if (realistic.length === 0) return null;
  realistic.sort((a, b) => Math.abs(a.over + a.under) - Math.abs(b.over + b.under));
  return realistic[0];
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
    soccer_spread: consensus?.spread ?? null,
    soccer_total: consensus?.total ?? null,
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
