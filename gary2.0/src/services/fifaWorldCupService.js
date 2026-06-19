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

// Sportsbooks in priority order for a SINGLE-book quote: one primary + two
// fallbacks. We deliberately keep this list tight to the sharpest, most liquid
// US books — thin books carry more stale/garbage rungs, and we'd rather omit a
// line than trust one. selectConsensusOdds takes the first of these that's
// present; if none are, it returns null (no line) rather than reach for a
// thin book.
export const PREFERRED_VENDORS = ['draftkings', 'fanduel', 'betmgm'];

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
  // dateStr is the EST slate day. WC datetimes are UTC, so an 8:30pm ET game lands on the
  // NEXT UTC day — comparing the raw UTC slice drops late ET-evening games (Haiti@Brazil)
  // and wrongly pulls in early-UTC games that are really the prior ET night. Match on the
  // ET calendar date instead so the WC slate aligns with the rest of the app.
  const etDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  };
  return matches.filter(m => typeof m.datetime === 'string' && etDate(m.datetime) === dateStr);
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
  // Only the trusted primary+fallback books — if none quoted this match, omit
  // the line entirely rather than fall back to a thin book's ladder.
  if (!row) {
    console.warn(`[fifa] no preferred book (${vendors.join('/')}) in odds rows; omitting line`);
    return null;
  }
  const ml = {
    home: cleanOdds(row.moneyline_home_odds),
    draw: cleanOdds(row.moneyline_draw_odds),
    away: cleanOdds(row.moneyline_away_odds),
  };
  // Flat fields bypass the realistic-line band + sentinel guard that protect
  // extractMain*; only trust a flat spread that is in-band AND a clean half-goal
  // line with non-sentinel odds, else fall back to the (guarded) ladder extractor.
  // This is the other half of the "Under 10 -115" guard.
  const flatSpreadOk = row.spread_home_value != null
    && Math.abs(Number(row.spread_home_value)) <= 4.5
    && isHalfGoalLine(Number(row.spread_home_value))
    && cleanOdds(row.spread_home_odds) != null && cleanOdds(row.spread_away_odds) != null;
  const flatTotalOk = row.total_value != null
    && Number(row.total_value) >= 1.0 && Number(row.total_value) <= 5.0
    && isHalfGoalLine(Number(row.total_value))
    && cleanOdds(row.total_over_odds) != null && cleanOdds(row.total_under_odds) != null;
  return {
    vendor: row.vendor,
    moneyline: ml,
    spread: flatSpreadOk ? {
      homeValue: row.spread_home_value,
      homeOdds: cleanOdds(row.spread_home_odds),
      awayValue: row.spread_away_value ?? null,
      awayOdds: cleanOdds(row.spread_away_odds),
    } : extractMainSpread(row.markets, ml),
    total: flatTotalOk ? {
      line: row.total_value,
      over: cleanOdds(row.total_over_odds),
      under: cleanOdds(row.total_under_odds),
    } : extractMainTotal(row.markets),
  };
}

// The flat spread_*/total_* fields are null on every 2026 row (verified live)
// while the real ladders live in the nested markets[] — full-match spread
// markets carry one Asian-handicap line each (home/away outcomes), totals
// carry Over/Under pairs per goal line. The feed carries NO main/alternate
// flag, so we ELECT the main line: it is the rung priced closest to pick'em
// (both sides near -110), i.e. the smallest gap between the two sides' implied
// probabilities (juiceGap). That lands on the book's true main number
// (e.g. Total 2.5 at -110/-115) rather than a juiced ladder rung like 3.5 at
// +235/-300. NOTE: do NOT score balance as |over + under| in American odds —
// the main line (-110/-110) sums to -220 while an alt (+235/-300) sums to -65,
// so an odds-sum metric prefers the ALT. Implied probability is continuous
// across the ±100 boundary; the raw American sum/difference is not.
// A clean half-goal line (±0.5, ±1.5, ±2.5 ...): value*2 is odd — excludes whole
// (±1.0) and tenth (±1.3) alt lines, giving the American-style number every other
// sport shows.
const isHalfGoalLine = (v) => Number.isInteger(Math.abs(v) * 2) && !Number.isInteger(Math.abs(v));
// Books mark an unavailable price with a sentinel (±9999 / 100000). Treat anything
// past a realistic American-odds magnitude as missing so it can't poison the
// balanced-juice election or ship as a real number.
const ODDS_SENTINEL = 8000;
const cleanOdds = (v) => {
  const n = Number(v);
  return (v == null || !Number.isFinite(n) || Math.abs(n) >= ODDS_SENTINEL) ? null : n;
};

// American odds -> implied win probability (vig included). Used to measure how
// balanced a two-way price is: the MAIN line minimizes the gap between the two
// sides' implied probabilities (both ~0.52 at -110). Continuous across ±100,
// unlike an American odds sum/difference, so it can't be fooled by the
// discontinuity (e.g. +100 vs -120 are ~equal probability but differ by 220).
const impliedProb = (a) => { const n = Number(a); return n < 0 ? (-n) / (-n + 100) : 100 / (n + 100); };
const juiceGap = (o1, o2) => Math.abs(impliedProb(o1) - impliedProb(o2));

// Rough main Asian-handicap a favorite's moneyline implies, used to anchor the
// spread pick so a deep alt line can't masquerade as the main number. A slight
// favorite (~-140) lines around -0.5; a heavy one (~-1000) around -2.5.
function expectedAhFromMl(favAmerican) {
  const m = Math.abs(Number(favAmerican));
  if (!Number.isFinite(m) || m === 0) return null;
  if (m < 175) return 0.5;   // ~-140 slight favorite
  if (m < 350) return 1.0;   // ~-250
  if (m < 750) return 1.5;   // ~-400 to -700
  if (m < 1300) return 2.0;  // ~-800 to -1200 heavy
  return 2.5;
}

// `ml` (optional): the 3-way moneyline { home, away } for THIS match. When present we
// require the favorite (more negative ML) to be GIVING goals — i.e. a negative handicap
// on their side — so a data error or deep alt line can't ship the favorite RECEIVING
// points (e.g. a -8000 favorite "+2.5").
function extractMainSpread(markets, ml = null) {
  const lines = [];
  for (const mkt of (markets || [])) {
    if (mkt.type !== 'spread' || mkt.period !== 'match' || mkt.scope !== 'match') continue;
    const home = (mkt.outcomes || []).find(o => o.side === 'home' || o.type === 'home');
    const away = (mkt.outcomes || []).find(o => o.side === 'away' || o.type === 'away');
    const value = parseFloat(home?.handicap ?? home?.line_value);
    if (!home || !away || !Number.isFinite(value)) continue;
    const homeOdds = cleanOdds(home.american_odds);
    const awayOdds = cleanOdds(away.american_odds);
    if (homeOdds == null || awayOdds == null) continue; // can't balance-score a sentinel line
    lines.push({ homeValue: value, homeOdds, awayValue: parseFloat(away.handicap ?? away.line_value), awayOdds });
  }
  if (lines.length === 0) return null;
  // Balanced juice alone can crown a ladder EXTREME as the "main" line. Real soccer
  // Asian handicaps don't exceed ~±4.5 even for big mismatches — reject anything
  // beyond that, then balance-pick within the realistic band.
  let realistic = lines.filter(l => Math.abs(l.homeValue) <= 4.5);
  if (realistic.length === 0) return null;
  // Enforce ML-sign consistency: the favorite must lay (not receive) goals.
  if (ml && ml.home != null && ml.away != null) {
    const homeFav = Number(ml.home) < Number(ml.away);
    const consistent = realistic.filter(l => homeFav ? l.homeValue <= 0 : l.homeValue >= 0);
    if (consistent.length) realistic = consistent; // keep band if ML/lines disagree (degenerate)
  }
  // American-style half-goal lines only (-0.5, -1.5, -2.5 ...) — never a pushable whole
  // line or an alt (-1.3, -0.8). If the book lists no clean half line, omit the spread
  // (Gary leans on the 3-way ML for the side) rather than ship an odd number.
  const half = realistic.filter(l => isHalfGoalLine(l.homeValue));
  if (half.length === 0) return null;
  // ML-MAGNITUDE ANCHOR: the main handicap must track the moneyline's implied
  // supremacy. Balanced juice alone can crown a DEEP alt line that happens to carry
  // even-money odds in the feed (a -2.5 at 100/-140 for a -140 favorite, whose true
  // main line is -0.5). Keep only half lines within ~1 goal of the ML-implied
  // handicap, pick the CLOSEST (balanced juice breaks ties); if none qualify, omit
  // the spread (Gary uses the 3-way ML) rather than ship a number the price contradicts.
  if (ml && ml.home != null && ml.away != null) {
    const homeFav = Number(ml.home) < Number(ml.away);
    const expected = expectedAhFromMl(homeFav ? ml.home : ml.away);
    if (expected != null) {
      const consistent = half.filter(l => Math.abs(Math.abs(l.homeValue) - expected) <= 0.75);
      if (consistent.length === 0) return null;
      consistent.sort((a, b) => {
        const da = Math.abs(Math.abs(a.homeValue) - expected);
        const db = Math.abs(Math.abs(b.homeValue) - expected);
        return da !== db ? da - db : juiceGap(a.homeOdds, a.awayOdds) - juiceGap(b.homeOdds, b.awayOdds);
      });
      return consistent[0];
    }
  }
  half.sort((a, b) => juiceGap(a.homeOdds, a.awayOdds) - juiceGap(b.homeOdds, b.awayOdds));
  return half[0];
}

function extractMainTotal(markets) {
  const byLine = new Map(); // line -> { over, under }
  for (const mkt of (markets || [])) {
    if (mkt.type !== 'total' || mkt.period !== 'match' || mkt.scope !== 'match') continue;
    for (const o of (mkt.outcomes || [])) {
      const line = parseFloat(o.line_value);
      if (!Number.isFinite(line)) continue;
      const entry = byLine.get(line) || { line, over: null, under: null };
      if (o.type === 'over') entry.over = cleanOdds(o.american_odds);
      if (o.type === 'under') entry.under = cleanOdds(o.american_odds);
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
  // Clean half-goal O/U lines (1.5, 2.5, 3.5) only — American style, never pushable.
  // No half line in band → omit the total rather than ship a whole/alt number.
  const half = realistic.filter(e => isHalfGoalLine(e.line));
  if (half.length === 0) return null;
  // Main line = the rung priced closest to pick'em (smallest implied-prob gap).
  half.sort((a, b) => juiceGap(a.over, a.under) - juiceGap(b.over, b.under));
  return half[0];
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
 * Player prop odds for a match (/odds/player_props): anytime_goal, assists, shots,
 * shots_on_target, saves, tackles, cards, etc. NOT paginated — one call per match.
 * Returns raw rows [{ player_id, vendor, prop_type, line_value, market }].
 */
export async function getPlayerProps({ matchId, playerId, propType, vendors } = {}) {
  if (!matchId) return [];
  const key = `pprops_${matchId}_${playerId || ''}_${propType || ''}`;
  const cached = getCached(key);
  if (cached) return cached;
  const params = { match_id: matchId };
  if (playerId) params.player_id = playerId;
  if (propType) params.prop_type = propType;
  if (vendors) params.vendors = vendors;
  const data = await fifaFetch('/odds/player_props', params);
  setCache(key, data, TTL_FAST);
  return data;
}

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
