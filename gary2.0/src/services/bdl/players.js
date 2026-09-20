import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY, BDL_TIMEOUT_MS } from './transport.js';
import { fetchBdlPages } from '../bdlPagination.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const playersMethods = {

  /**
   * Generic players fetch with HTTP fallback
   */
  async getPlayersGeneric(sportKey, params = {}, ttlMinutes = 10, { complete = false, throwOnError = false } = {}) {
    try {
      const cacheKey = `${sportKey}_players_${complete ? 'complete_v2_' : ''}${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (!complete && sport?.getPlayers) {
          const resp = await sport.getPlayers(params);
          return resp?.data || [];
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players',
          basketball_ncaab: 'ncaab/v1/players',
          icehockey_nhl: 'nhl/v1/players',
          americanfootball_nfl: 'nfl/v1/players',
          americanfootball_ncaaf: 'ncaaf/v1/players',
          baseball_mlb: 'mlb/v1/players'
        };
        const path = endpointMap[sportKey];
        if (!path) return [];
        if (complete) {
          return fetchBdlPages(async cursor => {
            const pageParams = { ...params, per_page: 100 };
            if (cursor != null) pageParams.cursor = cursor;
            const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(pageParams)}`;
            return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
          }, { label: `${sportKey} player identities`, maxPages: 30 });
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Return BOTH data and meta for pagination support
        return { 
          data: response.data?.data || [],
          meta: response.data?.meta
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getPlayersGeneric', e);
      console.error(`[Ball Don't Lie] ${sportKey} getPlayers error:`, e.message);
      if (throwOnError) throw e;
      return [];
    }
  },

  /**
   * Active players (per sport)
   */
  async getActivePlayersComplete(sportKey, teamId, ttlMinutes = 10) {
    const sport = { basketball_nba: 'nba', americanfootball_nfl: 'nfl', americanfootball_ncaaf: 'ncaaf', baseball_mlb: 'mlb' }[sportKey];
    if (!sport || !teamId) throw new Error('Active players require sport and exact team ID');
    return getCachedOrFetch(`${sportKey}_active_complete_${teamId}`, () => fetchBdlPages(async cursor => {
      const params = { 'team_ids[]': [teamId], per_page: 100 };
      if (cursor != null) params.cursor = cursor;
      return (await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}/${sport}/v1/players/active${buildQuery(params)}`, { headers: { Authorization: API_KEY } })).data;
    }, { label: `${sport} active players`, maxPages: 30 }), ttlMinutes);
  },

  async getPlayersActive(sportKey, params = {}, ttlMinutes = 5) {
    try {
      const cacheKey = `${sportKey}_players_active_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getActivePlayers) {
          const resp = await sport.getActivePlayers(params);
          // ⭐ FIX: Return BOTH data and meta for pagination support
          return {
            data: Array.isArray(resp?.data) ? resp.data : [],
            meta: resp?.meta
          };
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players/active',
          basketball_ncaab: 'ncaab/v1/players/active',
          americanfootball_nfl: 'nfl/v1/players/active',
          americanfootball_ncaaf: 'ncaaf/v1/players/active',
          icehockey_nhl: 'nhl/v1/players/active',
          baseball_mlb: 'mlb/v1/players/active'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getPlayersActive not supported');
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        // ⭐ FIX: Return BOTH data and meta for pagination support
        return { 
          data: Array.isArray(json?.data) ? json.data : [],
          meta: json?.meta
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getPlayersActive', e);
      console.error(`[Ball Don't Lie] ${sportKey} getPlayersActive error:`, e.message);
      return { data: [], meta: null };
    }
  },

  async getPlayerStats(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_player_stats_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getPlayerStats || sport?.getStats;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for sports with documented player_stats endpoints
        // NOTE: NHL uses /nhl/v1/player_stats/leaders for player stat leaders (goals, assists, save_pct, etc.)
        const endpointMap = {
          basketball_nba: 'nba/v1/stats', // ⭐ FIX: Use correct endpoint per BDL docs
          basketball_ncaab: 'ncaab/v1/player_stats',
          americanfootball_nfl: 'nfl/v1/stats',
          americanfootball_ncaaf: 'ncaaf/v1/player_stats',
          icehockey_nhl: 'nhl/v1/player_stats/leaders', // NHL uses leaders endpoint with type param
          baseball_mlb: 'mlb/v1/stats' // MLB per-game stats (AB, H, HR, RBI, K, BB, ERA, IP, etc.)
        };
        const path = endpointMap[sportKey];
        if (!path) {
          throw new Error('player stats not supported for this sport');
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Always return data array, not object with data/meta
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getPlayerStats', e);
      console.error(`[Ball Don't Lie] ${sportKey} getPlayerStats error:`, e.message);
      return [];
    }
  },
};
