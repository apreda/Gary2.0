// The NFL Fantasy reader uses Gary's existing BDL connection. No model calls,
// league-account access, injury interpretation or database writes live here.
import { fetchBdlPages } from '../bdlPagination.js';
import { waitForBdlRequestSlot } from '../bdlRequestGate.js';

export const NFL_FANTASY_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
export const NFL_FANTASY_STAT_FIELDS = Object.freeze([
  'passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns',
  'passing_interceptions', 'rushing_attempts', 'rushing_yards', 'rushing_touchdowns',
  'receptions', 'receiving_targets', 'receiving_yards', 'receiving_touchdowns', 'fumbles_lost',
]);
const PAGE_LIMITS = Object.freeze({ schedule: 5, ownership: 20, projections: 20, scoring: 2, players: 2, stats: 8 });
const ROOT = 'https://api.balldontlie.io/nfl/v1';
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const pick = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row || {}, key)).map(key => [key, row[key]]));
const player = row => row == null ? null : pick(row, ['id', 'first_name', 'last_name', 'full_name', 'position', 'position_abbreviation', 'experience']);
const team = row => row == null ? null : pick(row, ['id', 'name', 'full_name', 'abbreviation']);

function game(row) {
  if (!object(row)) return null;
  return { ...pick(row, ['id', 'date', 'datetime', 'season', 'week', 'postseason', 'season_type', 'status', 'status_state', 'venue']),
    home_team: team(row.home_team), visitor_team: team(row.visitor_team ?? row.away_team) };
}

// Keep one compact representation at the transport boundary. The provider
// returns a complete scoring dictionary for every format of every player;
// stripping that repetition is lossless for the requested Fantasy evidence.
function projection(row) {
  if (row.projections != null && !Array.isArray(row.projections)) throw new Error('Malformed NFL Fantasy projection formats');
  if (row.stats != null && !object(row.stats)) throw new Error('Malformed NFL Fantasy projected stats');
  return { ...pick(row, ['id', 'season', 'week', 'date', 'position', 'collected_at', 'projected_games']),
    player: player(row.player), team: team(row.team), game: game(row.game),
    stats: pick(row.stats, NFL_FANTASY_STAT_FIELDS),
    projections: (row.projections || []).map(item => {
      if (!object(item)) throw new Error('Malformed NFL Fantasy projection format');
      return { key: typeof item.scoring_format === 'string' ? item.scoring_format : item.scoring_format?.key,
        total_points: item.total_points, points_per_game: item.points_per_game };
    }) };
}

function identity(row) { return { ...player(row), team: team(row.team) }; }
function ownership(row) {
  return { ...pick(row, ['id', 'season', 'week', 'date', 'position', 'collected_at', 'market_updated_at',
    'percent_rostered', 'percent_started', 'percent_rostered_change', 'average_draft_position']),
  player: player(row.player), team: team(row.team) };
}
function stats(row) {
  return { ...pick(row, ['id', 'player_id', 'team_id', 'season', 'season_type', 'postseason', ...NFL_FANTASY_STAT_FIELDS]),
    player: player(row.player), team: team(row.team), game: game(row.game) };
}

function bounded(value, fallback, max) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}
function year(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2002 || n > 2200) throw new Error('Invalid NFL Fantasy season');
  return n;
}
function ids(values) {
  if (!Array.isArray(values) || !values.length || values.length > 32
      || values.some(value => !/^\d+$/.test(String(value)) || Number(value) <= 0)) {
    throw new Error('NFL Fantasy player request requires one to 32 exact player IDs');
  }
  return [...new Set(values.map(String))];
}

/** Dependency-injected, strict and bounded endpoint reader. Importing it does
 * not load credentials. Every page goes through the existing cross-process
 * rate gate; no more than three requests from this instance can be active. */
export function createNflFantasyProvider({
  client, apiKey, waitForSlot = waitForBdlRequestSlot, signal: parentSignal,
  timeoutMs = 12_000, collectionTimeoutMs = 180_000, concurrency = 3,
  maxRequests = 80, pageLimits = {}, onRequest,
} = {}) {
  if (typeof client !== 'function' || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('NFL Fantasy requires the existing Ball Don\'t Lie connection');
  }
  const limit = bounded(concurrency, 3, 3);
  const requestLimit = bounded(maxRequests, 80, 80);
  const deadline = AbortSignal.timeout(bounded(collectionTimeoutMs, 180_000, 180_000));
  const pending = [];
  let active = 0;
  const tally = { requests_attempted: 0, requests_succeeded: 0, response_bytes: 0, normalized_bytes: 0, pages_by_source: {} };

  function acquire(signal) {
    signal.throwIfAborted();
    if (active < limit) { active++; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, signal, abort: null };
      item.abort = () => {
        const index = pending.indexOf(item);
        if (index >= 0) pending.splice(index, 1);
        reject(signal.reason);
      };
      pending.push(item);
      signal.addEventListener('abort', item.abort, { once: true });
    });
  }
  function release() {
    const next = pending.shift();
    if (next) { next.signal.removeEventListener('abort', next.abort); next.resolve(); }
    else active--;
  }

  async function read(source, path, params, transform, signal) {
    const combined = AbortSignal.any([deadline, parentSignal, signal].filter(Boolean));
    return fetchBdlPages(async cursor => {
      combined.throwIfAborted();
      await acquire(combined);
      try {
        combined.throwIfAborted();
        if (tally.requests_attempted >= requestLimit) throw new Error('NFL Fantasy provider request budget exhausted');
        await waitForSlot(`fantasy_nfl_${source}`, { signal: combined });
        combined.throwIfAborted();
        // Reserve only after the gate has opened, then increment synchronously
        // so simultaneous page readers cannot overrun the shared budget.
        if (tally.requests_attempted >= requestLimit) throw new Error('NFL Fantasy provider request budget exhausted');
        tally.requests_attempted++;
        const response = await client({ method: 'GET', url: `${ROOT}/${path}`,
          headers: { Authorization: apiKey }, timeout: bounded(timeoutMs, 12_000, 12_000), signal: combined,
          params: { ...params, per_page: 100, ...(cursor != null ? { cursor } : {}) } });
        if (response?.status != null && (response.status < 200 || response.status >= 300)) {
          throw new Error(`NFL Fantasy ${source} request failed (HTTP ${response.status})`);
        }
        const payload = response?.data;
        if (!object(payload) || !Array.isArray(payload.data)
            || payload.data.some(row => !object(row))) throw new Error(`Malformed NFL Fantasy ${source} page`);
        const data = payload.data.map(transform);
        tally.requests_succeeded++;
        tally.pages_by_source[source] = (tally.pages_by_source[source] || 0) + 1;
        tally.response_bytes += Buffer.byteLength(JSON.stringify(payload));
        tally.normalized_bytes += Buffer.byteLength(JSON.stringify(data));
        onRequest?.({ source, rows: data.length, status: response.status ?? 200 });
        return { data, ...(Object.hasOwn(payload, 'meta') ? { meta: payload.meta } : {}) };
      } catch (error) {
        if (combined.aborted) throw combined.reason;
        // Axios error objects contain request headers. Never propagate them or
        // raw response bodies into a log, model prompt or publication artifact.
        const status = Number(error?.response?.status);
        if (Number.isInteger(status)) throw new Error(`NFL Fantasy ${source} request failed (HTTP ${status})`);
        if (error?.message?.startsWith('NFL Fantasy') || error?.message?.startsWith('Malformed NFL Fantasy')) throw error;
        throw new Error(`NFL Fantasy ${source} request failed`);
      } finally { release(); }
    }, { label: `NFL Fantasy ${source}`, maxPages: bounded(pageLimits[source], PAGE_LIMITS[source], PAGE_LIMITS[source]) });
  }

  return {
    async schedule({ season, signal } = {}) {
      return read('schedule', 'games', { 'seasons[]': [year(season)], 'season_types[]': [2] }, game, signal);
    },
    async ownership({ season, signal } = {}) {
      return read('ownership', 'fantasy/adp', { season: year(season), 'positions[]': [...NFL_FANTASY_POSITIONS] }, ownership, signal);
    },
    async projections({ season, week, signal } = {}) {
      if (!Number.isInteger(week) || week < 1 || week > 18) throw new Error('Invalid NFL Fantasy week');
      return read('projections', 'fantasy/projections', { season: year(season), week,
        'positions[]': [...NFL_FANTASY_POSITIONS], scoring_format: 'ppr' }, projection, signal);
    },
    async scoringFormats({ season, signal } = {}) {
      return read('scoring', 'fantasy/scoring_formats', { season: year(season) }, row => pick(row, ['id', 'season', 'key', 'name', 'derived', 'rules']), signal);
    },
    async players({ playerIds, signal } = {}) {
      return read('players', 'players/active', { 'player_ids[]': ids(playerIds) }, identity, signal);
    },
    async playerStats({ season, playerIds, signal } = {}) {
      return read('stats', 'stats', { 'seasons[]': [year(season)], 'season_types[]': [2], 'player_ids[]': ids(playerIds) }, stats, signal);
    },
    diagnostics() { return { ...tally, pages_by_source: { ...tally.pages_by_source } }; },
  };
}
