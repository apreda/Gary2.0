import { BalldontlieAPI } from '@balldontlie/sdk';
import axios from 'axios';

// Set cache TTL (5 minutes for playoff data)
const TTL_MINUTES = 5;
const cacheMap = new Map();

// Base URL for Ball Don't Lie HTTP fallbacks
const BALLDONTLIE_API_BASE_URL = 'https://api.balldontlie.io';

// Get API key from environment (support both browser and serverless)
let API_KEY = '';
try {
  const serverKey =
    (typeof process !== 'undefined' && process?.env?.BALLDONTLIE_API_KEY) ||
    (typeof process !== 'undefined' && process?.env?.VITE_BALLDONTLIE_API_KEY) ||
    (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BALLDONTLIE_API_KEY);
  const clientKey =
    (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BALLDONTLIE_API_KEY) || undefined;
  API_KEY = serverKey || clientKey || '';
} catch {
  API_KEY = '';
}

/**
 * Initialize the Ball Don't Lie API client
 */
function initApi() {
  try {
    const client = new BalldontlieAPI({ apiKey: API_KEY });
    return client;
  } catch (e) {
    console.error('Error initializing Ball Don\'t Lie API client:', e);
    return null;
  }
}

/**
 * Get cached data or fetch new data
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if cache miss
 * @param {number} ttlMinutes - Cache TTL in minutes
 * @returns {Promise<any>} - Cached or fresh data
 */
async function getCachedOrFetch(key, fetchFn, ttlMinutes = TTL_MINUTES) {
  const now = Date.now();
  
  // Check if data is in cache and not expired
  if (cacheMap.has(key)) {
    const { data, expiry } = cacheMap.get(key);
    if (now < expiry) {
      console.log(`[Ball Don't Lie] Using cached data for ${key}`);
      return data;
    }
  }
  
  // Cache miss or expired
  console.log(`[Ball Don't Lie] Fetching fresh data for ${key}`);
  const data = await fetchFn();
  
  // Store in cache with expiry
  const expiry = now + (ttlMinutes * 60 * 1000);
  cacheMap.set(key, { data, expiry });
  
  return data;
}

/**
 * Build query string from params, supporting array syntax key[]=v
 */
function buildQuery(params = {}) {
  const parts = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      // Ensure array keys use literal [] exactly once and keep brackets unencoded
      const hasBrackets = /\[\]$/.test(key);
      const keyWithBrackets = hasBrackets ? key : `${key}[]`;
      // Encode the key but restore brackets to literal form
      const encodedKey = encodeURIComponent(keyWithBrackets)
        .replace(/%5B/g, '[')
        .replace(/%5D/g, ']');
      value.forEach(v => {
        if (v == null) return;
        parts.push(`${encodedKey}=${encodeURIComponent(String(v))}`);
      });
    } else if (typeof value === 'object') {
      // Basic JSON encode for nested objects
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Normalize team/school names for fuzzy matching (handles "Univ.", punctuation, spacing)
 */
function normalizeName(value) {
  if (!value) return '';
  let s = String(value).toLowerCase();
  s = s.replace(/\buniv\.?\b/g, 'university');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Service for Ball Don't Lie API interactions
 */
const ballDontLieService = {
  /**
   * Get sport-specific client from the SDK
   */
  _getSportClient(sportKey) {
    const client = initApi();
    if (!client) return null;
    const map = {
      basketball_nba: 'nba',
      basketball_wnba: 'wnba',
      icehockey_nhl: 'nhl',
      americanfootball_nfl: 'nfl',
      americanfootball_ncaaf: 'ncaaf',
      basketball_ncaab: 'ncaab'
    };
    const prop = map[sportKey] || sportKey;
    return client[prop] || null;
  },

  /**
   * Odds endpoint helper
   * - NBA: primary at /v2/odds (V2 docs), fallback to /nba/v1/odds
   * - Other sports: use /{sport}/v1/odds
   * Accepts dates[] or game_ids[] (arrays)
   * Handles pagination automatically to ensure all odds rows are retrieved.
   */
  async getOddsV2(params = {}, sport = 'nba', ttlMinutes = 1) {
    try {
      // Normalize sport key (e.g. 'basketball_nba' -> 'nba')
      let sportKey = 'nba';
      const s = String(sport).toLowerCase();
      if (s.includes('nfl')) sportKey = 'nfl';
      else if (s.includes('mlb')) sportKey = 'mlb';
      else if (s.includes('nhl')) sportKey = 'nhl';
      else if (s.includes('ncaaf')) sportKey = 'ncaaf';
      else if (s.includes('ncaab')) sportKey = 'ncaab';
      else if (s.includes('wnba')) sportKey = 'wnba';
      else if (s.includes('epl')) sportKey = 'epl';
      else if (s.includes('nba')) sportKey = 'nba';

      const norm = {};
      // Use plain keys 'dates' / 'game_ids'. 
      // Our buildQuery will append [] automatically for arrays.
      if (Array.isArray(params.dates) && params.dates.length) norm.dates = params.dates;
      if (Array.isArray(params.game_ids) && params.game_ids.length) norm.game_ids = params.game_ids;
      if (params.per_page) norm.per_page = params.per_page;
      if (params.cursor) norm.cursor = params.cursor;

      const cacheKey = `odds_${sportKey}_${JSON.stringify(norm)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Helper to fetch ALL pages if pagination is present
        const fetchAllPages = async (baseUrl, baseParams) => {
          let allRows = [];
          let nextCursor = baseParams.cursor || undefined;
          let pageCount = 0;
          const maxPages = 10; // Safety limit

          do {
            const currentParams = { ...baseParams };
            if (nextCursor) currentParams.cursor = nextCursor;
            // Ensure we ask for max per page to minimize requests
            if (!currentParams.per_page) currentParams.per_page = 100;

            const qs = buildQuery(currentParams); 
            const fullUrl = `${baseUrl}${qs}`;
            
            try {
              console.log(`[Ball Don't Lie] GET ${fullUrl} (Page ${pageCount + 1})`);
              const resp = await axios.get(fullUrl, {
                headers: { Authorization: API_KEY }
              });
              
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              allRows = allRows.concat(rows);
              
              // Check for next cursor
              nextCursor = resp?.data?.meta?.next_cursor;
              pageCount++;
            } catch (err) {
              console.warn(`[Ball Don't Lie] Error fetching page ${pageCount + 1}: ${err.message}`);
              if (pageCount === 0) throw err; // Throw if first page fails
              break; // Stop on error for subsequent pages
            }
          } while (nextCursor && pageCount < maxPages);

          return allRows;
        };

        if (sportKey === 'nba') {
          try {
            const v2Url = `${BALLDONTLIE_API_BASE_URL}/v2/odds`;
            const data = await fetchAllPages(v2Url, norm);
            if (data && data.length) return data;
            console.log(`[Ball Don't Lie] NBA v2/odds returned 0 rows for`, norm);
          } catch (v2err) {
            const status = v2err?.response?.status || '';
            const data = v2err?.response?.data ? JSON.stringify(v2err.response.data).slice(0, 400) : '';
            console.warn(`[Ball Don't Lie] NBA v2/odds failed: ${status} ${data}`);
          }
          // Do NOT fallback to V1; per latest docs NBA odds are V2-only
          return [];
        } else {
          // Non-NBA sports: use V1 sport-scoped endpoint
          const v1Url = `${BALLDONTLIE_API_BASE_URL}/${sportKey}/v1/odds`;
          // Reuse fetchAllPages for consistency
          try {
             return await fetchAllPages(v1Url, norm);
          } catch (err) {
             console.warn(`[Ball Don't Lie] ${sportKey} v1/odds failed: ${err.message}`);
             return [];
          }
        }
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getOdds error (${sport}):`, e?.response?.status || e?.message);
      return [];
    }
  },

  /**
   * NFL player per-game stats for specific game_ids
   */
  async getNflPlayerGameStats({ playerId, gameIds } = {}, ttlMinutes = 5) {
    try {
      if (!playerId || !Array.isArray(gameIds) || gameIds.length === 0) return [];
      const key = `nfl_player_game_stats_${playerId}_${gameIds.slice(0, 10).join(',')}`;
      return await getCachedOrFetch(key, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery({ player_ids: [playerId], game_ids: gameIds.slice(0, 50), per_page: 100 })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflPlayerGameStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Passing Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/passing
   */
  async getNflAdvancedPassingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_passing_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Prefer SDK per dev docs
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/passing`;
        const baseParams = { season, week: 0, ...(postseason ? { postseason } : {}) };
        // Helper: SDK paginated fetch
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedPassingStats) throw new Error('SDK getAdvancedPassingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedPassingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Helper: fetch with pagination (season-wide)
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedPassingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            // fall through to HTTP
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, postseason, per_page: 100, week: omitWeek ? undefined : 0, cursor };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
              if (!cursor) break;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced passing 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            loops += 1;
          }
          return all;
        };
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        // First: try SDK with targeted params (player_id + week)
        try {
          let data = [];
          try {
            data = await sdkFetch({ ...baseParams, ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ ...baseParams, per_page: 100, ...(pid ? { player_id: pid } : {}) });
          }
          // If still empty and pid set, grab season-all then filter
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if (!seasonAll || seasonAll.length === 0) seasonAll = await fetchSeasonAll(false);
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          // Fallback: HTTP season-all (no player_id), then filter locally
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedPassingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedPassingStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Rushing Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/rushing
   */
  async getNflAdvancedRushingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_rushing_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/rushing`;
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedRushingStats) throw new Error('SDK getAdvancedRushingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedRushingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Direct HTTP fetch helper (handles pagination via cursor)
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedRushingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing SDK 400 (season-wide)', sdkErr?.response?.data || '');
              return [];
            }
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, per_page: 100, week: omitWeek ? undefined : 0, ...(postseason ? { postseason } : {}) };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced rushing 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        try {
          let data = [];
          try {
            data = await sdkFetch({ season, week: 0, ...(postseason ? { postseason } : {}) , ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}), per_page: 100 });
          }
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if ((!seasonAll || seasonAll.length === 0)) {
                seasonAll = await fetchSeasonAll(false);
              }
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedRushingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedRushingStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Receiving Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/receiving
   */
  async getNflAdvancedReceivingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_receiving_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/receiving`;
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedReceivingStats) throw new Error('SDK getAdvancedReceivingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedReceivingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Direct HTTP fetch helper (handles pagination via cursor)
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedReceivingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving SDK 400 (season-wide)', sdkErr?.response?.data || '');
              return [];
            }
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, per_page: 100, week: omitWeek ? undefined : 0, ...(postseason ? { postseason } : {}) };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced receiving 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        try {
          let data = [];
          try {
            data = await sdkFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}), per_page: 100 });
          }
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if ((!seasonAll || seasonAll.length === 0)) {
                seasonAll = await fetchSeasonAll(false);
              }
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats error:', e.message);
      return [];
    }
  },

  /**
   * Generic players fetch with HTTP fallback
   */
  async getPlayersGeneric(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_players_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getPlayers) {
          const resp = await sport.getPlayers(params);
          return resp?.data || [];
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players',
          basketball_wnba: 'wnba/v1/players',
          basketball_ncaab: 'ncaab/v1/players',
          icehockey_nhl: 'nhl/v1/players',
          americanfootball_nfl: 'nfl/v1/players',
          americanfootball_ncaaf: 'ncaaf/v1/players'
        };
        const path = endpointMap[sportKey];
        if (!path) return [];
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayers error:`, e.message);
      return [];
    }
  },

  /**
   * NBA Season Averages by category/type (players)
   * Example path: /nba/v1/season_averages/{category}?type=base|advanced|...
   */
  async getNbaSeasonAverages({ category = 'general', type = 'base', season, season_type = 'regular', player_ids } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const cacheKey = `nba_season_averages_${category}_${type}_${season}_${season_type}_${Array.isArray(player_ids) ? player_ids.join('-') : 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const path = `nba/v1/season_averages/${encodeURIComponent(category)}`;
        const params = { season, season_type, type, per_page: 100 };
        if (Array.isArray(player_ids) && player_ids.length) {
          params['player_ids[]'] = player_ids.slice(0, 100);
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaSeasonAverages error:', e.message);
      return [];
    }
  },

  /**
   * NFL player season stats (offense focus)
   */
  async getNflPlayerSeasonStats({ playerId, season, postseason = false } = {}, ttlMinutes = 10) {
    try {
      if (!playerId || !season) return [];
      const cacheKey = `nfl_player_season_stats_${playerId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats${buildQuery({ player_ids: [playerId], season, postseason })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * NCAAB player season stats (single season; filterable by player or team)
   */
  async getNcaabPlayerSeasonStats({ playerIds, playerId, teamIds, teamId, season } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      const cacheKey = `ncaab_player_season_stats_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const query = { season, per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) query['player_ids[]'] = pidArr.slice(0, 100);
        if (Array.isArray(tidArr) && tidArr.length) query['team_ids[]'] = tidArr.slice(0, 100);
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/player_season_stats${buildQuery(query)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaab getNcaabPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF player season stats (single season, optional player filter)
   */
  async getNcaafPlayerSeasonStats({ playerId, season } = {}, ttlMinutes = 10) {
    try {
      if (!playerId || !season) return [];
      const cacheKey = `ncaaf_player_season_stats_${playerId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_season_stats${buildQuery({ player_ids: [playerId], season, per_page: 100 })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * Generic helpers (multi-sport)
   */
  async getTeams(sportKey, params = {}) {
    try {
      const cacheKey = `${sportKey}_teams_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        // Prefer SDK if available
        if (sport?.getTeams) {
          const resp = await sport.getTeams(params);
          return resp?.data || [];
        }
        // Fallback to direct HTTP for sports where SDK lacks getTeams
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          basketball_wnba: 'wnba/v1/teams',
          soccer_epl: 'epl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getTeams not supported');
        const url = `https://api.balldontlie.io/${path}`;
        const resp = await fetch(url, {
          headers: { Authorization: API_KEY }
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, 60);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeams error:`, e.message);
      return [];
    }
  },

  async getTeamByNameGeneric(sportKey, nameOrId) {
    try {
      if (nameOrId == null || nameOrId === '') return null;
      const nameStr = String(nameOrId).toLowerCase();
      const idNum = !isNaN(Number(nameStr)) ? Number(nameStr) : null;
      let teams = await this.getTeams(sportKey);
      // HTTP fallback if SDK path empty
      if (!Array.isArray(teams) || teams.length === 0) {
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          basketball_wnba: 'wnba/v1/teams',
          basketball_nba: 'nba/v1/teams',
          soccer_epl: 'epl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (path) {
          const url = `https://api.balldontlie.io/${path}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (resp.ok) {
            const json = await resp.json().catch(() => ({}));
            teams = Array.isArray(json?.data) ? json.data : [];
          }
        }
      }
      if (!Array.isArray(teams) || teams.length === 0) return null;
      if (idNum !== null) {
        const byId = teams.find(t => t.id === idNum);
        if (byId) return byId;
      }
      // Enhanced matching across common fields + normalization
      const target = normalizeName(nameOrId);
      const exact = teams.find(t => {
        const fields = [
          t.name,
          t.full_name,
          t.abbreviation,
          t.city,
          t.college
        ].filter(Boolean).map(normalizeName);
        return fields.includes(target);
      });
      if (exact) return exact;
      const partial = teams.find(t => {
        const fields = [
          t.name,
          t.full_name,
          t.abbreviation,
          t.city,
          t.college
        ].filter(Boolean).map(normalizeName);
        return fields.some(f => f.includes(target) || target.includes(f));
      });
      return partial || null;
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamByName error:`, e.message);
      return null;
    }
  },

  async getGames(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_games_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getGames) {
          const resp = await sport.getGames(params);
          return resp?.data || [];
        }
        // HTTP fallback for sports without SDK getGames
        const endpointMap = {
          icehockey_nhl: 'nhl/v1/games',
          americanfootball_nfl: 'nfl/v1/games',
          americanfootball_ncaaf: 'ncaaf/v1/games',
          basketball_ncaab: 'ncaab/v1/games',
          basketball_wnba: 'wnba/v1/games',
          basketball_nba: 'nba/v1/games',
          soccer_epl: 'epl/v1/games',
          baseball_mlb: 'mlb/v1/games'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getGames not supported');
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getGames error:`, e.message);
      return [];
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
        const endpointMap = {
          basketball_nba: 'nba/v1/player_stats',
          basketball_wnba: 'wnba/v1/player_stats',
          basketball_ncaab: 'ncaab/v1/player_stats',
          americanfootball_nfl: 'nfl/v1/player_stats',
          americanfootball_ncaaf: 'ncaaf/v1/player_stats',
          icehockey_nhl: 'nhl/v1/player_stats'
        };
        const path = endpointMap[sportKey];
        if (!path) {
          throw new Error('player stats not supported');
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayerStats error:`, e.message);
      return [];
    }
  },

  async getTeamStats(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_team_stats_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getTeamStats || sport?.getStats;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for college sports where SDK may not expose team stats
        const endpointMap = {
          americanfootball_nfl: 'nfl/v1/team_stats',
          americanfootball_ncaaf: 'ncaaf/v1/team_stats',
          basketball_ncaab: 'ncaab/v1/team_stats'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('team stats not supported');
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, {
          headers: { Authorization: API_KEY }
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamStats error:`, e.message);
      return [];
    }
  },

  async getStandingsGeneric(sportKey, params = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_standings_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getStandings) {
          const resp = await sport.getStandings(params);
          return resp?.data || [];
        }
        // HTTP fallback
        const endpointMap = {
          basketball_nba: 'nba/v1/standings',
          basketball_ncaab: 'ncaab/v1/standings',
          icehockey_nhl: 'nhl/v1/standings',
          americanfootball_nfl: 'nfl/v1/standings',
          americanfootball_ncaaf: 'ncaaf/v1/standings',
          basketball_wnba: 'wnba/v1/standings',
          soccer_epl: 'epl/v1/standings',
          baseball_mlb: 'mlb/v1/standings'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getStandings not supported');
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getStandings error:`, e.message);
      return [];
    }
  },

  /**
   * Team season stats by sport (HTTP fallbacks where needed)
   * NBA: use standings/leaders as proxy (no direct season stats endpoint documented)
   * NHL: /nhl/v1/teams/:id/season_stats
   * NFL: /nfl/v1/team_season_stats
   * NCAAB: /ncaab/v1/team_season_stats
   * NCAAF: not documented as team season stats; use team_stats and standings as proxy
   */
  async getTeamSeasonStats(sportKey, { teamId, season, postseason = false } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_team_season_stats_${teamId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        if (!teamId || !season) return [];
        // NHL team season stats
        if (sportKey === 'icehockey_nhl') {
          const url = `https://api.balldontlie.io/nhl/v1/teams/${encodeURIComponent(teamId)}/season_stats${buildQuery({ season, postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // EPL team season stats
        if (sportKey === 'soccer_epl') {
          const url = `https://api.balldontlie.io/epl/v1/teams/${encodeURIComponent(teamId)}/season_stats${buildQuery({ season })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // NFL team season stats
        if (sportKey === 'americanfootball_nfl') {
          const url = `https://api.balldontlie.io/nfl/v1/team_season_stats${buildQuery({ season, team_ids: [teamId], postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // NCAAB team season stats
        if (sportKey === 'basketball_ncaab') {
          const url = `https://api.balldontlie.io/ncaab/v1/team_season_stats${buildQuery({ season, team_ids: [teamId] })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // WNBA: use team_stats (game stats) aggregated by season via team_ids + seasons
        if (sportKey === 'basketball_wnba') {
          const url = `https://api.balldontlie.io/wnba/v1/team_stats${buildQuery({ seasons: [season], team_ids: [teamId], per_page: 100 })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        // NBA/NCAAF: fall back to standings/leaders or dedicated season stats
        // NBA: no direct team season stats; caller should use getStandingsGeneric + leaders
        // NCAAF: use dedicated team_season_stats per dev docs
        if (sportKey === 'americanfootball_ncaaf') {
          const url = `https://api.balldontlie.io/ncaaf/v1/team_season_stats${buildQuery({ season, team_ids: [teamId], per_page: 100 })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          return Array.isArray(json?.data) ? json.data : [];
        }
        return [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamSeasonStats error:`, e.message);
      return [];
    }
  },

  /**
   * Leaders endpoints (NBA/NHL/NCAAB) via HTTP fallback
   */
  async getLeadersGeneric(sportKey, { season, type, postseason = false } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_leaders_${season}_${type}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const endpointMap = {
          basketball_nba: 'nba/v1/leaders', // if available; otherwise use player_stats/leaders
          basketball_ncaab: 'ncaab/v1/player_stats/leaders',
          icehockey_nhl: 'nhl/v1/player_stats/leaders',
          icehockey_nhl_team: 'nhl/v1/team_stats/leaders'
        };
        let path = endpointMap[sportKey] || null;
        // Allow special alias for NHL team leaders
        if (!path && sportKey === 'icehockey_nhl_team') path = endpointMap.icehockey_nhl_team;
        if (!path) return [];
        const url = `https://api.balldontlie.io/${path}${buildQuery({ season, type, postseason })}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getLeaders error:`, e.message);
      return [];
    }
  },

  /**
   * Compute simple derived metrics
   */
  deriveBasketballFourFactors(teamSeasonRow) {
    // Expecting season aggregates; many leagues expose percentages directly
    const safeNum = (v) => (typeof v === 'number' && !isNaN(v) ? v : 0);
    return {
      effectiveFgPct: safeNum(teamSeasonRow?.fg_pct), // proxy
      turnoverRate: safeNum(teamSeasonRow?.turnovers_per_game) || 0,
      offensiveRebRate: safeNum(teamSeasonRow?.oreb_per_game) || 0,
      freeThrowRate: safeNum(teamSeasonRow?.ftm) && safeNum(teamSeasonRow?.fga) ? teamSeasonRow.ftm / teamSeasonRow.fga : 0
    };
  },

  deriveNhlTeamRates(teamSeasonPairs) {
    // teamSeasonPairs is array of {name,value}; build map
    if (!Array.isArray(teamSeasonPairs)) return {};
    const map = {};
    teamSeasonPairs.forEach(r => {
      if (r && r.name) map[r.name] = r.value;
    });
    return {
      ppPct: map.power_play_percentage,
      pkPct: map.penalty_kill_percentage,
      shotsForPerGame: map.shots_for_per_game,
      shotsAgainstPerGame: map.shots_against_per_game,
      faceoffWinPct: map.faceoff_win_percentage,
      goalsForPerGame: map.goals_for_per_game,
      goalsAgainstPerGame: map.goals_against_per_game
    };
  },

  deriveNflTeamRates(teamSeason) {
    // teamSeason is array of season records fields; build map
    if (!Array.isArray(teamSeason) || teamSeason.length === 0) return {};
    const first = teamSeason[0];
    const map = {};
    // Flatten name/value pairs or direct fields
    if (first.name && typeof first.value !== 'undefined') {
      teamSeason.forEach(r => { map[r.name] = r.value; });
    } else {
      Object.assign(map, first);
    }
    // Derived
    // Yards per play with robust fallbacks
    const yppDirect = map.yards_per_play ?? map.offensive_yards_per_play ?? undefined;
    const yppNum = (num) => (typeof num === 'number' && isFinite(num)) ? num : undefined;
    let yardsPerPlay = yppNum(yppDirect);
    if (yardsPerPlay == null) {
      const totalY = map.net_total_offensive_yards ?? map.total_offensive_yards ?? map.total_yards;
      const plays = map.total_offensive_plays ?? map.offensive_plays ?? map.total_plays;
      yardsPerPlay = (typeof totalY === 'number' && typeof plays === 'number' && plays > 0) ? (totalY / plays) : undefined;
    }
    // Opponent yards per play
    const oppYppDirect = map.opp_yards_per_play ?? map.defensive_yards_per_play ?? undefined;
    let oppYardsPerPlay = yppNum(oppYppDirect);
    if (oppYardsPerPlay == null) {
      const oTotalY = map.opp_net_total_offensive_yards ?? map.opp_total_offensive_yards ?? map.opp_total_yards;
      const oPlays = map.opp_total_offensive_plays ?? map.opp_offensive_plays ?? map.opp_total_plays;
      oppYardsPerPlay = (typeof oTotalY === 'number' && typeof oPlays === 'number' && oPlays > 0) ? (oTotalY / oPlays) : undefined;
    }
    // Red-zone proxies if exposed by API
    // Red zone proxies (favor scoring percentage if provided)
    let redZoneOffProxy = undefined;
    if (typeof map.red_zone_scoring_percentage === 'number') redZoneOffProxy = map.red_zone_scoring_percentage;
    else if (typeof map.red_zone_scores !== 'undefined') redZoneOffProxy = (map.red_zone_scores / (map.red_zone_attempts || 1));
    let redZoneDefProxy = undefined;
    if (typeof map.opp_red_zone_scoring_percentage === 'number') redZoneDefProxy = map.opp_red_zone_scoring_percentage;
    else if (typeof map.opp_red_zone_scores !== 'undefined') redZoneDefProxy = (map.opp_red_zone_scores / (map.opp_red_zone_attempts || 1));
    // Very rough pass-proxy: sacks allowed per dropback ~ sacksAllowed / (passAttempts + sacksAllowed)
    const sacksAllowed = map.misc_sacks_allowed ?? map.sacks_allowed ?? map.offensive_sacks_allowed ?? undefined;
    const passAtt = map.passing_attempts ?? map.pass_attempts ?? map.offensive_pass_attempts ?? undefined;
    const sacksAllowedPerDropback = (typeof sacksAllowed === 'number' && typeof passAtt === 'number' && (passAtt + sacksAllowed) > 0)
      ? sacksAllowed / (passAtt + sacksAllowed)
      : undefined;
    // Very rough defensive pressure proxy: team sacks per opp dropback ~ sacks / (opp pass att + sacks)
    const defSacks = map.sacks ?? map.defensive_sacks ?? map.team_sacks ?? undefined;
    const oppPassAtt = map.opp_passing_attempts ?? map.opp_pass_attempts ?? map.defensive_opponent_pass_attempts ?? undefined;
    const defSackRateProxy = (typeof defSacks === 'number' && typeof oppPassAtt === 'number' && (oppPassAtt + defSacks) > 0)
      ? defSacks / (oppPassAtt + defSacks)
      : undefined;
    return {
      pointsPerGame: map.total_points_per_game,
      oppPointsPerGame: map.opp_total_points_per_game,
      yardsPerPlay,
      oppYardsPerPlay,
      thirdDownPct: map.misc_third_down_conv_pct ?? map.third_down_conversion_percentage ?? map.third_down_pct,
      fourthDownPct: map.misc_fourth_down_conv_pct ?? map.fourth_down_conversion_percentage ?? map.fourth_down_pct,
      redZoneProxy: redZoneOffProxy,
      redZoneDefProxy,
      turnoverDiff: map.misc_turnover_differential,
      sacksAllowedPerDropback,
      defSackRateProxy
    };
  },

  async getInjuriesGeneric(sportKey, params = {}, ttlMinutes = 5) {
    try {
      const cacheKey = `${sportKey}_injuries_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getPlayerInjuries || sport?.getInjuries;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for sports with documented injuries endpoints
        const endpointMap = {
          basketball_nba: 'nba/v1/player_injuries',
          basketball_wnba: 'wnba/v1/player_injuries',
          americanfootball_nfl: 'nfl/v1/player_injuries',
          icehockey_nhl: 'nhl/v1/player_injuries'
        };
        const path = endpointMap[sportKey];
        if (!path) {
          // Not supported: return empty without throwing
          return [];
        }
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getInjuries error:`, e.message);
      return [];
    }
  },
  /**
   * Clear all cached data (useful for debugging or forcing fresh data)
   */
  clearCache() {
    console.log('🗑️ Clearing all Ball Don\'t Lie API cache');
    cacheMap.clear();
  },

  /**
   * Initialize the service
   */
  initialize() {
    console.log('Initializing Ball Don\'t Lie API Service');
    
    if (API_KEY) {
      console.log('API key is set');
      // Mask the API key in logs
      const maskedKey = API_KEY.substring(0, 3) + '...';
      console.log(`🔑 Ball Don't Lie API Key (masked): ${maskedKey}`);
    } else {
      console.warn('❌ No API key found for Ball Don\'t Lie API');
    }
    
    // Verify that client can be initialized
    const client = initApi();
    if (client) {
      console.log('✅ Ball Don\'t Lie API client initialized successfully');
      // Check that NBA endpoint exists
      if (client.nba) {
        console.log('✅ API client NBA endpoint verified');
      } else {
        console.warn('❌ API client NBA endpoint not found');
      }
    }
  },
  
  /**
   * Get team by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getTeamByName(nameOrId) {
    try {
      // Validate input - prevent toString() errors
      if (nameOrId == null || nameOrId === '') {
        console.warn('getTeamByName: Invalid input provided (null/undefined/empty)');
        return null;
      }
      
      // Convert input to string for consistency
      const nameOrIdStr = String(nameOrId).toLowerCase();
      const idNum = typeof nameOrId === 'number' ? nameOrId : (!isNaN(Number(nameOrIdStr)) ? Number(nameOrIdStr) : null);
      
      // Use different cache keys based on input type
      const cacheKey = idNum !== null ? `team_by_id_${idNum}` : `team_by_name_${nameOrIdStr}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        // Always get full teams list - the API doesn't have a getTeamById method
        const client = initApi();
        const response = await client.nba.getTeams();
        const teams = response.data || [];
        
        // If we have a numeric ID, search by ID first
        if (idNum !== null) {
          const teamById = teams.find(team => team.id === idNum);
          if (teamById) return teamById;
        }
        
        // If no numeric ID or team not found by ID, try string matching
        if (typeof nameOrId === 'string' || !idNum) {
          // Try to find by exact name or abbreviation
          const team = teams.find(
            team => 
              team.name.toLowerCase() === nameOrIdStr || 
              team.full_name.toLowerCase() === nameOrIdStr ||
              team.abbreviation.toLowerCase() === nameOrIdStr
          );
          
          if (team) return team;
          
          // Try to find by partial name match
          const partialMatch = teams.find(
            team => 
              team.name.toLowerCase().includes(nameOrIdStr) || 
              team.full_name.toLowerCase().includes(nameOrIdStr) ||
              team.abbreviation.toLowerCase().includes(nameOrIdStr)
          );
          
          if (partialMatch) return partialMatch;
        }
        
        // If no match found, return null
        return null;
      });
    } catch (error) {
      console.error(`Error getting team by name/id ${nameOrId}:`, error);
      return null;
    }
  },
  
  /**
   * Get all NBA teams
   * @returns {Promise<Array>} - Array of NBA team objects
   */
  async getNbaTeams() {
    try {
      const cacheKey = 'nba_teams';
      return await getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NBA teams from BallDontLie API');
        const client = initApi();
        const response = await client.nba.getTeams();
        return response.data || [];
      }, 60); // Cache for 60 minutes since teams don't change often
    } catch (error) {
      console.error('Error fetching NBA teams:', error);
      return [];
    }
  },

  /**
   * Get NBA playoff stats for current season
   * @param {number} season - Season year (defaults to current year)
   * @param {boolean} todayOnly - If true, only return today's games
   * @returns {Promise<Array>} - Array of playoff games with stats
   */
  async getNbaPlayoffGames(season = new Date().getFullYear(), todayOnly = false) {
    // NBA seasons span two years (e.g., 2024-25 season)
    // For 2025 playoffs, we need season=2024
    // If we're in early months (Jan-June), we're in the second half of the season
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentYear = new Date().getFullYear();
    
    // CRITICAL FIX: For May 2025, we want 2024 season (2024-25 NBA season)
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`🏀 [SEASON DEBUG] Current date: ${new Date().toISOString()}, Month: ${currentMonth}, Year: ${currentYear}, Using season: ${actualSeason}`);
    
    try {
      const cacheKey = todayOnly ? `nba_playoff_games_today_${actualSeason}` : `nba_playoff_games_${actualSeason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA playoff games for ${actualSeason} season (${actualSeason}-${actualSeason + 1}) from Ball Don't Lie API${todayOnly ? ' - TODAY ONLY' : ''}`);
        
        const client = initApi();
        let apiParams = { 
          postseason: true, // Get playoff games only
          seasons: [actualSeason], // This was missing - now we get only 2024 season playoffs for 2025
          per_page: 100 // Max allowed
        };
        
        // If we only want today's games, add date filter
        if (todayOnly) {
          const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
          apiParams.dates = [today];
          console.log(`🏀 Filtering for today's games only: ${today}`);
        }
        
        console.log(`🏀 API Request params:`, apiParams);
        
        // CRITICAL FIX: Pass the seasons parameter to get only the specific season's playoffs
        const response = await client.nba.getGames(apiParams);
        
        console.log(`🏀 API Response: Found ${response.data?.length || 0} games in response`);
        
        const games = response.data || [];
        console.log(`🏀 Found ${games.length} playoff games for ${actualSeason} season${todayOnly ? ' (today only)' : ''}`);
        
        // Log sample games for verification
        if (games.length > 0) {
          console.log(`🏀 Sample playoff games:`);
          games.slice(0, 3).forEach(game => {
            console.log(`   - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          });
        } else if (todayOnly) {
          console.log(`🏀 No playoff games found for today (${new Date().toISOString().split('T')[0]})`);
        }
        
        return games;
      });
    } catch (error) {
      console.error('Error fetching NBA playoff games:', error);
      return [];
    }
  },

  /**
   * Get today's NBA playoff games only
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of today's playoff games
   */
  async getTodaysNbaPlayoffGames(season = new Date().getFullYear()) {
    return this.getNbaPlayoffGames(season, true);
  },

  /**
   * Get NBA season averages for playoff teams (2025 playoffs = 2024 season)
   * @param {number} season - Season year (defaults to current year)
   * @param {Array} teamIds - Array of team IDs to get averages for
   * @returns {Promise<Object>} - Season averages by team
   */
  async getNbaSeasonAveragesSDKLegacy(season = new Date().getFullYear(), teamIds = []) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      const cacheKey = `nba_season_averages_sdk_legacy_${actualSeason}_${teamIds.join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 [LEGACY SDK] Fetching NBA season averages for ${actualSeason} season`);
        const client = initApi();
        
        // Get general base stats for the season
        const response = await client.nba.getSeasonAverages('general', {
          season: actualSeason,
          season_type: 'playoffs', // Focus on playoff averages
          type: 'base'
        });
        
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA season averages:', error);
      return [];
    }
  },

  /**
   * Get NBA player injuries for current playoff teams
   * @param {Array} teamIds - Array of team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNbaPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nba_player_injuries_${teamIds.join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA player injuries for teams: ${teamIds.join(', ')}`);
        const client = initApi();
        
        const response = await client.nba.getPlayerInjuries({
          team_ids: teamIds,
          per_page: 100
        });
        
        const injuries = response.data || [];
        console.log(`🏀 Found ${injuries.length} player injuries`);
        
        return injuries;
      }, 15); // Cache for 15 minutes since injury status changes frequently
    } catch (error) {
      console.error('Error fetching NBA player injuries:', error);
      return [];
    }
  },

  /**
   * Get advanced stats for playoff games
   * @param {Array} gameIds - Array of game IDs to get advanced stats for
   * @returns {Promise<Array>} - Array of advanced stats
   */
  async getNbaAdvancedStats(gameIds = []) {
    try {
      const cacheKey = `nba_advanced_stats_${gameIds.join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA advanced stats for ${gameIds.length} games`);
        const client = initApi();
        
        const response = await client.nba.getAdvancedStats({
          game_ids: gameIds,
          per_page: 100
        });
        
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA advanced stats:', error);
      return [];
    }
  },

  /**
   * Get live box scores for current NBA games
   * @returns {Promise<Array>} - Array of live box scores
   */
  async getNbaLiveBoxScores() {
    try {
      console.log(`🏀 Fetching NBA live box scores`);
      const client = initApi();
      
      // Live data shouldn't be cached
      const response = await client.nba.getLiveBoxScores();
      
      const boxScores = response.data || [];
      console.log(`🏀 Found ${boxScores.length} live games`);
      
      return boxScores;
    } catch (error) {
      console.error('Error fetching NBA live box scores:', error);
      return [];
    }
  },

  /**
   * Get NBA team standings for current season
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team standings
   */
  async getNbaStandings(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      const cacheKey = `nba_standings_${actualSeason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA standings for ${actualSeason} season`);
        const client = initApi();
        
        const response = await client.nba.getStandings({
          season: actualSeason
        });
        
        return response.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error('Error fetching NBA standings:', error);
      return [];
    }
  },

  /**
   * Get active NBA playoff teams (teams still in the playoffs)
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team objects still in the playoffs
   */
  async getActivePlayoffTeams(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`🏀 [SEASON DEBUG] Input season: ${season}, Current month: ${currentMonth}, Calculated actualSeason: ${actualSeason}`);
    
    try {
      const cacheKey = `active_playoff_teams_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        // Get all recent playoff games (last 7 days)
        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        
        const startDate = lastWeek.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        console.log(`🏀 Finding active playoff teams for ${actualSeason} season since ${startDate}`);
        const client = initApi();
        
        // Get recent playoff games with correct season
        const response = await client.nba.getGames({ 
          postseason: true, // Get playoff games only
          seasons: [actualSeason], // Add season filter
          start_date: startDate,
          per_page: 100
        });
        
        const recentGames = response.data || [];
        console.log(`🏀 Found ${recentGames.length} recent playoff games since ${startDate}`);
        
        // If no recent games, fall back to all playoff games
        if (recentGames.length === 0) {
          console.log(`🏀 No recent playoff games found, falling back to all playoff games for ${actualSeason} season`);
          const allPlayoffGames = await this.getNbaPlayoffGames(actualSeason);
          console.log(`🏀 Fallback found ${allPlayoffGames.length} total playoff games for ${actualSeason} season`);
          // Group by series and find series with incomplete records (not finished)
          const seriesMap = new Map();
          
          allPlayoffGames.forEach(game => {
            const homeId = game.home_team.id;
            const awayId = game.visitor_team.id;
            const matchupKey = homeId < awayId ? `${homeId}-${awayId}` : `${awayId}-${homeId}`;
            
            if (!seriesMap.has(matchupKey)) {
              seriesMap.set(matchupKey, {
                games: [],
                teams: [game.home_team, game.visitor_team]
              });
            }
            
            seriesMap.get(matchupKey).games.push(game);
          });
          
          // Find active series (less than 7 games or last game was recent)
          const activeSeries = [...seriesMap.values()].filter(series => {
            // If series has less than 7 games, it might still be active
            if (series.games.length < 7) return true;
            
            // Check if the last game was within the last 3 days
            const sortedGames = [...series.games].sort((a, b) => 
              new Date(b.date) - new Date(a.date)
            );
            
            const lastGameDate = new Date(sortedGames[0].date);
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            
            return lastGameDate > threeDaysAgo;
          });
          
          // Extract unique teams from active series
          const activeTeams = new Set();
          activeSeries.forEach(series => {
            series.teams.forEach(team => {
              activeTeams.add(team);
            });
          });
          
          return [...activeTeams];
        }
        
        // Extract unique teams from recent games
        const activeTeams = new Map();
        recentGames.forEach(game => {
          if (!activeTeams.has(game.home_team.id)) {
            activeTeams.set(game.home_team.id, game.home_team);
          }
          if (!activeTeams.has(game.visitor_team.id)) {
            activeTeams.set(game.visitor_team.id, game.visitor_team);
          }
        });
        
        return [...activeTeams.values()];
      });
    } catch (error) {
      console.error('Error getting active playoff teams:', error);
      return [];
    }
  },

  /**
   * Get NBA playoff series data for a specific matchup
   * @param {number} season - Season year (defaults to current year)
   * @param {number|string} teamA - First team ID or team name/abbreviation
   * @param {number|string} teamB - Second team ID or team name/abbreviation
   * @returns {Promise<Object>} - Series data including games and series status
   */
  async getNbaPlayoffSeries(season = new Date().getFullYear(), teamA, teamB) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      const cacheKey = `nba_playoff_series_${actualSeason}_${teamA}_${teamB}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Get all playoff games for the season
        const playoffGames = await this.getNbaPlayoffGames(actualSeason);
        
        // Get team data for both teams
        const teamAData = await this.getTeamByName(teamA);
        const teamBData = await this.getTeamByName(teamB);
        
        if (!teamAData || !teamBData) {
          return {
            seriesFound: false,
            message: 'One or both teams not found'
          };
        }
        
        // Find games between these two teams
        const seriesGames = playoffGames.filter(game => 
          (game.home_team.id === teamAData.id && game.visitor_team.id === teamBData.id) ||
          (game.home_team.id === teamBData.id && game.visitor_team.id === teamAData.id)
        );
        
        if (seriesGames.length === 0) {
          return {
            seriesFound: false,
            message: 'No playoff games found between these teams'
          };
        }
        
        // Count wins for each team
        let teamAWins = 0;
        let teamBWins = 0;
        
        seriesGames.forEach(game => {
          if (game.status !== 'Final') return; // Only count completed games
          
          const teamAIsHome = game.home_team.id === teamAData.id;
          const homeTeamWon = game.home_team_score > game.visitor_team_score;
          
          if ((teamAIsHome && homeTeamWon) || (!teamAIsHome && !homeTeamWon)) {
            teamAWins++;
          } else {
            teamBWins++;
          }
        });
        
        // Determine series status
        let seriesStatus = '';
        if (teamAWins >= 4) {
          seriesStatus = `${teamAData.name} won the series 4-${teamBWins}`;
        } else if (teamBWins >= 4) {
          seriesStatus = `${teamBData.name} won the series 4-${teamAWins}`;
        } else {
          seriesStatus = `${teamAData.name} ${teamAWins} - ${teamBWins} ${teamBData.name}`;
        }
        
        // Sort games by date
        const sortedGames = [...seriesGames].sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );
        
        return {
          seriesFound: true,
          teamA: teamAData,
          teamB: teamBData,
          teamAWins,
          teamBWins,
          seriesStatus,
          games: sortedGames
        };
      });
    } catch (error) {
      console.error('Error getting NBA playoff series:', error);
      return { seriesFound: false, message: error.message };
    }
  },
  
  /**
   * Get detailed stats for players in a specific playoff game
   * @param {number} gameId - Game ID
   * @returns {Promise<Array>} - Array of player stats for the game
   */
  async getNbaPlayoffGameStats(gameId) {
    try {
      const cacheKey = `nba_playoff_game_stats_${gameId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NBA playoff game stats for game ID ${gameId}`);
        const client = initApi();
        const response = await client.nba.getStats({
          game_ids: [gameId],
          postseason: true, // CRITICAL: Ensure we get playoff stats only
          per_page: 50 // Get all players from the game
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA playoff game stats:', error);
      return [];
    }
  },

  /**
   * Get detailed playoff stats for key players on both teams (May 2025 = NBA Playoffs Active)
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Object>} - Object with home and away team playoff player stats
   */
  async getNbaPlayoffPlayerStats(homeTeam, awayTeam, season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      console.log(`🏀 [Ball Don't Lie] Getting playoff player stats for ${awayTeam} @ ${homeTeam} (${actualSeason} season)`);
      
      // Get team data
      const homeTeamData = await this.getTeamByName(homeTeam);
      const awayTeamData = await this.getTeamByName(awayTeam);
      
      if (!homeTeamData || !awayTeamData) {
        console.log(`🏀 [Ball Don't Lie] Could not find team data for ${homeTeam} or ${awayTeam}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏀 [Ball Don't Lie] Found teams: ${homeTeamData.full_name} (ID: ${homeTeamData.id}) vs ${awayTeamData.full_name} (ID: ${awayTeamData.id})`);
      
      // CRITICAL FIX: It's May 2025, so we're in NBA playoffs - get current playoff games
      console.log(`🏀 [Ball Don't Lie] Getting current playoff games for ${actualSeason} season (May 2025 - playoffs are active)`);
      
      const client = initApi();
      const response = await client.nba.getGames({
        seasons: [actualSeason],
        postseason: true, // CRITICAL: Get playoff games only
        per_page: 100
      });
      
      const playoffGames = response.data || [];
      console.log(`🏀 [Ball Don't Lie] Found ${playoffGames.length} total playoff games for ${actualSeason} season`);
      
      // Filter games for each team
      const homeTeamGames = playoffGames.filter(game => 
        game.home_team.id === homeTeamData.id || game.visitor_team.id === homeTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      const awayTeamGames = playoffGames.filter(game => 
        game.home_team.id === awayTeamData.id || game.visitor_team.id === awayTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      console.log(`[Ball Don't Lie] ${homeTeam} (ID: ${homeTeamData.id}): Found ${homeTeamGames.length} playoff games`);
      console.log(`[Ball Don't Lie] ${awayTeam} (ID: ${awayTeamData.id}): Found ${awayTeamGames.length} playoff games`);
      
      // Debug: Log sample games for each team
      if (homeTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${homeTeam} games:`);
        homeTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      if (awayTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${awayTeam} games:`);
        awayTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      // If no games found for a team, try alternative team name matching
      let finalHomeTeamGames = homeTeamGames;
      let finalAwayTeamGames = awayTeamGames;
      
      if (homeTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${homeTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalHomeTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = homeTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Indiana Pacers" -> "pacers", "indiana")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalHomeTeamGames.length} games for ${homeTeam}`);
      }
      
      if (awayTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${awayTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalAwayTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = awayTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Indiana Pacers" -> "pacers", "indiana")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalAwayTeamGames.length} games for ${awayTeam}`);
      }
      
      // Get player stats from playoff games
      const getTeamPlayerStats = async (games, teamId) => {
        const playerStatsMap = new Map();
        
        for (const game of games) {
          try {
            console.log(`[Ball Don't Lie] Getting stats for game ${game.id}: ${game.visitor_team.name} @ ${game.home_team.name}`);
            const gameStats = await this.getNbaPlayoffGameStats(game.id);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${gameStats.length} total player stats`);
            
            const teamStats = gameStats.filter(stat => stat.team.id === teamId);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${teamStats.length} stats for team ${teamId}`);
            
            teamStats.forEach(stat => {
              const playerId = stat.player.id;
              if (!playerStatsMap.has(playerId)) {
                playerStatsMap.set(playerId, {
                  player: stat.player,
                  games: 0,
                  // Basic Stats
                  totalPts: 0,
                  totalReb: 0,
                  totalAst: 0,
                  totalStl: 0,
                  totalBlk: 0,
                  totalMin: 0,
                  totalFgm: 0,
                  totalFga: 0,
                  total3pm: 0,
                  total3pa: 0,
                  totalFtm: 0,
                  totalFta: 0,
                  totalTurnover: 0,
                  // Advanced Stats
                  totalPlusMinus: 0,
                  totalOreb: 0,
                  totalDreb: 0,
                  totalPf: 0,
                  // For calculating advanced metrics
                  totalTeamPts: 0,
                  totalOppPts: 0,
                  totalTeamPoss: 0,
                  totalOppPoss: 0
                });
              }
              
              const playerData = playerStatsMap.get(playerId);
              playerData.games += 1;
              
              // Basic Stats
              playerData.totalPts += stat.pts || 0;
              playerData.totalReb += stat.reb || 0;
              playerData.totalAst += stat.ast || 0;
              playerData.totalStl += stat.stl || 0;
              playerData.totalBlk += stat.blk || 0;
              playerData.totalMin += stat.min ? parseInt(stat.min.split(':')[0]) : 0;
              playerData.totalFgm += stat.fgm || 0;
              playerData.totalFga += stat.fga || 0;
              playerData.total3pm += stat.fg3m || 0;
              playerData.total3pa += stat.fg3a || 0;
              playerData.totalFtm += stat.ftm || 0;
              playerData.totalFta += stat.fta || 0;
              playerData.totalTurnover += stat.turnover || 0;
              
              // Advanced Stats (if available)
              playerData.totalPlusMinus += stat.plus_minus || 0;
              playerData.totalOreb += stat.oreb || 0;
              playerData.totalDreb += stat.dreb || 0;
              playerData.totalPf += stat.pf || 0;
            });
          } catch (error) {
            console.error(`[Ball Don't Lie] Error getting stats for game ${game.id}:`, error.message);
          }
        }
        
        // Calculate averages and advanced metrics
        const allPlayers = Array.from(playerStatsMap.values());
        console.log(`[Ball Don't Lie] Team ${teamId}: Found ${allPlayers.length} players before filtering`);
        
        // Log player game counts for debugging
        allPlayers.forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} games`);
        });
        
        // Use more lenient filtering - require at least 1 game instead of 2
        const filteredPlayers = allPlayers.filter(player => player.games >= 1);
        console.log(`[Ball Don't Lie] Team ${teamId}: ${filteredPlayers.length} players after filtering (>=1 game)`);
        
        return filteredPlayers
          .map(player => {
            const games = player.games;
            
            // Basic averages
            const avgPts = (player.totalPts / games).toFixed(1);
            const avgReb = (player.totalReb / games).toFixed(1);
            const avgAst = (player.totalAst / games).toFixed(1);
            const avgStl = (player.totalStl / games).toFixed(1);
            const avgBlk = (player.totalBlk / games).toFixed(1);
            const avgMin = (player.totalMin / games).toFixed(1);
            const avgTurnover = (player.totalTurnover / games).toFixed(1);
            const avgPlusMinus = (player.totalPlusMinus / games).toFixed(1);
            
            // Shooting percentages
            const fgPct = player.totalFga > 0 ? ((player.totalFgm / player.totalFga) * 100).toFixed(1) : '0.0';
            const fg3Pct = player.total3pa > 0 ? ((player.total3pm / player.total3pa) * 100).toFixed(1) : '0.0';
            const ftPct = player.totalFta > 0 ? ((player.totalFtm / player.totalFta) * 100).toFixed(1) : '0.0';
            
            // True Shooting Percentage: TS% = PTS / (2 * (FGA + 0.44 * FTA))
            const trueShooting = player.totalFga > 0 || player.totalFta > 0 ? 
              ((player.totalPts / (2 * (player.totalFga + 0.44 * player.totalFta))) * 100).toFixed(1) : '0.0';
            
            // Effective Field Goal Percentage: eFG% = (FGM + 0.5 * 3PM) / FGA
            const effectiveFgPct = player.totalFga > 0 ? 
              (((player.totalFgm + 0.5 * player.total3pm) / player.totalFga) * 100).toFixed(1) : '0.0';
            
            // Usage Rate approximation: USG% ≈ (FGA + 0.44 * FTA + TOV) / (Team possessions while player on court)
            // Simplified version using player's individual stats
            const usageRate = player.totalMin > 0 ? 
              (((player.totalFga + 0.44 * player.totalFta + player.totalTurnover) / games) * 2.4).toFixed(1) : '0.0';
            
            // Player Efficiency Rating (simplified): PER ≈ (PTS + REB + AST + STL + BLK - TOV - (FGA - FGM) - (FTA - FTM)) / MIN
            const per = player.totalMin > 0 ? 
              ((player.totalPts + player.totalReb + player.totalAst + player.totalStl + player.totalBlk - 
                player.totalTurnover - (player.totalFga - player.totalFgm) - (player.totalFta - player.totalFtm)) / 
                (player.totalMin / games) * 36).toFixed(1) : '0.0';
            
            return {
              player: player.player,
              games: games,
              
              // Basic Stats
              avgPts,
              avgReb,
              avgAst,
              avgStl,
              avgBlk,
              avgMin,
              avgTurnover,
              
              // Shooting Stats
              fgPct,
              fg3Pct,
              ftPct,
              
              // Advanced Stats
              avgPlusMinus, // ⭐ KEY STAT for playoff impact
              trueShooting,
              effectiveFgPct,
              usageRate,
              per,
              
              // Additional context
              avgOreb: (player.totalOreb / games).toFixed(1),
              avgDreb: (player.totalDreb / games).toFixed(1),
              avgPf: (player.totalPf / games).toFixed(1),
              
              // Efficiency ratios
              astToTov: player.totalTurnover > 0 ? (player.totalAst / player.totalTurnover).toFixed(2) : 'N/A',
              stlToTov: player.totalTurnover > 0 ? (player.totalStl / player.totalTurnover).toFixed(2) : 'N/A'
            };
          })
          .sort((a, b) => parseFloat(b.avgPts) - parseFloat(a.avgPts)) // Sort by points
          .slice(0, 8); // Top 8 players
      };
      
      const [homePlayerStats, awayPlayerStats, injuries] = await Promise.all([
        getTeamPlayerStats(finalHomeTeamGames, homeTeamData.id),
        getTeamPlayerStats(finalAwayTeamGames, awayTeamData.id),
        this.getNbaPlayerInjuries([homeTeamData.id, awayTeamData.id])
      ]);
      
      // Add injury status to player stats
      const addInjuryStatus = (playerStats, teamId) => {
        return playerStats.map(player => {
          const injury = injuries.find(inj => 
            inj.player.id === player.player.id && 
            inj.player.team_id === teamId
          );
          
          return {
            ...player,
            injuryStatus: injury ? {
              status: injury.status,
              description: injury.description,
              returnDate: injury.return_date
            } : null
          };
        });
      };
      
      const homeStatsWithInjuries = addInjuryStatus(homePlayerStats, homeTeamData.id);
      const awayStatsWithInjuries = addInjuryStatus(awayPlayerStats, awayTeamData.id);
      
      console.log(`🏀 [Ball Don't Lie] Found playoff stats for ${homePlayerStats.length} ${homeTeam} players and ${awayPlayerStats.length} ${awayTeam} players`);
      console.log(`🏀 [Ball Don't Lie] Found ${injuries.length} injury reports for both teams`);
      
      return {
        home: homeStatsWithInjuries,
        away: awayStatsWithInjuries,
        homeTeam: homeTeamData,
        awayTeam: awayTeamData,
        injuries: injuries
      };
    } catch (error) {
      console.error(`[Ball Don't Lie] Error getting NBA playoff player stats:`, error);
      return { home: [], away: [] };
    }
  },

  /**
   * Generate a comprehensive NBA playoff report for a specific matchup
   * Focuses only on active playoff teams and their players
   * @param {number} season - Season year (defaults to current year)
   * @param {string|number} teamA - First team ID or name
   * @param {string|number} teamB - Second team ID or name
   * @returns {Promise<string>} - Detailed playoff report
   */
  async generateNbaPlayoffReport(season = new Date().getFullYear(), teamA, teamB) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      console.log(`🏀 [Ball Don't Lie] Generating NBA playoff report for ${actualSeason} season`);
      
      // Check if we have active playoff teams
      const activeTeams = await this.getActivePlayoffTeams(actualSeason);
      const activeTeamIds = activeTeams.map(team => team.id);
      
      // If no active teams were provided, use the first active matchup
      if ((!teamA || !teamB) && activeTeams.length >= 2) {
        console.log('No specific teams provided, using first active playoff matchup');
        teamA = activeTeams[0].id;
        teamB = activeTeams[1].id;
      }
      
      // Get team objects regardless of input format
      const teamAData = await this.getTeamByName(teamA);
      const teamBData = await this.getTeamByName(teamB);
      
      // If teams aren't found or aren't active, try to find active ones
      if ((!teamAData || !teamBData || 
          (teamAData && teamBData && !activeTeamIds.includes(teamAData.id) && !activeTeamIds.includes(teamBData.id))) && 
          activeTeams.length >= 2) {
        console.log(`Teams ${teamA} and ${teamB} are not active in playoffs. Using active teams.`);
        teamA = activeTeams[0].id;
        teamB = activeTeams[1].id;
      }
      
      // Get series data
      const seriesData = await this.getNbaPlayoffSeries(actualSeason, teamA, teamB);
      
      if (!seriesData.seriesFound) {
        // If no series found between selected teams, try to find any active series
        if (activeTeams.length >= 2) {
          const activeSeriesData = await this.getNbaPlayoffSeries(actualSeason, activeTeams[0].id, activeTeams[1].id);
          if (activeSeriesData.seriesFound) {
            return this.generateNbaPlayoffReport(actualSeason, activeTeams[0].id, activeTeams[1].id);
          }
        }
        return `No playoff series found between the selected teams for the ${actualSeason} season (${actualSeason}-${actualSeason + 1}).`;
      }
      
      // Generate report header
      let report = `# NBA PLAYOFF SERIES REPORT: ${seriesData.teamA.full_name} vs ${seriesData.teamB.full_name}\n\n`;
      
      // Add active status indicator
      const teamAActive = activeTeamIds.includes(seriesData.teamA.id);
      const teamBActive = activeTeamIds.includes(seriesData.teamB.id);
      
      if (teamAActive && teamBActive) {
        report += `## Status: ACTIVE PLAYOFF MATCHUP - Both teams still in playoffs\n\n`;
      } else if (teamAActive) {
        report += `## Status: ${seriesData.teamA.name} still active in playoffs, ${seriesData.teamB.name} eliminated\n\n`;
      } else if (teamBActive) {
        report += `## Status: ${seriesData.teamB.name} still active in playoffs, ${seriesData.teamA.name} eliminated\n\n`;
      } else {
        report += `## Status: Series Complete - Both teams no longer active in playoffs\n\n`;
      }
      
      report += `## Current Series Status: ${seriesData.seriesStatus}\n\n`;
      
      // Get player stats from the most recent games (up to 3)
      const recentGames = seriesData.games.filter(game => game.status === 'Final').slice(-3);
      
      for (const game of recentGames) {
        const gameStats = await this.getNbaPlayoffGameStats(game.id);
        const gameDate = new Date(game.date).toLocaleDateString();
        
        report += `### Game on ${gameDate}: ${game.visitor_team.name} ${game.visitor_team_score} @ ${game.home_team.name} ${game.home_team_score}\n\n`;
        
        // Group stats by team
        const homeTeamStats = gameStats.filter(stat => stat.team.id === game.home_team.id)
          .sort((a, b) => b.pts - a.pts); // Sort by points scored
          
        const awayTeamStats = gameStats.filter(stat => stat.team.id === game.visitor_team.id)
          .sort((a, b) => b.pts - a.pts); // Sort by points scored
        
        // Report away team top performers
        report += `#### ${game.visitor_team.full_name} Top Performers:\n`;
        awayTeamStats.slice(0, 3).forEach(stat => {
          report += `- ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, ${stat.stl} STL, ${stat.blk} BLK\n`;
        });
        
        // Report home team top performers
        report += `\n#### ${game.home_team.full_name} Top Performers:\n`;
        homeTeamStats.slice(0, 3).forEach(stat => {
          report += `- ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, ${stat.stl} STL, ${stat.blk} BLK\n`;
        });
        
        report += '\n'; // Add spacing between games
      }
      
      // Add series trends and analysis
      report += `## Series Trends and Analysis\n\n`;
      
      // Home court advantage analysis
      const homeWins = seriesData.games.filter(game => 
        game.status === 'Final' && 
        ((game.home_team.id === seriesData.teamA.id && game.home_team_score > game.visitor_team_score) ||
         (game.home_team.id === seriesData.teamB.id && game.home_team_score > game.visitor_team_score))
      ).length;
      
      const totalCompletedGames = seriesData.games.filter(game => game.status === 'Final').length;
      const homeWinPercentage = totalCompletedGames > 0 ? (homeWins / totalCompletedGames * 100).toFixed(1) : 0;
      
      report += `- Home Court Advantage: ${homeWins} of ${totalCompletedGames} games won by home team (${homeWinPercentage}%)\n`;
      
      // Calculate average point differential
      let teamAPointDiff = 0;
      let gamesWithScores = 0;
      
      seriesData.games.forEach(game => {
        if (game.status === 'Final') {
          gamesWithScores++;
          if (game.home_team.id === seriesData.teamA.id) {
            teamAPointDiff += (game.home_team_score - game.visitor_team_score);
          } else {
            teamAPointDiff += (game.visitor_team_score - game.home_team_score);
          }
        }
      });
      
      const avgPointDiff = gamesWithScores > 0 ? (teamAPointDiff / gamesWithScores).toFixed(1) : 0;
      const teamWithAdvantage = avgPointDiff > 0 ? seriesData.teamA.name : (avgPointDiff < 0 ? seriesData.teamB.name : 'Neither team');
      
      report += `- Average Point Differential: ${Math.abs(avgPointDiff)} points in favor of ${teamWithAdvantage}\n`;
      
      return report;
    } catch (error) {
      console.error('Error generating NBA playoff report:', error);
      return `Error generating NBA playoff report: ${error.message}`;
    }
  },

  // ==================== NHL PLAYOFF STATS METHODS ====================
  
  /**
   * Get NHL teams
   * @returns {Promise<Array>} - Array of NHL team objects
   */
  async getNhlTeams() {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning empty array');
      return [];
    } catch (error) {
      console.error('Error fetching NHL teams:', error);
      return [];
    }
  },

  /**
   * Get NHL team details by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getNhlTeamByName(nameOrId) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log(`⚠️ Ball Don't Lie API does not support NHL - cannot find team: ${nameOrId}`);
      return null;
    } catch (error) {
      console.error(`Error getting NHL team by name/id ${nameOrId}:`, error);
      return null;
    }
  },

  /**
   * Get NHL playoff games for current season (2025 playoffs = 2024 season)
   * @param {number} season - Season year (defaults to current year)
   * @param {boolean} todayOnly - If true, only return today's games
   * @returns {Promise<Array>} - Array of playoff games
   */
  async getNhlPlayoffGames(season = new Date().getFullYear(), todayOnly = false) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning empty array');
      return [];
    } catch (error) {
      console.error('Error fetching NHL playoff games:', error);
      return [];
    }
  },

  /**
   * Get today's NHL playoff games only
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of today's playoff games
   */
  async getTodaysNhlPlayoffGames(season = new Date().getFullYear()) {
    // Ball Don't Lie API only supports NBA, not NHL
    console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning empty array');
    return [];
  },

  /**
   * Get active NHL playoff teams for 2025 playoffs
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team IDs that are in the playoffs
   */
  async getActiveNhlPlayoffTeams(season = new Date().getFullYear()) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning empty array');
      return [];
    } catch (error) {
      console.error('Error getting active NHL playoff teams:', error);
      return [];
    }
  },

  /**
   * Get NHL playoff series data for a specific matchup
   * @param {number} season - Season year (defaults to current year)
   * @param {number|string} teamA - First team ID or team name/abbreviation
   * @param {number|string} teamB - Second team ID or team name/abbreviation
   * @returns {Promise<Object>} - Series data including games and series status
   */
  async getNhlPlayoffSeries(season = new Date().getFullYear(), teamA, teamB) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning no series found');
      return {
        seriesFound: false,
        message: 'Ball Don\'t Lie API does not support NHL data'
      };
    } catch (error) {
      console.error('Error getting NHL playoff series:', error);
      return { seriesFound: false, message: error.message };
    }
  },

  /**
   * Get detailed stats for players in a specific NHL playoff game
   * @param {number} gameId - Game ID
   * @returns {Promise<Array>} - Array of player stats for the game
   */
  async getNhlPlayoffGameStats(gameId) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log('⚠️ Ball Don\'t Lie API does not support NHL - returning empty array');
      return [];
    } catch (error) {
      console.error('Error fetching NHL playoff game stats:', error);
      return [];
    }
  },

  /**
   * Get detailed playoff stats for key players on both teams (May 2025 = NHL Playoffs Active)
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Object>} - Object with home and away team playoff player stats
   */
  async getNhlPlayoffPlayerStats(homeTeam, awayTeam, season = new Date().getFullYear()) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log(`⚠️ Ball Don't Lie API does not support NHL - cannot get stats for ${awayTeam} @ ${homeTeam}`);
      return { home: [], away: [] };
    } catch (error) {
      console.error(`[Ball Don't Lie] Error getting NHL playoff player stats:`, error);
      return { home: [], away: [] };
    }
  },

  /**
   * Get comprehensive NHL playoff analysis for today's game
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Comprehensive playoff analysis
   */
  async getComprehensiveNhlPlayoffAnalysis(homeTeam, awayTeam) {
    try {
      // Ball Don't Lie API only supports NBA, not NHL
      console.log(`⚠️ Ball Don't Lie API does not support NHL - cannot analyze ${awayTeam} @ ${homeTeam}`);
      return null;
    } catch (error) {
      console.error('Error getting comprehensive NHL playoff analysis:', error);
      return null;
    }
  },

  /**
   * Get NBA team stats for multiple teams
   * @param {Array} teamIds - Array of team IDs or names
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team stats objects
   */
  async getNBATeamStats(teamIds, season = null) {
    try {
      console.log(`🏀 [Ball Don't Lie] Getting NBA team stats for teams: ${teamIds?.join(', ') || 'none'}`);
      
      // Validate input
      if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
        console.warn('⚠️ No team IDs provided for NBA team stats');
        return [];
      }
      
      // Filter out null/undefined values and ensure we have valid team IDs
      const validTeamIds = teamIds.filter(id => id != null && id !== undefined && id !== '');
      
      if (validTeamIds.length === 0) {
        console.warn('⚠️ No valid team IDs after filtering');
        return [];
      }
      
      const currentMonth = new Date().getMonth() + 1;
      const nowYear = new Date().getFullYear();
      const playoffSeason = season || (currentMonth <= 6 ? nowYear - 1 : nowYear);
      console.log(`🏀 Using season: ${playoffSeason} (real-only)`);
      
      // Attempt to fetch real team season stats from the SDK; if not supported, return []
      const client = initApi();
      if (!client?.nba) {
        console.warn('⚠️ NBA client not available; cannot fetch team stats');
        return [];
      }
      
      // Normalize IDs to numbers if possible
      const numericIds = validTeamIds.map(id => (typeof id === 'string' ? Number(id) : id)).filter(n => Number.isFinite(n));
      
      // Try several potential SDK methods to retrieve team season stats
      let response = null;
      try {
        if (typeof client.nba.getTeamSeasonStats === 'function') {
          response = await client.nba.getTeamSeasonStats({
            team_ids: numericIds,
            season: playoffSeason,
            season_type: 'playoffs',
            per_page: 100
          });
        }
      } catch (e1) {
        console.warn('getTeamSeasonStats not available or failed:', e1.message);
      }
      
      if (!response) {
        try {
          if (typeof client.nba.getTeamStats === 'function') {
            response = await client.nba.getTeamStats({
              team_ids: numericIds,
              season: playoffSeason,
              season_type: 'playoffs',
              per_page: 100
            });
          }
        } catch (e2) {
          console.warn('getTeamStats not available or failed:', e2.message);
        }
      }
      
      if (!response) {
        console.warn('⚠️ No supported NBA team stats method found in SDK; returning empty stats (real-only enforcement).');
        return [];
      }
      
      const rows = response?.data || [];
      console.log(`🏀 Retrieved ${rows.length} NBA team season stats rows from API`);
      
      // Return raw rows for now (real data only). Downstream may adapt format or skip if not consumable.
      return rows;
      
    } catch (error) {
      console.error('Error fetching NBA team stats:', error);
      return [];
    }
  },

  /**
   * Helper method to sum a stat across all players
   * @private
   */
  _sumPlayerStat(playerStats, statName) {
    if (!playerStats || !Array.isArray(playerStats)) {
      return 0;
    }
    return playerStats.reduce((sum, player) => {
      if (!player || typeof player !== 'object') {
        return sum;
      }
      const statValue = player[statName];
      return sum + (typeof statValue === 'number' && !isNaN(statValue) ? statValue : 0);
    }, 0);
  },

  /**
   * Helper method to average a stat across all players (weighted by games played)
   * @private
   */
  _avgPlayerStat(playerStats, statName) {
    if (!playerStats || !Array.isArray(playerStats)) {
      return 0;
    }
    
    const validPlayers = playerStats.filter(p => {
      if (!p || typeof p !== 'object') return false;
      const statValue = p[statName];
      const gamesPlayed = p.games_played;
      return statValue != null && 
             typeof statValue === 'number' && 
             !isNaN(statValue) &&
             gamesPlayed != null && 
             typeof gamesPlayed === 'number' && 
             !isNaN(gamesPlayed) && 
             gamesPlayed > 0;
    });
    
    if (validPlayers.length === 0) return 0;
    
    const totalWeightedStat = validPlayers.reduce((sum, player) => {
      const statValue = player[statName];
      const gamesPlayed = player.games_played;
      return sum + (statValue * gamesPlayed);
    }, 0);
    
    const totalGames = validPlayers.reduce((sum, player) => sum + player.games_played, 0);
    
    return totalGames > 0 ? totalWeightedStat / totalGames : 0;
  },

  /**
   * Helper method to get team ID from team name
   * @private
   */
  _getTeamIdFromName(teamName) {
    // Simple mapping of common team names to IDs
    // This is a basic implementation - in a real scenario you'd want a more comprehensive mapping
    const teamNameMap = {
      'Lakers': 14,
      'Warriors': 9,
      'Celtics': 2,
      'Heat': 16,
      'Knicks': 20,
      'Bulls': 4,
      'Nets': 3,
      'Sixers': 23,
      'Bucks': 17,
      'Raptors': 28,
      'Cavaliers': 5,
      'Pistons': 8,
      'Pacers': 11,
      'Hawks': 1,
      'Hornets': 30,
      'Magic': 22,
      'Wizards': 29,
      'Nuggets': 7,
      'Timberwolves': 18,
      'Thunder': 21,
      'Trail Blazers': 24,
      'Jazz': 27,
      'Suns': 25,
      'Kings': 26,
      'Clippers': 12,
      'Mavericks': 6,
      'Rockets': 10,
      'Grizzlies': 15,
      'Pelicans': 19,
      'Spurs': 26
    };
    
    // Try to find a match
    const foundId = teamNameMap[teamName];
    if (foundId) {
      return foundId;
    }
    
    // If no exact match, try partial matching
    for (const [name, id] of Object.entries(teamNameMap)) {
      if (teamName.includes(name) || name.includes(teamName)) {
        return id;
      }
    }
    
    // Default fallback
    return 1; // Default to Hawks if no match found
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
