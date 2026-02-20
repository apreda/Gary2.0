import { BalldontlieAPI } from '@balldontlie/sdk';
import axios from 'axios';
import { nhlSeason } from '../utils/dateUtils.js';

// Set cache TTL (5 minutes for playoff data)
const TTL_MINUTES = 5;
const cacheMap = new Map();

/**
 * Clear all cached data - useful for ensuring fresh injury/lineup data
 */
function clearCache() {
  const size = cacheMap.size;
  cacheMap.clear();
  console.log(`[Ball Don't Lie] 🗑️ Cache cleared (${size} entries removed)`);
}

/**
 * Clear cache entries matching a pattern (e.g., 'injuries' to clear all injury caches)
 */
function clearCacheByPattern(pattern) {
  let cleared = 0;
  for (const key of cacheMap.keys()) {
    if (key.includes(pattern)) {
      cacheMap.delete(key);
      cleared++;
    }
  }
  console.log(`[Ball Don't Lie] 🗑️ Cleared ${cleared} cache entries matching "${pattern}"`);
  return cleared;
}

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
      // console.log(`[Ball Don't Lie] Using cached data for ${key}`);
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
 * Get the current NHL/NBA season year for BDL API
 * BDL uses the starting year of the season (e.g., 2025 for 2025-26 season)
 * NHL/NBA seasons run Oct-June, so Jul-Dec = current season year, Jan-June = previous year
 * @returns {number} - Season year (e.g., 2025 for current 2025-26 season)
 */
function getCurrentNhlSeason() {
  return nhlSeason();
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
   * Clear all cached data - useful for ensuring fresh injury/lineup data
   */
  clearCache() {
    clearCache();
  },

  /**
   * Clear cache entries matching a pattern (e.g., 'injuries' to clear all injury caches)
   */
  clearCacheByPattern(pattern) {
    return clearCacheByPattern(pattern);
  },

  /**
   * Get sport-specific client from the SDK
   */
  _getSportClient(sportKey) {
    const client = initApi();
    if (!client) return null;
    const map = {
      basketball_nba: 'nba',
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
            // Legitimate "no odds" — OK to cache empty result
            return [];
          } catch (v2err) {
            const status = v2err?.response?.status || '';
            const data = v2err?.response?.data ? JSON.stringify(v2err.response.data).slice(0, 400) : '';
            console.warn(`[Ball Don't Lie] NBA v2/odds failed: ${status} ${data}`);
            throw v2err; // Don't cache failed fetches — let outer catch handle
          }
        } else {
          // Non-NBA sports: use V1 sport-scoped endpoint
          const v1Url = `${BALLDONTLIE_API_BASE_URL}/${sportKey}/v1/odds`;
          try {
             return await fetchAllPages(v1Url, norm);
          } catch (err) {
             console.warn(`[Ball Don't Lie] ${sportKey} v1/odds failed: ${err.message}`);
             throw err; // Don't cache failed fetches — let outer catch handle
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
   * NFL Team Roster with Depth Chart
   * GET /nfl/v1/teams/<ID>/roster
   * Returns players organized by position with depth (1=starter, 2=backup, etc.)
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @returns {Array} - Roster entries with player info, position, depth, injury_status
   */
  async getNflTeamRoster(teamId, season = null, ttlMinutes = 30) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_team_roster_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/teams/${encodeURIComponent(teamId)}/roster${buildQuery({ season })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflTeamRoster error:', e.message);
      return [];
    }
  },

  /**
   * NFL Season Stats filtered by team
   * GET /nfl/v1/season_stats
   * Returns player season stats for a specific team
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {boolean} postseason - Include postseason stats
   * @returns {Array} - Player season stats
   */
  async getNflSeasonStatsByTeam(teamId, season = null, postseason = false, ttlMinutes = 15) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_season_stats_team_${teamId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats${buildQuery({ 
          team_id: teamId, 
          season, 
          postseason,
          per_page: 100
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflSeasonStatsByTeam error:', e.message);
      return [];
    }
  },

  /**
   * NHL Team Players (Roster)
   * GET /nhl/v1/players?team_ids[]=<ID>&seasons[]=<season>
   * Returns players for a specific team in a specific season
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Array} - Player objects with position, name, etc.
   */
  async getNhlTeamPlayers(teamId, season = getCurrentNhlSeason(), ttlMinutes = 30) {
    try {
      if (!teamId) return [];
      const cacheKey = `nhl_team_players_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allPlayers = [];
        let cursor = null;

        do {
          const params = {
            team_ids: [teamId],
            seasons: [season],
            per_page: 100
          };
          if (cursor) {
            params.cursor = cursor;
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players${buildQuery(params)}`;
          const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });

          const players = response.data?.data || [];
          allPlayers = allPlayers.concat(players);

          // Check for pagination - according to docs, meta.next_cursor indicates more results
          cursor = response.data?.meta?.next_cursor || null;
        } while (cursor);

        // Filter to only players currently on this team for this season
        // Each player has a "teams" array showing their team history
        const currentPlayers = allPlayers.filter(player => {
          return player.teams && player.teams.some(teamEntry =>
            teamEntry.id === teamId && teamEntry.season === season
          );
        });

        console.log(`[Ball Don't Lie] NHL team ${teamId} season ${season}: ${currentPlayers.length} active players`);
        return currentPlayers;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nhl getNhlTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * NHL Player Season Stats
   * GET /nhl/v1/players/:id/season_stats?season=<season>
   * Returns season statistics for a specific player
   * @param {number} playerId - BDL player ID
   * @param {number} season - Season year
   * @returns {Array} - Array of { name, value } stat objects
   */
  async getNhlPlayerSeasonStats(playerId, season = getCurrentNhlSeason(), ttlMinutes = 30) {
    try {
      if (!playerId) return [];
      const cacheKey = `nhl_player_season_stats_${playerId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${encodeURIComponent(playerId)}/season_stats${buildQuery({ season })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nhl getNhlPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * NHL Player Stats Leaders
   * GET /nhl/v1/player_stats/leaders?season=<season>&type=<type>
   * Returns league leaders for a specific stat type
   * @param {number} season - Season year
   * @param {string} type - Stat type (points, goals, assists, etc.)
   * @returns {Array} - Array of leader objects
   */
  async getNhlPlayerStatsLeaders(season = getCurrentNhlSeason(), type = 'points', ttlMinutes = 60) {
    try {
      const cacheKey = `nhl_player_stats_leaders_${season}_${type}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/player_stats/leaders${buildQuery({ season, type })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nhl getNhlPlayerStatsLeaders error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF Team Players (Roster)
   * GET /ncaaf/v1/players?team_ids[]=<ID>
   * Returns players for a specific team
   * @param {number} teamId - BDL team ID
   * @returns {Array} - Player objects with position, name, etc.
   */
  async getNcaafTeamPlayers(teamId, ttlMinutes = 30) {
    try {
      if (!teamId) return [];
      const cacheKey = `ncaaf_team_players_${teamId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/players/active${buildQuery({ 
          team_ids: [teamId],
          per_page: 100
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF Player Season Stats
   * GET /ncaaf/v1/player_season_stats?team_ids[]=<ID>&season=<season>
   * Returns season statistics for players on a specific team
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @returns {Array} - Array of player season stat objects
   */
  async getNcaafPlayerSeasonStats(teamId, season = null, ttlMinutes = 30) {
    // Calculate dynamic NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `ncaaf_player_season_stats_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_season_stats${buildQuery({ 
          team_ids: [teamId],
          season,
          per_page: 100
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF Rankings
   * GET /ncaaf/v1/rankings?season=<season>
   * Returns AP Poll rankings
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {number} week - Optional week number
   * @returns {Array} - Array of ranking objects
   */
  async getNcaafRankings(season = null, week = null, ttlMinutes = 60) {
    // Calculate dynamic NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      const cacheKey = `ncaaf_rankings_${season}_${week || 'current'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { season };
        if (week) params.week = week;
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/rankings${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafRankings error:', e.message);
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
          basketball_ncaab: 'ncaab/v1/players',
          icehockey_nhl: 'nhl/v1/players',
          americanfootball_nfl: 'nfl/v1/players',
          americanfootball_ncaaf: 'ncaaf/v1/players'
        };
        const path = endpointMap[sportKey];
        if (!path) return [];
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Return BOTH data and meta for pagination support
        return { 
          data: response.data?.data || [],
          meta: response.data?.meta
        };
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayers error:`, e.message);
      return [];
    }
  },

  /**
   * Active players (per sport)
   */
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
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
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
      console.error(`[Ball Don't Lie] ${sportKey} getPlayersActive error:`, e.message);
      return { data: [], meta: null };
    }
  },

  /**
   * League leaders (per stat type/season)
   */
  async getLeaders(params = {}, ttlMinutes = 10) {
    try {
      if (!params?.stat_type || !params?.season) {
        throw new Error('stat_type and season are required for getLeaders');
      }
      const cacheKey = `leaders_${params.stat_type}_${params.season}_${JSON.stringify({ ...params, stat_type: undefined, season: undefined })}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/v1/leaders${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getLeaders error:', e.message);
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
   * Get NBA roster depth for two teams - top 10 players per team with base + advanced stats
   * Used for scout report to show Gary the full rotation (starters + key bench)
   * Includes: base stats (PPG, RPG, APG) + advanced stats (eFG%, TS%, +/-, net_rating, usage)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @returns {Promise<Object>} - { home: [...], away: [...] } arrays of player stats with advanced metrics
   */
  async getNbaRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NBA roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);

      // Get team IDs first
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByName(homeTeamName),
        this.getTeamByName(awayTeamName)
      ]);

      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }

      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);

      const cacheKey = `nba_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch active players for both teams separately (limit 15 per team to cover full rotation)
        console.log(`🏀 [Ball Don't Lie] Fetching active players...`);

        const [homePlayersResp, awayPlayersResp] = await Promise.all([
          axios.get(`${BALLDONTLIE_API_BASE_URL}/nba/v1/players/active?team_ids[]=${homeTeam.id}&per_page=15`, { headers: { 'Authorization': API_KEY } }),
          axios.get(`${BALLDONTLIE_API_BASE_URL}/nba/v1/players/active?team_ids[]=${awayTeam.id}&per_page=15`, { headers: { 'Authorization': API_KEY } })
        ]);

        const homePlayers = Array.isArray(homePlayersResp?.data?.data) ? homePlayersResp.data.data : [];
        const awayPlayers = Array.isArray(awayPlayersResp?.data?.data) ? awayPlayersResp.data.data : [];

        if (homePlayers.length === 0 && awayPlayers.length === 0) {
          console.warn('[Ball Don\'t Lie] No active players found for teams');
          return { home: [], away: [] };
        }

        const allPlayers = [...homePlayers, ...awayPlayers];
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active players (${homePlayers.length} + ${awayPlayers.length})`);

        // Get all player IDs for season averages fetch
        const allPlayerIds = allPlayers.map(p => p.id);

        if (allPlayerIds.length === 0) {
          return { home: [], away: [] };
        }

        // Fetch base, advanced, AND usage season averages in parallel
        console.log(`🏀 [Ball Don't Lie] Fetching base + advanced + usage season averages for ${allPlayerIds.length} players...`);
        const [baseAverages, advancedAverages, usageAverages] = await Promise.all([
          // Base stats: pts, reb, ast, min, fg_pct, etc.
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          }),
          // Advanced stats: efg_pct, ts_pct, off_rating, def_rating, net_rating, usg_pct, pace, pie
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'advanced',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          }),
          // Usage/team-share stats: pct_pts, pct_fga, pct_reb, pct_ast, pct_stl, pct_blk, pct_tov, pct_fta
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          })
        ]);

        // Filter out players with 0 games played (haven't actually played this season)
        const relevantBaseAverages = baseAverages.filter(avg => (avg.stats?.gp || 0) > 0);
        console.log(`🏀 [Ball Don't Lie] Got base averages for ${relevantBaseAverages.length} players, advanced for ${advancedAverages.length} players, usage for ${(usageAverages || []).length} players`);

        // Build maps of player ID -> stats
        const baseStatsMap = {};
        for (const avg of relevantBaseAverages) {
          if (avg.player?.id) {
            baseStatsMap[avg.player.id] = {
              pts: avg.stats?.pts || 0,
              reb: avg.stats?.reb || 0,
              ast: avg.stats?.ast || 0,
              min: avg.stats?.min || 0,
              stl: avg.stats?.stl || 0,
              blk: avg.stats?.blk || 0,
              fg_pct: avg.stats?.fg_pct || 0,
              fg3_pct: avg.stats?.fg3_pct || 0,
              fgm: avg.stats?.fgm || 0,
              fga: avg.stats?.fga || 0,
              fg3m: avg.stats?.fg3m || 0,
              fta: avg.stats?.fta || 0,
              ftm: avg.stats?.ftm || 0,
              tov: avg.stats?.turnover || avg.stats?.tov || 0,
              oreb: avg.stats?.oreb || 0,
              dreb: avg.stats?.dreb || 0,
              gp: avg.stats?.gp || 0,
              plus_minus: avg.stats?.plus_minus || 0
            };
          }
        }

        // Build advanced stats map
        const advStatsMap = {};
        for (const avg of advancedAverages) {
          if (avg.player?.id) {
            advStatsMap[avg.player.id] = {
              efg_pct: avg.stats?.efg_pct || 0,
              ts_pct: avg.stats?.ts_pct || 0,
              off_rating: avg.stats?.off_rating || avg.stats?.offensive_rating || 0,
              def_rating: avg.stats?.def_rating || avg.stats?.defensive_rating || 0,
              net_rating: avg.stats?.net_rating || 0,
              usg_pct: avg.stats?.usg_pct || avg.stats?.usage_pct || 0,
              pace: avg.stats?.pace || 0,
              pie: avg.stats?.pie || 0
            };
          }
        }

        // Build usage/team-share stats map (pct_pts, pct_fga, pct_reb, pct_ast, etc.)
        const usageStatsMap = {};
        for (const avg of (usageAverages || [])) {
          if (avg.player?.id) {
            usageStatsMap[avg.player.id] = {
              pct_pts: avg.stats?.pct_pts || 0,
              pct_fga: avg.stats?.pct_fga || 0,
              pct_reb: avg.stats?.pct_reb || 0,
              pct_ast: avg.stats?.pct_ast || 0,
              pct_stl: avg.stats?.pct_stl || 0,
              pct_blk: avg.stats?.pct_blk || 0,
              pct_tov: avg.stats?.pct_tov || 0,
              pct_fta: avg.stats?.pct_fta || 0
            };
          }
        }

        // Helper to format player with base + advanced + usage stats
        const formatPlayer = (player) => {
          const base = baseStatsMap[player.id] || {};
          const adv = advStatsMap[player.id] || {};
          const usg = usageStatsMap[player.id] || {};

          // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
          let efgPct = adv.efg_pct || 0;
          if (!efgPct && base.fga > 0) {
            efgPct = (base.fgm + 0.5 * base.fg3m) / base.fga;
          }

          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            // Base stats
            pts: base.pts || 0,
            reb: base.reb || 0,
            ast: base.ast || 0,
            min: base.min || 0,
            stl: base.stl || 0,
            blk: base.blk || 0,
            fg_pct: base.fg_pct || 0,
            fg3_pct: base.fg3_pct || 0,
            gp: base.gp || 0,
            plus_minus: base.plus_minus || 0,
            tov: base.tov || 0,
            oreb: base.oreb || 0,
            // Advanced stats (TIER 1 PREDICTIVE)
            efg_pct: efgPct,
            ts_pct: adv.ts_pct || 0,
            off_rating: adv.off_rating || 0,
            def_rating: adv.def_rating || 0,
            net_rating: adv.net_rating || 0,
            usg_pct: adv.usg_pct || 0,
            pace: adv.pace || 0,
            pie: adv.pie || 0,
            // Team-share percentages (from type=usage endpoint)
            pct_pts: usg.pct_pts || 0,
            pct_fga: usg.pct_fga || 0,
            pct_reb: usg.pct_reb || 0,
            pct_ast: usg.pct_ast || 0,
            pct_stl: usg.pct_stl || 0,
            pct_blk: usg.pct_blk || 0,
            pct_tov: usg.pct_tov || 0,
            pct_fta: usg.pct_fta || 0
          };
        };

        // Format, filter players with actual minutes (>5 min avg), and sort by minutes (top 10 per team)
        const homeRoster = homePlayers
          .map(formatPlayer)
          .filter(p => p.min > 5 || p.gp > 0) // Must have some playing time
          .sort((a, b) => b.min - a.min)
          .slice(0, 10);

        const awayRoster = awayPlayers
          .map(formatPlayer)
          .filter(p => p.min > 5 || p.gp > 0) // Must have some playing time
          .sort((a, b) => b.min - a.min)
          .slice(0, 10);

        console.log(`🏀 [Ball Don't Lie] Roster depth ready: ${homeTeam.name} (${homeRoster.length} players), ${awayTeam.name} (${awayRoster.length} players)`);

        return {
          home: homeRoster,
          away: awayRoster,
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get NHL roster depth for two teams - top skaters + goalies with season stats
   * Used for scout report to show Gary the full rotation
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @returns {Promise<Object>} - { home: { skaters: [...], goalies: [...] }, away: { skaters: [...], goalies: [...] } }
   */
  async getNhlRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏒 [Ball Don't Lie] Fetching NHL roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NHL teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('icehockey_nhl', homeTeamName),
        this.getTeamByNameGeneric('icehockey_nhl', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NHL team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
      }
      
      console.log(`🏒 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);
      
      const cacheKey = `nhl_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch players for both teams
        console.log(`🏒 [Ball Don't Lie] Fetching players for both teams...`);
        const [homePlayers, awayPlayers] = await Promise.all([
          this.getNhlTeamPlayers(homeTeam.id, season),
          this.getNhlTeamPlayers(awayTeam.id, season)
        ]);
        
        console.log(`🏒 [Ball Don't Lie] ${homeTeam.full_name}: ${homePlayers.length} players, ${awayTeam.full_name}: ${awayPlayers.length} players`);
        
        // Separate goalies from skaters
        const homeGoalies = homePlayers.filter(p => p.position_code === 'G');
        const homeSkaters = homePlayers.filter(p => p.position_code !== 'G');
        const awayGoalies = awayPlayers.filter(p => p.position_code === 'G');
        const awaySkaters = awayPlayers.filter(p => p.position_code !== 'G');
        
        // Get all player IDs for season stats fetch
        const allPlayerIds = [...homePlayers, ...awayPlayers].map(p => p.id);
        
        if (allPlayerIds.length === 0) {
          return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
        }
        
        // Fetch season stats for all players (in batches to avoid rate limits)
        console.log(`🏒 [Ball Don't Lie] Fetching season stats for ${allPlayerIds.length} players...`);
        const statsMap = {};
        const batchSize = 10;
        
        for (let i = 0; i < allPlayerIds.length; i += batchSize) {
          const batch = allPlayerIds.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (playerId) => {
              try {
                const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${playerId}/season_stats?season=${season}`;
                const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
                const statsArray = resp.data?.data || [];
                // Convert array to object
                const stats = {};
                for (const stat of statsArray) {
                  if (stat.name && stat.value !== undefined) {
                    stats[stat.name] = stat.value;
                  }
                }
                return { playerId, stats };
              } catch (e) {
                return { playerId, stats: {} };
              }
            })
          );
          
          for (const result of batchResults) {
            statsMap[result.playerId] = result.stats;
          }
          
          // Small delay between batches
          if (i + batchSize < allPlayerIds.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        console.log(`🏒 [Ball Don't Lie] Got season stats for ${Object.keys(statsMap).length} players`);
        
        // Format skater with stats
        const formatSkater = (player) => {
          const stats = statsMap[player.id] || {};
          const gp = stats.games_played || 1;
          return {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position_code || '?',
            gp: stats.games_played || 0,
            goals: stats.goals || 0,
            assists: stats.assists || 0,
            points: stats.points || 0,
            plusMinus: stats.plus_minus || 0,
            toi: stats.time_on_ice_per_game || 0,
            shots: stats.shots || 0,
            ppPoints: stats.power_play_points || 0,
            // Per-game averages
            goalsPerGame: gp > 0 ? (stats.goals || 0) / gp : 0,
            pointsPerGame: gp > 0 ? (stats.points || 0) / gp : 0
          };
        };
        
        // Format goalie with stats
        const formatGoalie = (player) => {
          const stats = statsMap[player.id] || {};
          return {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: 'G',
            gp: stats.games_played || 0,
            gamesStarted: stats.games_started || 0,
            wins: stats.wins || 0,
            losses: stats.losses || 0,
            otLosses: stats.ot_losses || 0,
            gaa: stats.goals_against_average || 0,
            svPct: stats.save_pct || 0,
            shutouts: stats.shutouts || 0,
            saves: stats.saves || 0,
            goalsAgainst: stats.goals_against || 0
          };
        };
        
        // Sort skaters by time on ice (top 9) and format goalies
        const homeSkatersSorted = homeSkaters
          .map(formatSkater)
          .sort((a, b) => b.toi - a.toi)
          .slice(0, 9);
          
        const awaySkatersSorted = awaySkaters
          .map(formatSkater)
          .sort((a, b) => b.toi - a.toi)
          .slice(0, 9);
        
        const homeGoaliesFormatted = homeGoalies.map(formatGoalie).sort((a, b) => b.gamesStarted - a.gamesStarted);
        const awayGoaliesFormatted = awayGoalies.map(formatGoalie).sort((a, b) => b.gamesStarted - a.gamesStarted);
        
        console.log(`🏒 [Ball Don't Lie] Roster depth ready: ${homeTeam.full_name} (${homeSkatersSorted.length} skaters, ${homeGoaliesFormatted.length} goalies), ${awayTeam.full_name} (${awaySkatersSorted.length} skaters, ${awayGoaliesFormatted.length} goalies)`);
        
        return {
          home: {
            skaters: homeSkatersSorted,
            goalies: homeGoaliesFormatted,
            teamName: homeTeam.full_name
          },
          away: {
            skaters: awaySkatersSorted,
            goalies: awayGoaliesFormatted,
            teamName: awayTeam.full_name
          }
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNhlRosterDepth error:', e.message);
      return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
    }
  },

  /**
   * Get NCAAB standings for specific conferences
   * @param {number} conferenceId - Conference ID from BDL
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Array>} - Array of standings for teams in that conference
   */
  async getNcaabStandings(conferenceId, season, ttlMinutes = 60) {
    try {
      if (!conferenceId || !season) return [];
      const cacheKey = `ncaab_standings_${conferenceId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/standings?conference_id=${conferenceId}&season=${season}`;
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB standings for conference ${conferenceId}, season ${season}`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabStandings error:', e.message);
      return [];
    }
  },

  /**
   * Get NCAAB roster depth for two teams - top 9 players with season stats
   * Used for scout report to show Gary the full rotation
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - { home: [...], away: [...], homeTeamName, awayTeamName }
   */
  async getNcaabRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NCAAB roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NCAAB teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('basketball_ncaab', homeTeamName),
        this.getTeamByNameGeneric('basketball_ncaab', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NCAAB team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name || homeTeam.name} (${homeTeam.id}) vs ${awayTeam.full_name || awayTeam.name} (${awayTeam.id})`);
      
      const cacheKey = `ncaab_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch active players for both teams (limit to 25 total, we only need top 9 per team)
        const activePlayersUrl = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/players/active?team_ids[]=${homeTeam.id}&team_ids[]=${awayTeam.id}&per_page=25`;
        const playersResp = await axios.get(activePlayersUrl, { headers: { 'Authorization': API_KEY } });
        const allPlayers = Array.isArray(playersResp?.data?.data) ? playersResp.data.data : [];
        
        if (allPlayers.length === 0) {
          console.warn('[Ball Don\'t Lie] No active NCAAB players found');
          return { home: [], away: [] };
        }
        
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active NCAAB players`);
        
        // Separate by team
        const homePlayers = allPlayers.filter(p => p.team?.id === homeTeam.id);
        const awayPlayers = allPlayers.filter(p => p.team?.id === awayTeam.id);
        
        // Fetch season stats for both teams
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB player season stats...`);
        const [homeStats, awayStats] = await Promise.all([
          this.getNcaabPlayerSeasonStats({ teamId: homeTeam.id, season }),
          this.getNcaabPlayerSeasonStats({ teamId: awayTeam.id, season })
        ]);
        
        // Build stats map
        const statsMap = {};
        for (const stat of [...homeStats, ...awayStats]) {
          if (stat.player?.id) {
            statsMap[stat.player.id] = stat;
          }
        }
        
        // Format player with stats
        const formatPlayer = (player) => {
          const stats = statsMap[player.id] || {};
          const gp = stats.games_played || 1;
          const fgm = stats.fgm || 0;
          const fga = stats.fga || 0;
          const fg3m = stats.fg3m || 0;
          const fta = stats.fta || 0;
          const efgPct = fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null;
          const tsa = 2 * (fga + 0.44 * fta);
          const tsPct = tsa > 0 ? ((stats.pts || 0) / tsa * 100).toFixed(1) : null;
          const fgaPg = gp > 0 ? (fga / gp).toFixed(1) : '0.0';
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            gp: stats.games_played || 0,
            pts: stats.pts || (gp > 0 ? (stats.pts || 0) / gp : 0),
            ppg: gp > 0 ? ((stats.pts || 0) / gp).toFixed(1) : '0.0',
            reb: gp > 0 ? ((stats.reb || 0) / gp).toFixed(1) : '0.0',
            ast: gp > 0 ? ((stats.ast || 0) / gp).toFixed(1) : '0.0',
            min: stats.min ? parseFloat(stats.min).toFixed(1) : '0.0',
            fgPct: stats.fg_pct ? stats.fg_pct.toFixed(1) : 'N/A',
            fg3Pct: stats.fg3_pct ? stats.fg3_pct.toFixed(1) : 'N/A',
            efgPct,
            tsPct,
            fgaPg
          };
        };
        
        // Sort by PPG (total points as proxy for importance) and take top 9
        const homeRoster = homePlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
          
        const awayRoster = awayPlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
        
        console.log(`🏀 [Ball Don't Lie] NCAAB roster depth ready: ${homeTeam.full_name || homeTeam.name} (${homeRoster.length} players), ${awayTeam.full_name || awayTeam.name} (${awayRoster.length} players)`);

        // Build GP map for ALL players (not just top 9) — used by narrative scrubber
        // to distinguish "never played this season" (gp=0) from "played but now injured"
        const gpMap = {};
        for (const player of allPlayers) {
          const name = `${player.first_name} ${player.last_name}`.trim();
          const stats = statsMap[player.id] || {};
          gpMap[name] = stats.games_played || 0;
        }

        // Compute team-level Four Factors from team_season_stats (per-game averages)
        // player_season_stats does NOT have oreb/dreb — only team_season_stats does
        // team_season_stats returns per-game averages, so ratios (eFG%, TOV Rate, etc.) work directly
        const [homeTeamSeasonStats, awayTeamSeasonStats] = await Promise.all([
          this.getTeamSeasonStats('basketball_ncaab', { teamId: homeTeam.id, season }),
          this.getTeamSeasonStats('basketball_ncaab', { teamId: awayTeam.id, season })
        ]);

        const computeTeamFourFactors = (teamStatsArr) => {
          const ts = Array.isArray(teamStatsArr) ? teamStatsArr[0] : teamStatsArr;
          if (!ts) return { efgPct: null, tovRate: null, ftRate: null, orebRate: null };
          const fgm = ts.fgm || 0;
          const fga = ts.fga || 0;
          const fg3m = ts.fg3m || 0;
          const fta = ts.fta || 0;
          const oreb = ts.oreb || 0;
          const dreb = ts.dreb || 0;
          const tov = ts.turnover || 0;
          const totalReb = oreb + dreb;
          return {
            efgPct: fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null,
            tovRate: fga > 0 ? (tov / (fga + 0.44 * fta + tov) * 100).toFixed(1) : null,
            ftRate: fga > 0 ? (fta / fga * 100).toFixed(1) : null,
            orebRate: totalReb > 0 ? (oreb / totalReb * 100).toFixed(1) : null,
          };
        };

        const homeTeamFourFactors = computeTeamFourFactors(homeTeamSeasonStats);
        const awayTeamFourFactors = computeTeamFourFactors(awayTeamSeasonStats);

        return {
          home: homeRoster,
          away: awayRoster,
          homeTeamName: homeTeam.full_name || homeTeam.name,
          awayTeamName: awayTeam.full_name || awayTeam.name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeConferenceId: homeTeam.conference_id,
          awayConferenceId: awayTeam.conference_id,
          gpMap,
          homeTeamFourFactors,
          awayTeamFourFactors
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get NFL standings for a season
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Array>} - Array of team standings with record, division, conference
   */
  async getNflStandings(season, ttlMinutes = 60) {
    try {
      if (!season) return [];
      const cacheKey = `nfl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/standings?season=${season}`;
        console.log(`🏈 [Ball Don't Lie] Fetching NFL standings for ${season} season`);
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflStandings error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL roster depth for two teams - top players by position with stats
   * Uses team roster endpoint (depth chart)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { home: [...], away: [...] }
   */
  async getNflRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏈 [Ball Don't Lie] Fetching NFL roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NFL teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('americanfootball_nfl', homeTeamName),
        this.getTeamByNameGeneric('americanfootball_nfl', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NFL team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏈 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);
      
      const cacheKey = `nfl_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch team rosters (depth charts)
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team rosters...`);
        
        const fetchRoster = async (teamId) => {
          try {
            const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/teams/${teamId}/roster?season=${season}`;
            const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
            return resp.data?.data || [];
          } catch (e) {
            console.warn(`[Ball Don't Lie] Could not fetch roster for team ${teamId}:`, e.message);
            return [];
          }
        };
        
        const [homeRoster, awayRoster] = await Promise.all([
          fetchRoster(homeTeam.id),
          fetchRoster(awayTeam.id)
        ]);
        
        // Format player from depth chart
        const formatPlayer = (entry) => {
          const player = entry.player || {};
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: entry.position || player.position_abbreviation || '?',
            depth: entry.depth || 1,
            jersey: player.jersey_number || '?',
            college: player.college || '',
            experience: player.experience || '',
            injuryStatus: entry.injury_status || null
          };
        };
        
        // Get key skill position players (depth 1-2 only for QB, RB, WR, TE)
        const keyPositions = ['QB', 'RB', 'WR', 'TE'];
        const filterKeyPlayers = (roster) => {
          return roster
            .filter(entry => keyPositions.includes(entry.position) && entry.depth <= 2)
            .map(formatPlayer)
            .sort((a, b) => {
              // Sort by position order, then depth
              const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4 };
              if (posOrder[a.position] !== posOrder[b.position]) {
                return (posOrder[a.position] || 99) - (posOrder[b.position] || 99);
              }
              return a.depth - b.depth;
            })
            .slice(0, 12); // Top 12 skill players
        };
        
        const homeKeyPlayers = filterKeyPlayers(homeRoster);
        const awayKeyPlayers = filterKeyPlayers(awayRoster);
        
        console.log(`🏈 [Ball Don't Lie] NFL roster depth ready: ${homeTeam.full_name} (${homeKeyPlayers.length} key players), ${awayTeam.full_name} (${awayKeyPlayers.length} key players)`);
        
        return {
          home: homeKeyPlayers,
          away: awayKeyPlayers,
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get NFL playoff game history for teams this season
   * Returns previous playoff games with box scores for scout report context
   * @param {Array<number>} teamIds - Array of BDL team IDs (home and away)
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { games: [...], teamStats: {...} }
   */
  async getNflPlayoffHistory(teamIds, season, ttlMinutes = 30) {
    try {
      if (!teamIds || teamIds.length === 0 || !season) {
        return { games: [], teamStats: {} };
      }
      
      const cacheKey = `nfl_playoff_history_${teamIds.join('_')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL playoff history for team IDs: ${teamIds.join(', ')} (${season} season)`);
        
        // Fetch playoff games for these teams
        // BDL uses "postseason=true" to filter playoff games
        const params = new URLSearchParams();
        teamIds.forEach(id => params.append('team_ids[]', id));
        params.append('seasons[]', season);
        params.append('postseason', 'true');
        params.append('per_page', '20');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/games?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const games = resp.data?.data || [];
        
        // Filter to completed games only (status === 'Final')
        const completedGames = games.filter(g => g.status === 'Final');
        console.log(`🏈 [Ball Don't Lie] Found ${completedGames.length} completed NFL playoff games`);
        
        if (completedGames.length === 0) {
          return { games: [], teamStats: {} };
        }
        
        // Fetch team stats (box scores) and player stats for each game
        const gameIds = completedGames.map(g => g.id);
        const [teamStats, playerStats] = await Promise.all([
          this.getNflTeamStatsByGameIds(gameIds),
          this.getNflPlayerStatsByGameIds(gameIds)
        ]);
        
        // Determine playoff round for each game
        const gamesWithRound = completedGames.map(game => ({
          ...game,
          playoffRound: this._getPlayoffRound(game)
        }));
        
        // Sort by date (most recent first)
        gamesWithRound.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`🏈 [Ball Don't Lie] NFL playoff history ready: ${gamesWithRound.length} games with box scores and player stats`);
        
        return {
          games: gamesWithRound,
          teamStats: teamStats,
          playerStats: playerStats
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflPlayoffHistory error:', e.message);
      return { games: [], teamStats: {} };
    }
  },

  /**
   * Get NFL team stats (box scores) for specific game IDs
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { homeStats, awayStats }
   */
  async getNflTeamStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_team_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/team_stats?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> { home, away }
        const statsByGame = {};
        for (const stat of stats) {
          const gameId = stat.game?.id;
          if (!gameId) continue;
          
          if (!statsByGame[gameId]) {
            statsByGame[gameId] = {};
          }
          
          // Determine if home or away based on home_away field
          if (stat.home_away === 'home') {
            statsByGame[gameId].home = stat;
          } else if (stat.home_away === 'away') {
            statsByGame[gameId].away = stat;
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved team stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflTeamStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * Get NFL player stats for specific game IDs (for playoff box scores)
   * Returns key performers: QB, leading rusher, top receivers
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { teamId -> { qb, rb, receivers } }
   */
  async getNflPlayerStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_player_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL player stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats?${params.toString()}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> team_id -> key players
        const statsByGame = {};
        
        for (const stat of stats) {
          const gameId = stat.game?.id;
          const teamId = stat.team?.id;
          const teamName = stat.team?.full_name;
          if (!gameId || !teamId) continue;
          
          if (!statsByGame[gameId]) statsByGame[gameId] = {};
          if (!statsByGame[gameId][teamId]) {
            statsByGame[gameId][teamId] = {
              teamName,
              qb: null,
              rushers: [],
              receivers: [],
              defenders: [],
              // Aggregate defensive stats for the team
              teamDefense: {
                sacks: 0,
                interceptions: 0,
                fumbleRecoveries: 0,
                passesDefended: 0,
                tacklesForLoss: 0
              }
            };
          }
          
          const teamStats = statsByGame[gameId][teamId];
          const playerName = `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim();
          
          // QB: has passing attempts
          if (stat.passing_attempts > 0) {
            teamStats.qb = {
              name: playerName,
              completions: stat.passing_completions || 0,
              attempts: stat.passing_attempts || 0,
              yards: stat.passing_yards || 0,
              tds: stat.passing_touchdowns || 0,
              ints: stat.passing_interceptions || 0,
              rushYards: stat.rushing_yards || 0,
              rushAttempts: stat.rushing_attempts || 0,
              fumbles: stat.fumbles_lost || 0
            };
          }
          
          // Rushers: has rushing attempts (non-QB or significant volume)
          if (stat.rushing_attempts > 3 && (!teamStats.qb || playerName !== teamStats.qb.name)) {
            teamStats.rushers.push({
              name: playerName,
              attempts: stat.rushing_attempts || 0,
              yards: stat.rushing_yards || 0,
              tds: stat.rushing_touchdowns || 0,
              fumbles: stat.fumbles_lost || 0
            });
          }
          
          // Receivers: has receptions
          if (stat.receptions > 0) {
            teamStats.receivers.push({
              name: playerName,
              receptions: stat.receptions || 0,
              yards: stat.receiving_yards || 0,
              tds: stat.receiving_touchdowns || 0
            });
          }
          
          // Defensive playmakers: has interceptions, sacks, or significant tackles
          const hasDefensiveStats = (stat.defensive_interceptions > 0) || 
                                   (stat.defensive_sacks > 0) || 
                                   (stat.fumbles_recovered > 0) ||
                                   (stat.total_tackles >= 8);
          
          if (hasDefensiveStats) {
            teamStats.defenders.push({
              name: playerName,
              position: stat.player?.position_abbreviation || stat.player?.position || '?',
              tackles: stat.total_tackles || 0,
              soloTackles: stat.solo_tackles || 0,
              sacks: stat.defensive_sacks || 0,
              interceptions: stat.defensive_interceptions || 0,
              intYards: stat.interception_yards || 0,
              intTds: stat.interception_touchdowns || 0,
              passesDefended: stat.passes_defended || 0,
              tacklesForLoss: stat.tackles_for_loss || 0,
              fumblesRecovered: stat.fumbles_recovered || 0,
              qbHits: stat.qb_hits || 0
            });
          }
          
          // Aggregate team defensive stats
          teamStats.teamDefense.sacks += (stat.defensive_sacks || 0);
          teamStats.teamDefense.interceptions += (stat.defensive_interceptions || 0);
          teamStats.teamDefense.fumbleRecoveries += (stat.fumbles_recovered || 0);
          teamStats.teamDefense.passesDefended += (stat.passes_defended || 0);
          teamStats.teamDefense.tacklesForLoss += (stat.tackles_for_loss || 0);
        }
        
        // Sort and trim for each team
        for (const gameId of Object.keys(statsByGame)) {
          for (const teamId of Object.keys(statsByGame[gameId])) {
            const team = statsByGame[gameId][teamId];
            // Sort rushers by yards, keep top 2
            team.rushers = team.rushers.sort((a, b) => b.yards - a.yards).slice(0, 2);
            // Sort receivers by yards, keep top 3
            team.receivers = team.receivers.sort((a, b) => b.yards - a.yards).slice(0, 3);
            // Sort defenders by impact (INTs > sacks > tackles), keep top 3
            team.defenders = team.defenders.sort((a, b) => {
              // Prioritize INTs, then sacks, then tackles
              const aScore = (a.interceptions * 100) + (a.sacks * 50) + (a.fumblesRecovered * 50) + a.tackles;
              const bScore = (b.interceptions * 100) + (b.sacks * 50) + (b.fumblesRecovered * 50) + b.tackles;
              return bScore - aScore;
            }).slice(0, 3);
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved player stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflPlayerStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * Helper to determine NFL playoff round from game data
   * @param {Object} game - Game object from BDL
   * @returns {string} - Playoff round name
   */
  _getPlayoffRound(game) {
    if (!game || !game.postseason) return 'Regular Season';
    
    const date = new Date(game.date);
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    const week = game.week;
    
    // Super Bowl is typically early February
    if (month === 2 && day >= 1 && day <= 15) return 'Super Bowl';
    
    // Conference Championship is late January (around Jan 25-30)
    if (month === 1 && day >= 24) return 'Conference Championship';
    
    // Divisional Round is mid January (around Jan 16-22)
    if (month === 1 && day >= 16 && day <= 23) return 'Divisional Round';
    
    // Wild Card is early January (around Jan 10-15)
    if (month === 1 && day >= 1 && day <= 15) return 'Wild Card';
    
    // Fallback: use week number if available
    if (week >= 22) return 'Super Bowl';
    if (week >= 21) return 'Conference Championship';
    if (week >= 20) return 'Divisional Round';
    if (week >= 19) return 'Wild Card';
    
    return 'Playoff Game';
  },

  /**
   * Get NBA box scores for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of box score data with full player stats
   */
  async getNbaBoxScores(date, ttlMinutes = 10) {
    try {
      if (!date) return [];
      
      const cacheKey = `nba_box_scores_${date}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/box_scores?date=${date}`;
        console.log(`[Ball Don't Lie] Fetching NBA box scores for ${date}`);
        
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaBoxScores error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA player season stats formatted for props analysis
   * ENHANCED: Now fetches base stats + usage/advanced stats in parallel
   * Returns: pts, reb, ast, stl, blk, fg3m (threes), min + usage_pct, ts_pct, efg_pct, etc.
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - Map of playerId to season stats
   */
  async getNbaPlayerSeasonStatsForProps(playerIds, season) {
    try {
      if (!playerIds || playerIds.length === 0 || !season) {
        return {};
      }

      const uniqueIds = [...new Set(playerIds)].slice(0, 50);
      const cacheKey = `nba_props_season_stats_v2_${season}_${uniqueIds.sort().join(',')}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NBA season stats (base + usage) for ${uniqueIds.length} players (${season} season)...`);
        
        // Fetch base AND usage/advanced stats in parallel for richer context
        const [baseAverages, usageAverages] = await Promise.all([
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            season_type: 'regular',
            player_ids: uniqueIds
          }),
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            season_type: 'regular',
            player_ids: uniqueIds
          })
        ]);

        if ((!baseAverages || baseAverages.length === 0) && (!usageAverages || usageAverages.length === 0)) {
          console.log('[Ball Don\'t Lie] No NBA season averages found');
          return {};
        }

        // Build usage stats lookup by player ID
        const usageMap = {};
        for (const usg of (usageAverages || [])) {
          if (usg.player?.id) {
            usageMap[usg.player.id] = usg.stats || {};
          }
        }
        console.log(`[Ball Don't Lie] Got usage stats for ${Object.keys(usageMap).length} players`);

        // Build map of playerId -> stats (merge base + usage)
        const statsMap = {};
        for (const avg of (baseAverages || [])) {
          if (!avg.player?.id) continue;
          
          const playerId = avg.player.id;
          const stats = avg.stats || {};
          const usage = usageMap[playerId] || {};
          
          statsMap[playerId] = {
            playerId,
            playerName: `${avg.player.first_name} ${avg.player.last_name}`,
            position: avg.player.position,
            season: avg.season,
            // Core stats for props
            ppg: stats.pts?.toFixed(1) || null,
            rpg: stats.reb?.toFixed(1) || null,
            apg: stats.ast?.toFixed(1) || null,
            spg: stats.stl?.toFixed(1) || null,
            bpg: stats.blk?.toFixed(1) || null,
            tpg: stats.fg3m?.toFixed(1) || null, // threes per game
            mpg: stats.min?.toFixed(1) || null,
            fgPct: stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) : null,
            fg3Pct: stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) : null,
            ftPct: stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) : null,
            // Combo stats
            pra: stats.pts && stats.reb && stats.ast ? 
              (stats.pts + stats.reb + stats.ast).toFixed(1) : null,
            prCombo: stats.pts && stats.reb ? (stats.pts + stats.reb).toFixed(1) : null,
            paCombo: stats.pts && stats.ast ? (stats.pts + stats.ast).toFixed(1) : null,
            raCombo: stats.reb && stats.ast ? (stats.reb + stats.ast).toFixed(1) : null,
            // ENHANCED: Usage & Advanced stats for props context
            usagePct: usage.usg_pct ? (usage.usg_pct * 100).toFixed(1) : null,
            trueShooting: usage.ts_pct ? (usage.ts_pct * 100).toFixed(1) : null,
            effectiveFgPct: usage.efg_pct ? (usage.efg_pct * 100).toFixed(1) : null,
            assistPct: usage.ast_pct ? (usage.ast_pct * 100).toFixed(1) : null,
            reboundPct: usage.reb_pct ? (usage.reb_pct * 100).toFixed(1) : null,
            turnoverPct: usage.tov_pct ? (usage.tov_pct * 100).toFixed(1) : null,
            // Team-share percentages (% of team's total in each category)
            pctPts: usage.pct_pts ? (usage.pct_pts * 100).toFixed(1) : null,
            pctFga: usage.pct_fga ? (usage.pct_fga * 100).toFixed(1) : null,
            pctReb: usage.pct_reb ? (usage.pct_reb * 100).toFixed(1) : null,
            pctAst: usage.pct_ast ? (usage.pct_ast * 100).toFixed(1) : null,
            pctFta: usage.pct_fta ? (usage.pct_fta * 100).toFixed(1) : null,
            // Raw values for calculations
            raw: {
              pts: stats.pts,
              reb: stats.reb,
              ast: stats.ast,
              stl: stats.stl,
              blk: stats.blk,
              fg3m: stats.fg3m,
              min: stats.min,
              turnover: stats.turnover,
              // Usage raw
              usg_pct: usage.usg_pct,
              ts_pct: usage.ts_pct,
              efg_pct: usage.efg_pct
            }
          };
        }

        console.log(`[Ball Don't Lie] Got NBA season stats for ${Object.keys(statsMap).length}/${uniqueIds.length} players (with usage data)`);
        const missingIds = uniqueIds.filter(id => !statsMap[id]);
        if (missingIds.length > 0) {
          console.log(`[Ball Don't Lie] Missing season stats for player ID(s): ${missingIds.join(', ')} — likely two-way/inactive`);
        }
        return statsMap;
      }, 30); // Cache for 30 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaPlayerSeasonStatsForProps error:', e.message);
      return {};
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
   * Get NFL player game logs (last N games) for prop analysis
   * Similar to NBA's getNbaPlayerGameLogsBatch - includes consistency, trends, splits
   * @param {Array<number>} playerIds - Array of BDL player IDs
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {number} numGames - Number of recent games to fetch (default 5)
   * @returns {Object} - Map of playerId -> game log data with stats and trends
   */
  async getNflPlayerGameLogsBatch(playerIds, season = null, numGames = 5, ttlMinutes = 15) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return {};
      
      const results = {};
      
      // Fetch game logs for each player in parallel (batch of 5 at a time to avoid rate limits)
      const batchSize = 5;
      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (playerId) => {
          const cacheKey = `nfl_player_game_logs_${playerId}_${season}_${numGames}`;
          
          try {
            const logs = await getCachedOrFetch(cacheKey, async () => {
              // Fetch player's game stats using the stats endpoint
              // NOTE: BDL NFL stats API requires "seasons[]" (array format), not "season"
              // CRITICAL FIX: Must fetch ALL season games (25+) because BDL API returns oldest-first
              // by default. Only then can we sort and get the ACTUAL most recent 5 games.
              const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery({
                player_ids: [playerId],
                seasons: [season], // CRITICAL: Must use seasons[] array format per BDL docs
                per_page: 25 // Fetch full season (17 regular + some extra) to ensure we get ALL games
              })}`;
              
              const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
              // CRITICAL: BDL returns stats oldest-first, so we MUST sort by date DESCENDING
              // to get the actual most recent games (Dec games, not Sept games)
              const allStats = (response.data?.data || [])
                .filter(g => g.game?.date) // Ensure valid date
                .sort((a, b) => new Date(b.game.date) - new Date(a.game.date));
              const gameStats = allStats.slice(0, numGames);
              
              if (gameStats.length === 0) return null;
              
              // Calculate averages and consistency
              const gp = gameStats.length;
              const totals = {
                pass_yds: 0, pass_tds: 0, pass_att: 0, pass_comp: 0, ints: 0,
                rush_yds: 0, rush_att: 0, rush_tds: 0,
                rec_yds: 0, receptions: 0, targets: 0, rec_tds: 0
              };
              
              const gameByGame = gameStats.map(g => {
                const stats = {
                  gameId: g.game?.id,
                  date: g.game?.date || g.game?.datetime,
                  opponent: g.game?.home_team?.id === g.player?.team?.id 
                    ? g.game?.visitor_team?.abbreviation 
                    : g.game?.home_team?.abbreviation,
                  isHome: g.game?.home_team?.id === g.player?.team?.id,
                  pass_yds: g.passing_yards || 0,
                  pass_tds: g.passing_touchdowns || 0,
                  pass_att: g.passing_attempts || 0,
                  pass_comp: g.passing_completions || 0,
                  ints: g.passing_interceptions || 0,
                  rush_yds: g.rushing_yards || 0,
                  rush_att: g.rushing_attempts || 0,
                  rush_tds: g.rushing_touchdowns || 0,
                  rec_yds: g.receiving_yards || 0,
                  receptions: g.receptions || 0,
                  targets: g.receiving_targets || 0,
                  rec_tds: g.receiving_touchdowns || 0
                };
                
                // Accumulate totals
                Object.keys(totals).forEach(k => { totals[k] += stats[k]; });
                
                return stats;
              });
              
              // Calculate averages
              const averages = {};
              Object.keys(totals).forEach(k => {
                averages[k] = gp > 0 ? (totals[k] / gp).toFixed(1) : '0.0';
              });
              
              // Calculate consistency (coefficient of variation - lower = more consistent)
              // For key stats: pass_yds, rush_yds, rec_yds, receptions
              const calcConsistency = (statKey) => {
                const values = gameByGame.map(g => g[statKey]);
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                if (mean === 0) return 1.0;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);
                // Convert CV to consistency score (1 - normalized CV, capped at 0-1)
                const cv = stdDev / mean;
                return Math.max(0, Math.min(1, 1 - cv)).toFixed(2);
              };
              
              const consistency = {
                pass_yds: calcConsistency('pass_yds'),
                rush_yds: calcConsistency('rush_yds'),
                rec_yds: calcConsistency('rec_yds'),
                receptions: calcConsistency('receptions')
              };
              
              // Home/Away splits
              const homeGames = gameByGame.filter(g => g.isHome);
              const awayGames = gameByGame.filter(g => !g.isHome);
              
              const calcSplitAvg = (games, statKey) => {
                if (games.length === 0) return 'N/A';
                return (games.reduce((sum, g) => sum + g[statKey], 0) / games.length).toFixed(1);
              };
              
              const splits = {
                home: {
                  games: homeGames.length,
                  pass_yds: calcSplitAvg(homeGames, 'pass_yds'),
                  rush_yds: calcSplitAvg(homeGames, 'rush_yds'),
                  rec_yds: calcSplitAvg(homeGames, 'rec_yds'),
                  receptions: calcSplitAvg(homeGames, 'receptions')
                },
                away: {
                  games: awayGames.length,
                  pass_yds: calcSplitAvg(awayGames, 'pass_yds'),
                  rush_yds: calcSplitAvg(awayGames, 'rush_yds'),
                  rec_yds: calcSplitAvg(awayGames, 'rec_yds'),
                  receptions: calcSplitAvg(awayGames, 'receptions')
                }
              };
              
              // Determine form trend (compare L2 vs L5)
              let formTrend = 'stable';
              if (gp >= 3) {
                const l2Total = gameByGame.slice(0, 2).reduce((sum, g) => 
                  sum + g.pass_yds + g.rush_yds + g.rec_yds, 0);
                const l5Avg = (totals.pass_yds + totals.rush_yds + totals.rec_yds) / gp;
                const l2Avg = l2Total / 2;
                
                if (l2Avg > l5Avg * 1.15) formTrend = 'hot';
                else if (l2Avg < l5Avg * 0.85) formTrend = 'cold';
              }
              
              // TARGET SHARE TRENDING - Detect usage spikes for WR/TE/RB
              // Compare L2 targets vs L5 average
              let targetTrend = null;
              const targetValues = gameByGame.map(g => g.targets || 0);
              if (targetValues.some(t => t > 0)) {
                const l5TargetsAvg = targetValues.reduce((a, b) => a + b, 0) / gp;
                const l2TargetsAvg = gp >= 2 
                  ? targetValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2 
                  : l5TargetsAvg;
                const l3TargetsAvg = gp >= 3
                  ? targetValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3
                  : l5TargetsAvg;
                
                // Calculate target share trend
                const targetChange = l5TargetsAvg > 0 
                  ? ((l2TargetsAvg - l5TargetsAvg) / l5TargetsAvg * 100).toFixed(0) 
                  : 0;
                
                // Detect spike (L2 avg > L5 avg by 20%+)
                const isSpike = parseFloat(targetChange) >= 20;
                const isDeclining = parseFloat(targetChange) <= -20;
                
                targetTrend = {
                  l5Avg: l5TargetsAvg.toFixed(1),
                  l3Avg: l3TargetsAvg.toFixed(1),
                  l2Avg: l2TargetsAvg.toFixed(1),
                  lastGame: targetValues[0],
                  change: targetChange,
                  trend: isSpike ? 'SPIKE' : isDeclining ? 'DECLINING' : 'STABLE',
                  gameByGame: targetValues.slice(0, 5)
                };
              }
              
              // USAGE TRACKING - Proxy for snap counts using touches + targets
              // Higher total touches = more involvement = likely more snaps
              let usageTrend = null;
              const usageValues = gameByGame.map(g => 
                (g.targets || 0) + (g.rush_att || 0) + (g.receptions || 0)
              );
              if (usageValues.some(u => u > 0)) {
                const l5UsageAvg = usageValues.reduce((a, b) => a + b, 0) / gp;
                const l2UsageAvg = gp >= 2 
                  ? usageValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2 
                  : l5UsageAvg;
                
                const usageChange = l5UsageAvg > 0 
                  ? ((l2UsageAvg - l5UsageAvg) / l5UsageAvg * 100).toFixed(0) 
                  : 0;
                
                // Categorize usage level
                let usageLevel = 'LOW';
                if (l5UsageAvg >= 15) usageLevel = 'ELITE';
                else if (l5UsageAvg >= 10) usageLevel = 'HIGH';
                else if (l5UsageAvg >= 5) usageLevel = 'MODERATE';
                
                usageTrend = {
                  l5Avg: l5UsageAvg.toFixed(1),
                  l2Avg: l2UsageAvg.toFixed(1),
                  lastGame: usageValues[0],
                  change: usageChange,
                  level: usageLevel,
                  trend: parseFloat(usageChange) >= 15 ? 'INCREASING' : 
                         parseFloat(usageChange) <= -15 ? 'DECREASING' : 'STABLE',
                  gameByGame: usageValues.slice(0, 5)
                };
              }
              
              return {
                gamesAnalyzed: gp,
                games: gameByGame,
                averages,
                consistency,
                splits,
                formTrend,
                targetTrend, // NEW: Target share trending
                usageTrend,  // NEW: Usage/touch tracking (snap count proxy)
                lastGame: gameByGame[0] || null
              };
            }, ttlMinutes);
            
            if (logs) results[playerId] = logs;
          } catch (e) {
            console.warn(`[Ball Don't Lie] NFL game logs fetch failed for player ${playerId}:`, e.message);
          }
        }));
      }
      
      console.log(`[Ball Don't Lie] NFL game logs: fetched for ${Object.keys(results).length}/${playerIds.length} players`);
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflPlayerGameLogsBatch error:', e.message);
      return {};
    }
  },

  /**
   * Get the starting QB from team roster/depth chart (PREFERRED METHOD)
   * Uses BDL's /teams/<ID>/roster endpoint which has depth chart positions
   * depth=1 is the starter, depth=2 is backup, etc.
   * Also checks injury_status to automatically promote backup if starter is out
   * 
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {string} sportKey - Sport key ('americanfootball_nfl' or 'americanfootball_ncaaf')
   * @returns {Object|null} - { id, name, firstName, lastName, team, depth, injuryStatus, isBackup }
   */
  async getStartingQBFromDepthChart(teamId, season = null, sportKey = 'americanfootball_nfl') {
    // Calculate dynamic NFL/NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return null;
      
      // Get the team roster with depth chart - use correct roster function for sport
      const isNCAAF = sportKey === 'americanfootball_ncaaf' || sportKey === 'NCAAF';
      let roster;
      if (isNCAAF) {
        // NCAAF uses getNcaafTeamPlayers (BDL doesn't have depth chart for NCAAF)
        roster = await this.getNcaafTeamPlayers(teamId);
      } else {
        // NFL has proper depth chart roster
        roster = await this.getNflTeamRoster(teamId, season);
      }
      if (!roster || roster.length === 0) {
        console.warn(`[Ball Don't Lie] No roster data for team ${teamId}`);
        return null;
      }
      
      // Filter to QBs only
      const qbs = roster.filter(entry => 
        entry.position === 'QB' || 
        entry.player?.position_abbreviation === 'QB' ||
        entry.player?.position === 'Quarterback'
      );
      
      if (qbs.length === 0) {
        console.warn(`[Ball Don't Lie] No QBs found in roster for team ${teamId}`);
        return null;
      }
      
      // Sort by depth (1 = starter, 2 = backup, 3 = 3rd string, etc.)
      qbs.sort((a, b) => (a.depth || 99) - (b.depth || 99));
      
      // Injury statuses that mean the player is OUT
      // BDL uses single-letter codes: "O" = Out, "D" = Doubtful, "Q" = Questionable, "IR" = Injured Reserve
      const isOut = (status) => {
        if (!status) return false;
        const s = status.toLowerCase().trim();
        // Single letter codes
        if (s === 'o' || s === 'd' || s === 'ir') return true;
        // Full word matches
        return s.includes('out') || s.includes('ir') || s.includes('injured reserve') || 
               s.includes('doubtful') || s.includes('pup');
      };
      
      // Find the first HEALTHY QB in the depth chart
      // Iterate through depth=1, depth=2, depth=3, etc. until we find one not injured
      let selectedQB = null;
      let isBackupStarting = false;
      const injuredQBs = [];
      
      for (const qb of qbs) {
        const qbName = `${qb.player?.first_name} ${qb.player?.last_name}`;
        
        if (isOut(qb.injury_status)) {
          injuredQBs.push({ name: qbName, status: qb.injury_status, depth: qb.depth });
          console.log(`[Ball Don't Lie] ⚠️ Depth ${qb.depth} QB ${qbName} is ${qb.injury_status} - checking next`);
          continue;
        }
        
        // Found a healthy (or at least not OUT) QB
        selectedQB = qb;
        isBackupStarting = qb.depth > 1;
        
        if (isBackupStarting) {
          const depthLabel = qb.depth === 2 ? 'Backup' : `${qb.depth}${qb.depth === 3 ? 'rd' : 'th'} String`;
          console.log(`[Ball Don't Lie] ✓ Using ${depthLabel} QB: ${qbName} (depth=${qb.depth})`);
        }
        break;
      }
      
      // If no healthy QB found, log all injured and use the top of depth chart anyway
      if (!selectedQB) {
        console.log(`[Ball Don't Lie] ⚠️ All QBs appear injured:`, injuredQBs.map(q => `${q.name} (${q.status})`).join(', '));
        selectedQB = qbs[0]; // Use depth=1 even if injured
        console.log(`[Ball Don't Lie] ⚠️ Using depth=1 ${selectedQB?.player?.first_name} ${selectedQB?.player?.last_name} despite injury`);
      }
      
      if (!selectedQB) {
        console.warn(`[Ball Don't Lie] Could not determine starting QB for team ${teamId}`);
        return null;
      }
      
      const player = selectedQB.player;
      const result = {
        id: player?.id,
        firstName: player?.first_name,
        lastName: player?.last_name,
        name: `${player?.first_name} ${player?.last_name}`,
        position: player?.position || 'Quarterback',
        positionAbbr: player?.position_abbreviation || 'QB',
        team: player?.team?.full_name || player?.team?.name,
        teamAbbr: player?.team?.abbreviation,
        teamId: teamId,
        jerseyNumber: player?.jersey_number,
        college: player?.college,
        experience: player?.experience,
        age: player?.age,
        depth: selectedQB.depth,
        injuryStatus: selectedQB.injury_status,
        isBackup: isBackupStarting,
        // Note: Depth chart doesn't have stats - need to fetch separately
        passingYards: null,
        passingTds: null,
        gamesPlayed: null
      };
      
      const statusLabel = isBackupStarting ? 'BACKUP Starting QB' : 'Starting QB';
      const injuryNote = selectedQB.injury_status ? ` (${selectedQB.injury_status})` : '';
      console.log(`[Ball Don't Lie] ${statusLabel} from depth chart for team ${teamId}: ${result.name}${injuryNote}`);
      
      return result;
    } catch (e) {
      console.error(`[Ball Don't Lie] getStartingQBFromDepthChart error for team ${teamId}:`, e.message);
      return null;
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
   * NCAAB player game logs - returns actual per-game box scores
   * Uses /ncaab/v1/player_stats with player_ids[] and date filtering
   * @param {number} playerId - BDL player ID
   * @param {number} numGames - Number of recent games to fetch
   * @returns {Promise<Object|null>} - Per-game stats with averages, consistency, splits, trends
   */
  async getNcaabPlayerGameLogs(playerId, numGames = 10) {
    try {
      if (!playerId) return null;

      const cacheKey = `ncaab_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch last 45 days of per-game stats to capture enough games (NCAAB ~2-3 games/week)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 45);

        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/player_stats${buildQuery({
          player_ids: [playerId],
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate.toISOString().slice(0, 10),
          per_page: 50
        })}`;

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const allStats = response.data?.data || [];
        if (allStats.length === 0) {
          console.log(`[Ball Don't Lie] No NCAAB per-game stats found for player ${playerId}`);
          return null;
        }

        // Filter for games where player actually played and sort by date (most recent first)
        const games = allStats
          .filter(g => g.min && parseInt(g.min) > 0)
          .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => ({
          date: g.game?.date,
          opponent: g.game?.home_team?.id === g.team?.id
            ? (g.game?.visitor_team?.name || g.game?.visitor_team?.full_name || 'OPP')
            : (g.game?.home_team?.name || g.game?.home_team?.full_name || 'OPP'),
          isHome: g.game?.home_team?.id === g.team?.id,
          pts: g.pts || 0,
          reb: g.reb || ((g.oreb || 0) + (g.dreb || 0)),
          ast: g.ast || 0,
          stl: g.stl || 0,
          blk: g.blk || 0,
          fg3m: g.fg3m || 0,
          fgm: g.fgm || 0,
          fga: g.fga || 0,
          min: parseInt(g.min) || 0,
          pra: (g.pts || 0) + (g.reb || ((g.oreb || 0) + (g.dreb || 0))) + (g.ast || 0),
          turnover: g.turnover || 0
        }));

        // Calculate averages
        const gp = gameStats.length;
        const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3m: 0, min: 0, pra: 0 };
        for (const g of gameStats) {
          totals.pts += g.pts;
          totals.reb += g.reb;
          totals.ast += g.ast;
          totals.stl += g.stl;
          totals.blk += g.blk;
          totals.fg3m += g.fg3m;
          totals.min += g.min;
          totals.pra += g.pra;
        }
        const avgs = {
          pts: totals.pts / gp,
          reb: totals.reb / gp,
          ast: totals.ast / gp,
          stl: totals.stl / gp,
          blk: totals.blk / gp,
          fg3m: totals.fg3m / gp,
          min: totals.min / gp,
          pra: totals.pra / gp
        };

        // Standard deviations for consistency
        const calcStdDev = (values, mean) => {
          const sqDiffs = values.map(v => Math.pow(v - mean, 2));
          return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
        };
        const stdDevs = {
          pts: calcStdDev(gameStats.map(g => g.pts), avgs.pts),
          reb: calcStdDev(gameStats.map(g => g.reb), avgs.reb),
          ast: calcStdDev(gameStats.map(g => g.ast), avgs.ast),
          fg3m: calcStdDev(gameStats.map(g => g.fg3m), avgs.fg3m),
          pra: calcStdDev(gameStats.map(g => g.pra), avgs.pra)
        };

        // Consistency scores (1 - CV)
        const consistency = {
          pts: avgs.pts > 0 ? Math.max(0, 1 - (stdDevs.pts / avgs.pts)).toFixed(2) : '0.00',
          reb: avgs.reb > 0 ? Math.max(0, 1 - (stdDevs.reb / avgs.reb)).toFixed(2) : '0.00',
          ast: avgs.ast > 0 ? Math.max(0, 1 - (stdDevs.ast / avgs.ast)).toFixed(2) : '0.00',
          fg3m: avgs.fg3m > 0 ? Math.max(0, 1 - (stdDevs.fg3m / avgs.fg3m)).toFixed(2) : '0.00',
          pra: avgs.pra > 0 ? Math.max(0, 1 - (stdDevs.pra / avgs.pra)).toFixed(2) : '0.00'
        };

        // Home/away splits
        const homeGames = gameStats.filter(g => g.isHome);
        const awayGames = gameStats.filter(g => !g.isHome);
        const splits = {
          home: homeGames.length > 0 ? {
            games: homeGames.length,
            pts: (homeGames.reduce((s, g) => s + g.pts, 0) / homeGames.length).toFixed(1),
            reb: (homeGames.reduce((s, g) => s + g.reb, 0) / homeGames.length).toFixed(1),
            ast: (homeGames.reduce((s, g) => s + g.ast, 0) / homeGames.length).toFixed(1)
          } : null,
          away: awayGames.length > 0 ? {
            games: awayGames.length,
            pts: (awayGames.reduce((s, g) => s + g.pts, 0) / awayGames.length).toFixed(1),
            reb: (awayGames.reduce((s, g) => s + g.reb, 0) / awayGames.length).toFixed(1),
            ast: (awayGames.reduce((s, g) => s + g.ast, 0) / awayGames.length).toFixed(1)
          } : null
        };

        // Form trend (L2 vs L5 composite)
        const formTrend = (() => {
          if (gameStats.length < 5) return 'neutral';
          const composite = g => g.pts + g.reb + g.ast;
          const l2Avg = gameStats.slice(0, 2).reduce((s, g) => s + composite(g), 0) / 2;
          const l5Avg = gameStats.slice(0, 5).reduce((s, g) => s + composite(g), 0) / 5;
          if (l2Avg > l5Avg * 1.15) return 'hot';
          if (l2Avg < l5Avg * 0.85) return 'cold';
          return 'stable';
        })();

        console.log(`[Ball Don't Lie] Got ${gp} NCAAB game logs for player ${playerId}: ${avgs.pts.toFixed(1)} PPG`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: gameStats,
          averages: {
            pts: avgs.pts.toFixed(1),
            reb: avgs.reb.toFixed(1),
            ast: avgs.ast.toFixed(1),
            stl: avgs.stl.toFixed(1),
            blk: avgs.blk.toFixed(1),
            fg3m: avgs.fg3m.toFixed(1),
            min: avgs.min.toFixed(1),
            pra: avgs.pra.toFixed(1)
          },
          stdDevs: {
            pts: stdDevs.pts.toFixed(1),
            reb: stdDevs.reb.toFixed(1),
            ast: stdDevs.ast.toFixed(1),
            fg3m: stdDevs.fg3m.toFixed(1),
            pra: stdDevs.pra.toFixed(1)
          },
          consistency,
          splits,
          lastGame: gameStats[0] || null,
          formTrend
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * NCAAF player season stats (single season, optional player filter)
   */
  async getNcaafPlayerSeasonStats({ playerIds, playerId, teamIds, teamId, season } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      if ((!pidArr || pidArr.length === 0) && (!tidArr || tidArr.length === 0)) {
        return [];
      }
      const cacheKey = `ncaaf_player_season_stats_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const query = { season, per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) {
          query['player_ids[]'] = pidArr.slice(0, 100);
        }
        if (Array.isArray(tidArr) && tidArr.length) {
          query['team_ids[]'] = tidArr.slice(0, 100);
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_season_stats${buildQuery(query)}`;
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
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getTeams not supported');

        const qs = Object.keys(params).length > 0 ? buildQuery(params) : '';
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
          basketball_nba: 'nba/v1/teams',
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
          basketball_nba: 'nba/v1/games',
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
        // ⭐ FIX: Return array consistently (matching SDK behavior)
        // Most code expects getGames to return an array, not {data, meta}
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getGames error:`, e.message);
      throw e; // Don't swallow — let the runner distinguish outages from "no games"
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
          icehockey_nhl: 'nhl/v1/player_stats/leaders' // NHL uses leaders endpoint with type param
        };
        const path = endpointMap[sportKey];
        if (!path) {
          throw new Error('player stats not supported for this sport');
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Always return data array, not object with data/meta
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayerStats error:`, e.message);
      return [];
    }
  },

  /**
   * Fetch REAL team-level advanced stats from BDL team_season_averages endpoint.
   * Returns: { off_rating, def_rating, net_rating, pace, efg_pct, ts_pct, oreb_pct, dreb_pct, tm_tov_pct, gp, w, l, ... }
   * This is the CORRECT source for team ORtg/DRtg/NetRtg (NOT player weight-averaging).
   */
  async getTeamSeasonAdvanced(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_season_advanced_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=advanced&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level opponent stats from BDL team_season_averages endpoint.
   * Returns: { opp_fgm, opp_fga, opp_fg_pct, opp_fg3m, opp_fg3a, opp_fg3_pct, opp_ftm, opp_fta, opp_ft_pct,
   *            opp_pts, opp_reb, opp_oreb, opp_dreb, opp_ast, opp_tov, opp_stl, opp_blk, gp, ... }
   * This is the CORRECT source for opponent shooting/turnover/FT data (NOT proxy via DRtg or steals).
   */
  async getTeamOpponentStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_opponent_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=opponent&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level defense stats from BDL team_season_averages endpoint.
   * Returns: { opp_pts_paint, opp_pts_fb, opp_pts_off_tov, opp_pts_2nd_chance, ... }
   * This gives paint defense, fast break points allowed, etc.
   */
  async getTeamDefenseStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_defense_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=defense&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level base stats from BDL team_season_averages endpoint.
   * Returns: { pts, reb, ast, fg_pct, fg3_pct, ft_pct, fgm, fga, fg3m, fg3a, ftm, fta, oreb, dreb, tov, blk, stl, pf, gp, ... }
   * This is the CORRECT source for team-level shooting/counting stats (NOT player aggregation).
   */
  async getTeamBaseStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_base_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=base&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Fetch REAL team-level scoring stats from BDL team_season_averages endpoint.
   * Returns: { pct_pts_paint, pct_pts_3pt, pct_pts_ft, pct_pts_2pt, pct_pts_fb, pct_fga_2pt, pct_fga_3pt, pct_ast_fgm, pct_uast_fgm, ... }
   * This is the CORRECT source for team scoring distribution (NOT player weight-averaging).
   */
  async getTeamScoringStats(teamId, season, ttlMinutes = 30) {
    const cacheKey = `nba_team_scoring_stats_${teamId}_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=scoring&team_ids[]=${teamId}`;
      const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
      const data = response.data?.data;
      if (!data || data.length === 0) return null;
      return data[0].stats;
    }, ttlMinutes);
  },

  /**
   * Compute L5 team efficiency from player-level box score stats.
   * Returns efficiency metrics (eFG%, TS%, approx ORtg/DRtg/Net Rating) plus
   * per-game player participation for roster context.
   * Supports NBA and NCAAB (both have per-game player_stats endpoints).
   */
  async getTeamL5Efficiency(teamId, gameIds, sportKey = 'basketball_nba', ttlMinutes = 10) {
    try {
      if (!teamId || !gameIds || gameIds.length === 0) return null;

      const endpointMap = {
        basketball_nba: 'nba/v1/stats',
        basketball_ncaab: 'ncaab/v1/player_stats'
      };
      const endpoint = endpointMap[sportKey];
      if (!endpoint) return null;

      const cacheKey = `${sportKey}_l5_efficiency_${teamId}_${gameIds.sort().join('_')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch all player stats for these game IDs — must paginate (max 100/page, ~36 rows/game)
        let stats = [];
        let cursor = null;
        for (let page = 0; page < 5; page++) { // Safety cap: 5 pages max
          const params = { game_ids: gameIds, per_page: 100 };
          if (cursor) params.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/${endpoint}${buildQuery(params)}`;
          const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
          const pageData = response.data?.data || [];
          stats = stats.concat(pageData);
          cursor = response.data?.meta?.next_cursor;
          if (!cursor || pageData.length === 0) break;
        }

        if (stats.length === 0) return null;

        // Separate team vs opponent stats + track per-game player participation
        const teamTotals = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 0, oreb: 0, tov: 0, games: new Set() };
        const oppTotals = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pts: 0, oreb: 0, tov: 0, games: new Set() };
        const playersByGame = {}; // gameId → [{ name, playerId, minutes }]

        for (const s of stats) {
          const statTeamId = s.team?.id;
          const isTeam = statTeamId === teamId;
          const target = isTeam ? teamTotals : oppTotals;

          target.fgm += s.fgm || 0;
          target.fga += s.fga || 0;
          target.fg3m += s.fg3m || 0;
          target.fg3a += s.fg3a || 0;
          target.ftm += s.ftm || 0;
          target.fta += s.fta || 0;
          target.pts += s.pts || 0;
          target.oreb += s.oreb || 0;
          target.tov += s.turnover || 0;
          target.games.add(s.game?.id);

          // Track who played per game (team players only)
          if (isTeam) {
            const mins = parseInt(s.min) || 0;
            if (mins > 0) {
              const gid = s.game?.id;
              if (!playersByGame[gid]) playersByGame[gid] = [];
              playersByGame[gid].push({
                name: `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.trim(),
                playerId: s.player?.id,
                minutes: mins
              });
            }
          }
        }

        const gp = teamTotals.games.size;
        if (gp === 0 || teamTotals.fga === 0) return null;

        // Estimate possessions: FGA + 0.44*FTA - OREB + TOV
        const possEst = teamTotals.fga + 0.44 * teamTotals.fta - teamTotals.oreb + teamTotals.tov;
        const oppPossEst = oppTotals.fga + 0.44 * oppTotals.fta - oppTotals.oreb + oppTotals.tov;

        return {
          efficiency: {
            games: gp,
            efg_pct: teamTotals.fga > 0 ? ((teamTotals.fgm + 0.5 * teamTotals.fg3m) / teamTotals.fga * 100).toFixed(1) : null,
            ts_pct: teamTotals.fga > 0 ? (teamTotals.pts / (2 * (teamTotals.fga + 0.44 * teamTotals.fta)) * 100).toFixed(1) : null,
            approx_ortg: possEst > 0 ? (teamTotals.pts / possEst * 100).toFixed(1) : null,
            approx_drtg: oppPossEst > 0 ? (oppTotals.pts / oppPossEst * 100).toFixed(1) : null,
            approx_net_rtg: (possEst > 0 && oppPossEst > 0) ? ((teamTotals.pts / possEst * 100) - (oppTotals.pts / oppPossEst * 100)).toFixed(1) : null,
            ppg: (teamTotals.pts / gp).toFixed(1),
            opp_ppg: (oppTotals.pts / gp).toFixed(1),
            opp_efg_pct: oppTotals.fga > 0 ? ((oppTotals.fgm + 0.5 * oppTotals.fg3m) / oppTotals.fga * 100).toFixed(1) : null,
            opp_fg3_pct: oppTotals.fg3a > 0 ? (oppTotals.fg3m / oppTotals.fg3a * 100).toFixed(1) : null,
            tov_per_game: (teamTotals.tov / gp).toFixed(1)
          },
          playersByGame
        };
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getTeamL5Efficiency error for team ${teamId}:`, e.message);
      return null;
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
      // NCAAB/NCAAF standings require conference_id — use getNcaabStandings() instead
      if (sportKey === 'basketball_ncaab' || sportKey === 'americanfootball_ncaaf') {
        return [];
      }
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
        // BDL returns array of {name, value} pairs - convert to flat object for consistency
        if (sportKey === 'icehockey_nhl') {
          const url = `https://api.balldontlie.io/nhl/v1/teams/${encodeURIComponent(teamId)}/season_stats${buildQuery({ season, postseason })}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          const statsArray = Array.isArray(json?.data) ? json.data : [];
          
          // Convert [{name: 'goals_for_per_game', value: 3.1}, ...] to {goals_for_per_game: 3.1, ...}
          // This makes it consistent with other sports and easier to access in Tale of the Tape
          const statsObject = {};
          for (const stat of statsArray) {
            if (stat.name && stat.value !== undefined) {
              statsObject[stat.name] = stat.value;
            }
          }
          console.log(`[Ball Don't Lie] NHL team ${teamId} season stats: ${Object.keys(statsObject).length} fields loaded`);
          return statsObject;
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
   * Team season stats - generic batch version for multiple team IDs
   * More flexible API that matches the MCP function signature
   * NFL: /nfl/v1/team_season_stats?team_ids[]=X&team_ids[]=Y&season=XXXX
   */
  async getTeamSeasonStatsGeneric(sportKey, { team_ids = [], season, postseason = false } = {}, ttlMinutes = 30) {
    try {
      if (!team_ids || team_ids.length === 0 || !season) {
        return [];
      }
      
      const cacheKey = `${sportKey}_team_season_stats_batch_${team_ids.join('_')}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Build query with team_ids array
        const params = new URLSearchParams();
        team_ids.forEach(id => params.append('team_ids[]', id));
        params.append('season', season);
        if (postseason) params.append('postseason', 'true');
        
        let endpoint = null;
        if (sportKey === 'americanfootball_nfl') {
          endpoint = 'nfl/v1/team_season_stats';
        } else if (sportKey === 'americanfootball_ncaaf') {
          endpoint = 'ncaaf/v1/team_season_stats';
        } else if (sportKey === 'basketball_ncaab') {
          endpoint = 'ncaab/v1/team_season_stats';
        } else {
          console.warn(`[Ball Don't Lie] getTeamSeasonStatsGeneric not supported for ${sportKey}`);
          return [];
        }
        
        const url = `https://api.balldontlie.io/${endpoint}?${params.toString()}`;
        console.log(`[Ball Don't Lie] Fetching team season stats: ${url}`);
        
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamSeasonStatsGeneric error:`, e.message);
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
   * Rankings endpoints (NCAAB) via HTTP fallback
   * Returns AP and Coaches poll rankings
   */
  async getRankingsGeneric(sportKey, { season, week } = {}, ttlMinutes = 30) {
    try {
      const cacheKey = `${sportKey}_rankings_${season}_${week || 'latest'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Only NCAAB has rankings endpoint
        if (sportKey !== 'basketball_ncaab') {
          console.log(`[Ball Don't Lie] Rankings not available for ${sportKey}`);
          return [];
        }
        const params = { season };
        if (week) params.week = week;
        const url = `https://api.balldontlie.io/ncaab/v1/rankings${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getRankings error:`, e.message);
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
          americanfootball_nfl: 'nfl/v1/player_injuries',
          icehockey_nhl: 'nhl/v1/player_injuries'
        };
        const path = endpointMap[sportKey];
        if (!path) {
          // NCAAF/NCAAB: Return empty silently - Gemini Grounding provides opt-out/injury context
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
   * Get NHL League Ranks for key stats
   */
  async getNhlLeagueRanks(season) {
    try {
      const cacheKey = `nhl_league_ranks_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch leaders for PP%, PK%, Goals For, Goals Against
        const statTypes = [
          { type: 'power_play_percentage', key: 'pp_rank' },
          { type: 'penalty_kill_percentage', key: 'pk_rank' },
          { type: 'goals_for_per_game', key: 'gf_rank' },
          { type: 'goals_against_per_game', key: 'ga_rank' }
        ];

        const allRanks = {}; // { teamId: { pp_rank: 1, ... } }

        await Promise.all(statTypes.map(async ({ type, key }) => {
          const leaders = await this.getLeadersGeneric('icehockey_nhl_team', { season, type, per_page: 32 });
          leaders.forEach((l, index) => {
            if (!l.team?.id) return;
            if (!allRanks[l.team.id]) allRanks[l.team.id] = {};
            allRanks[l.team.id][key] = index + 1;
          });
        }));

        return allRanks;
      }, 120); // Cache for 2 hours
    } catch (e) {
      console.error(`[Ball Don't Lie] getNhlLeagueRanks error:`, e.message);
      return {};
    }
  },

  /**
   * Initialize the service
   */
  initialize() {
    if (!API_KEY) {
      console.warn('[BDL] No API key found — set BALLDONTLIE_API_KEY');
      return;
    }
    const client = initApi();
    if (!client) {
      console.warn('[BDL] Client initialization failed');
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
   * Get NBA player injuries for current playoff teams
   * @param {Array} teamIds - Array of team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNbaPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nba_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);
        
        // ⭐ SDK has bug with team_ids parameter - use HTTP fallback
        // Error: "Cannot read properties of null (reading 'toString')"
        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;
        
        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }
          
          const url = `https://api.balldontlie.io/v1/player_injuries?${params.toString()}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          
          if (!resp.ok) {
            console.error(`🏀 Injuries API error: HTTP ${resp.status}`);
            break;
          }
          
          const json = await resp.json().catch(() => ({}));
          const injuries = Array.isArray(json.data) ? json.data : [];
          allInjuries.push(...injuries);
          
          cursor = json.meta?.next_cursor;
          page++;
          
          if (page > maxPages) {
            console.warn(`🏀 Hit max pages (${maxPages}) for injuries - stopping pagination`);
            break;
          }
        } while (cursor);
        
        console.log(`🏀 Found ${allInjuries.length} player injuries (${page - 1} pages)`);
        
        // ⭐ Log OUT and DOUBTFUL players for debugging
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');
        const doubtfulPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DOUBTFUL');
        const questionablePlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'QUESTIONABLE');
        
        if (outPlayers.length > 0) {
          console.log(`🏀 OUT (${outPlayers.length}): ${outPlayers.slice(0, 10).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 10 ? '...' : ''}`);
        }
        if (doubtfulPlayers.length > 0) {
          console.log(`🏀 DOUBTFUL (${doubtfulPlayers.length}): ${doubtfulPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
        }
        if (questionablePlayers.length > 0) {
          console.log(`🏀 QUESTIONABLE (${questionablePlayers.length}): ${questionablePlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${questionablePlayers.length > 5 ? '...' : ''}`);
        }
        
        return allInjuries;
      }, 2); // Cache for 2 minutes — injury status changes rapidly on game day
    } catch (error) {
      console.error('Error fetching NBA player injuries:', error);
      return [];
    }
  },

  /**
   * Get NFL player injuries from BDL (official practice report data)
   * @param {Array} teamIds - Array of NFL team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data with status (Questionable/Doubtful/Out)
   */
  async getNflPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nfl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 Fetching NFL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        // Use HTTP endpoint directly (SDK may have issues)
        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/player_injuries?${params.toString()}`;
          console.log(`🏈 Fetching NFL player injuries (page ${page})`);

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏈 Found ${allInjuries.length} NFL player injuries (${page - 1} pages)`);

        // Log injury breakdown
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');
        const doubtfulPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DOUBTFUL');
        const questionablePlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'QUESTIONABLE');

        if (outPlayers.length > 0) {
          console.log(`🏈 OUT (${outPlayers.length}): ${outPlayers.slice(0, 10).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 10 ? '...' : ''}`);
        }
        if (doubtfulPlayers.length > 0) {
          console.log(`🏈 DOUBTFUL (${doubtfulPlayers.length}): ${doubtfulPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${doubtfulPlayers.length > 5 ? '...' : ''}`);
        }
        if (questionablePlayers.length > 0) {
          console.log(`🏈 QUESTIONABLE (${questionablePlayers.length}): ${questionablePlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${questionablePlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes - NFL injury reports update less frequently than NBA
    } catch (error) {
      console.error('Error fetching NFL player injuries:', error);
      return [];
    }
  },

  /**
   * Get NHL Player Injuries from BDL
   * Endpoint: GET https://api.balldontlie.io/nhl/v1/player_injuries
   * Returns: player info, status, injury_type, return_date, comment
   *
   * IMPORTANT FOR INJURY INTERPRETATION:
   * - Use return_date to determine if injury is FRESH (0-3 days) or PRICED IN (>3 days)
   * - status: IR, IR-LT, IR-NR, DTD, OUT, LTIR
   * - comment contains detailed injury description
   *
   * @param {Array} teamIds - Array of NHL team IDs to filter (optional)
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNhlPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nhl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/player_injuries?${params.toString()}`;
          console.log(`🏒 Fetching NHL player injuries (page ${page})`);

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏒 Found ${allInjuries.length} NHL player injuries (${page - 1} pages)`);

        // Log injury breakdown by status
        const irPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR');
        const irLtPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR-LT' || i.status?.toUpperCase() === 'LTIR');
        const dtdPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DTD' || i.status?.toUpperCase() === 'DAY-TO-DAY');
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');

        if (irPlayers.length > 0) {
          console.log(`🏒 IR (${irPlayers.length}): ${irPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irPlayers.length > 5 ? '...' : ''}`);
        }
        if (irLtPlayers.length > 0) {
          console.log(`🏒 IR-LT/LTIR (${irLtPlayers.length}): ${irLtPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irLtPlayers.length > 5 ? '...' : ''}`);
        }
        if (dtdPlayers.length > 0) {
          console.log(`🏒 DTD (${dtdPlayers.length}): ${dtdPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${dtdPlayers.length > 5 ? '...' : ''}`);
        }
        if (outPlayers.length > 0) {
          console.log(`🏒 OUT (${outPlayers.length}): ${outPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      console.error('Error fetching NHL player injuries:', error);
      return [];
    }
  },

  /**
   * Get advanced stats - supports filtering by game_ids, player_ids, seasons
   * @param {Object|Array} options - Options object or legacy array of game IDs
   * @param {Array} options.game_ids - Array of game IDs
   * @param {Array} options.player_ids - Array of player IDs
   * @param {Array} options.seasons - Array of seasons
   * @param {number} options.per_page - Results per page (default 25)
   * @returns {Promise<Array>} - Array of advanced stats
   */
  async getNbaAdvancedStats(options = {}) {
    try {
      // Handle legacy call format (just an array of game IDs)
      if (Array.isArray(options)) {
        options = { game_ids: options };
      }

      const { game_ids = [], player_ids = [], seasons = [], per_page = 25 } = options;
      const cacheKey = `nba_advanced_stats_g${game_ids.join('_')}_p${player_ids.join('_')}_s${seasons.join('_')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA advanced stats - games: ${game_ids.length}, players: ${player_ids.length}, seasons: ${seasons.length}`);
        const client = initApi();

        const params = { per_page };
        if (game_ids.length > 0) params.game_ids = game_ids;
        if (player_ids.length > 0) params.player_ids = player_ids;
        if (seasons.length > 0) params.seasons = seasons;

        const response = await client.nba.getAdvancedStats(params);

        return response.data || [];
      }, 10); // 10 min cache
    } catch (error) {
      console.error('Error fetching NBA advanced stats:', error);
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
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? season : season - 1;
    
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
   * Get NHL team standings for current season
   * Uses BDL's /nhl/v1/standings endpoint
   * @param {number} season - Season year (defaults to current NHL season)
   * @returns {Promise<Array>} - Array of team standings with points, record, streaks
   */
  async getNhlStandings(season = getCurrentNhlSeason()) {
    try {
      const cacheKey = `nhl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL standings for ${season} season`);
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/standings${buildQuery({ season })}`;
        const response = await axios.get(url, { headers: { Authorization: API_KEY } });
        
        return response.data?.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error('Error fetching NHL standings:', error.message);
      return [];
    }
  },

  // ==================== NHL PLAYER PROPS (BDL API) ====================

  /**
   * Get NHL player props from Ball Don't Lie API
   * Supports: goals, assists, points, shots_on_goal, saves, power_play_points, anytime_goal, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNhlPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NHL player props requires game_id');
        return [];
      }

      const cacheKey = `nhl_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching NHL player props: ${url}`);
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NHL player props for game ${gameId}`);
        return props;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NHL player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NHL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NHL game objects with IDs
   */
  async getNhlGamesForDate(dateStr) {
    try {
      const cacheKey = `nhl_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NHL games for ${dateStr}`);
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NHL games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NHL players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNhlPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};
      
      // Dedupe and limit
      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nhl_players_${uniqueIds.sort().join(',')}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NHL players`);
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const players = response.data?.data || [];
        
        // Build lookup map
        const playerMap = {};
        for (const player of players) {
          playerMap[player.id] = {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position_code,
            team: player.teams?.[0]?.full_name || 'Unknown'
          };
        }
        
        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NHL player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes (player names don't change)
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL players error:`, error?.response?.data || error.message);
      return {};
    }
  },

  /**
   * Get NHL player season stats for a specific player
   * Endpoint: GET /nhl/v1/players/:id/season_stats?season=YYYY
   * Returns: goals, assists, points, shots, time_on_ice_per_game, power_play_points, etc.
   * @param {number} playerId - BDL player ID
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - Player season stats as key-value object
   */
  async getNhlPlayerSeasonStats(playerId, season) {
    try {
      if (!playerId || !season) {
        console.warn('[Ball Don\'t Lie] NHL player season stats requires playerId and season');
        return null;
      }

      const cacheKey = `nhl_player_season_stats_${playerId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${playerId}/season_stats?season=${season}`;
        console.log(`[Ball Don't Lie] Fetching NHL player season stats: ${url}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const statsArray = response.data?.data || [];
        
        // Convert array of {name, value} to object for easier access
        const statsObj = { playerId, season };
        for (const stat of statsArray) {
          if (stat.name && stat.value !== undefined) {
            statsObj[stat.name] = stat.value;
          }
        }

        // Calculate per-game averages for key props
        const gp = statsObj.games_played || 1;
        statsObj.shots_per_game = statsObj.shots ? (statsObj.shots / gp).toFixed(2) : null;
        statsObj.goals_per_game = statsObj.goals ? (statsObj.goals / gp).toFixed(2) : null;
        statsObj.assists_per_game = statsObj.assists ? (statsObj.assists / gp).toFixed(2) : null;
        statsObj.points_per_game = statsObj.points ? (statsObj.points / gp).toFixed(2) : null;
        statsObj.pp_points_per_game = statsObj.power_play_points ? (statsObj.power_play_points / gp).toFixed(2) : null;

        console.log(`[Ball Don't Lie] Got season stats for player ${playerId}: ${gp} GP, ${statsObj.shots || 0} shots, ${statsObj.goals || 0} goals`);
        return statsObj;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        console.log(`[Ball Don't Lie] No NHL season stats found for player ${playerId}`);
        return null;
      }
      console.error(`[Ball Don't Lie] NHL player season stats error:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Batch fetch NHL player season stats for multiple players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year
   * @returns {Promise<Object>} - Map of playerId to season stats
   */
  async getNhlPlayersSeasonStatsBatch(playerIds, season) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 25); // Limit to 25 players
      console.log(`[Ball Don't Lie] Batch fetching NHL season stats for ${uniqueIds.length} players`);

      // Fetch in parallel with rate limiting
      const results = {};
      const batchSize = 5; // Fetch 5 at a time to avoid rate limits
      
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.getNhlPlayerSeasonStats(id, season).catch(() => null))
        );
        
        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        // Small delay between batches to avoid rate limits
        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[Ball Don't Lie] Retrieved season stats for ${Object.keys(results).length}/${uniqueIds.length} NHL players`);
      return results;
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL batch season stats error:`, error.message);
      return {};
    }
  },

  /**
   * Get NHL team goalies with their season stats
   * Fetches all goalies (position_code = "G") for given teams and their stats
   * @param {Array<number>} teamIds - Array of team IDs
   * @param {number} season - Season year (e.g., 2024)
   * @returns {Promise<Object>} - Object with home and away goalie data
   */
  async getNhlTeamGoalies(teamIds, season) {
    try {
      if (!teamIds || teamIds.length === 0) return { home: null, away: null };

      const cacheKey = `nhl_team_goalies_${teamIds.join(',')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NHL goalies for teams: ${teamIds.join(', ')}`);

        const goaliesByTeam = {};

        // Fetch players for each team
        for (const teamId of teamIds) {
          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players?team_ids[]=${teamId}&seasons[]=${season}&per_page=100`;
          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const allPlayers = response.data?.data || [];
          // Filter to goalies only (position_code = "G")
          const goalies = allPlayers.filter(p => p.position_code === 'G');

          if (goalies.length > 0) {
            goaliesByTeam[teamId] = goalies;
            console.log(`[Ball Don't Lie] Found ${goalies.length} goalie(s) for team ${teamId}: ${goalies.map(g => g.full_name).join(', ')}`);
          }
        }

        // Fetch season stats for all goalies
        const allGoalieIds = Object.values(goaliesByTeam).flat().map(g => g.id);
        const goalieStats = {};

        if (allGoalieIds.length > 0) {
          console.log(`[Ball Don't Lie] Fetching season stats for ${allGoalieIds.length} goalie(s)...`);

          for (const goalieId of allGoalieIds) {
            try {
              const statsUrl = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${goalieId}/season_stats?season=${season}`;
              const statsResp = await axios.get(statsUrl, {
                headers: { 'Authorization': API_KEY }
              });

              const statsArray = statsResp.data?.data || [];
              const stats = {};
              for (const stat of statsArray) {
                if (stat.name && stat.value !== undefined) {
                  stats[stat.name] = stat.value;
                }
              }
              goalieStats[goalieId] = stats;
            } catch (e) {
              console.warn(`[Ball Don't Lie] Could not fetch stats for goalie ${goalieId}:`, e.message);
            }
          }
        }

        // Build result with enriched goalie data
        const result = {};
        for (const [teamId, goalies] of Object.entries(goaliesByTeam)) {
          result[teamId] = goalies.map(g => {
            const stats = goalieStats[g.id] || {};
            const gamesStarted = stats.games_started || 0;
            const gamesPlayed = stats.games_played || 0;

            return {
              id: g.id,
              name: g.full_name,
              position: g.position_code,
              teamId: parseInt(teamId),
              // Season stats
              games_played: gamesPlayed,
              games_started: gamesStarted,
              wins: stats.wins || 0,
              losses: stats.losses || 0,
              ot_losses: stats.ot_losses || 0,
              save_pct: stats.save_pct ? (stats.save_pct).toFixed(3) : null,
              goals_against_average: stats.goals_against_average ? (stats.goals_against_average).toFixed(2) : null,
              shutouts: stats.shutouts || 0,
              saves: stats.saves || 0,
              shots_against: stats.shots_against || 0,
              // Likely starter indicator (most games started)
              isLikelyStarter: gamesStarted > 0
            };
          }).sort((a, b) => b.games_started - a.games_started); // Sort by games started
        }

        console.log(`[Ball Don't Lie] Goalie data compiled for ${Object.keys(result).length} team(s)`);
        return result;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL team goalies error:`, error?.response?.data || error.message);
      return {};
    }
  },

  /**
   * Get NHL box scores for recent games (for trend analysis)
   * Endpoint: GET /nhl/v1/box_scores?dates[]=YYYY-MM-DD
   * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
   * @param {Object} options - Optional filters (team_ids, player_ids)
   * @returns {Promise<Array>} - Array of box score entries
   */
  async getNhlRecentBoxScores(dates, options = {}) {
    try {
      if (!dates || dates.length === 0) return [];

      const cacheKey = `nhl_box_scores_${dates.join(',')}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allBoxScores = [];
        
        // Fetch box scores for each date (with pagination support)
        for (const date of dates.slice(0, 7)) { // Limit to 7 days
          let cursor = null;
          let pageCount = 0;
          const maxPages = 5;

          do {
            const params = { dates: [date], per_page: 100 };
            if (options.team_ids) params.team_ids = options.team_ids;
            if (options.player_ids) params.player_ids = options.player_ids;
            if (cursor) params.cursor = cursor;

            const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/box_scores${buildQuery(params)}`;
            const response = await axios.get(url, {
              headers: { 'Authorization': API_KEY }
            });

            const data = response.data?.data || [];
            allBoxScores = allBoxScores.concat(data);
            
            cursor = response.data?.meta?.next_cursor;
            pageCount++;

            // Rate limit protection
            if (cursor) await new Promise(resolve => setTimeout(resolve, 50));
          } while (cursor && pageCount < maxPages);
        }

        console.log(`[Ball Don't Lie] Retrieved ${allBoxScores.length} NHL box score entries for ${dates.length} days`);
        return allBoxScores;
      }, 15); // Cache for 15 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL box scores error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NHL player stats leaders for props context
   * Fetches top players in key stat categories to give Gary ranking context
   * E.g., "Kucherov is #1 in points, top-5 in goals"
   * @param {number} season - Season year
   * @param {Array<number>} playerIds - Optional: filter to specific players to get their rankings
   * @returns {Promise<Object>} - Map of playerId to their rankings in each category
   */
  async getNhlPlayerStatsLeaders(season, playerIds = []) {
    try {
      if (!season) return {};

      const cacheKey = `nhl_player_leaders_${season}_${playerIds.length > 0 ? playerIds.sort().join(',') : 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NHL player stats leaders for ${season} season...`);
        
        // Key stats for prop analysis: goals, assists, points, shots
        const statTypes = ['goals', 'assists', 'points', 'shots'];
        
        // Fetch all leaders in parallel
        const leaderResults = await Promise.all(
          statTypes.map(type => 
            this.getLeadersGeneric('icehockey_nhl', { season, type, postseason: false })
          )
        );

        // Build a map of playerId -> { rank in each stat }
        const playerRankings = {};
        
        statTypes.forEach((type, idx) => {
          const leaders = leaderResults[idx] || [];
          leaders.forEach((entry, rank) => {
            const pid = entry.player?.id;
            if (!pid) return;
            
            // If we have specific playerIds to filter, skip others (for now, store all)
            if (!playerRankings[pid]) {
              playerRankings[pid] = {
                playerId: pid,
                playerName: entry.player?.full_name || `${entry.player?.first_name || ''} ${entry.player?.last_name || ''}`.trim(),
                position: entry.player?.position_code,
                rankings: {}
              };
            }
            
            playerRankings[pid].rankings[type] = {
              rank: rank + 1, // 1-indexed rank
              value: entry.value,
              isTopTen: rank < 10,
              isTopFive: rank < 5,
              isLeader: rank === 0
            };
          });
        });

        // If specific playerIds requested, filter to just those
        if (playerIds.length > 0) {
          const filtered = {};
          for (const pid of playerIds) {
            if (playerRankings[pid]) {
              filtered[pid] = playerRankings[pid];
            }
          }
          console.log(`[Ball Don't Lie] Got NHL leader rankings for ${Object.keys(filtered).length}/${playerIds.length} requested players`);
          return filtered;
        }

        console.log(`[Ball Don't Lie] Got NHL leader rankings for ${Object.keys(playerRankings).length} players across ${statTypes.length} stat categories`);
        return playerRankings;
      }, 60); // Cache for 60 minutes (rankings don't change frequently)
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL player stats leaders error:`, error.message);
      return {};
    }
  },

  // ==================== ENHANCED GAME LOGS FOR PROPS ====================

  /**
   * Get NBA player game logs with enhanced stats for prop analysis
   * Includes: individual game stats, consistency metrics, hit rates, home/away splits
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games (default 10)
   * @param {Object} propLines - Optional prop lines to calculate hit rates { points: 24.5, rebounds: 8.5 }
   * @returns {Promise<Object>} - Enhanced game log data
   */
  async getNbaPlayerGameLogs(playerId, numGames = 10, propLines = {}) {
    try {
      if (!playerId) return null;

      const cacheKey = `nba_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Get stats for last 30 days to ensure we capture enough games
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const url = `${BALLDONTLIE_API_BASE_URL}/v1/stats${buildQuery({
          player_ids: [playerId],
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate.toISOString().slice(0, 10),
          per_page: 25
        })}`;

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const allStats = response.data?.data || [];
        if (allStats.length === 0) return null;

        // Sort by date (most recent first) and take last N
        const games = allStats
          .filter(g => g.min && parseInt(g.min) > 0) // Only games where player played
          .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => ({
          date: g.game?.date,
          opponent: g.game?.home_team?.id === g.team?.id 
            ? g.game?.visitor_team?.abbreviation 
            : g.game?.home_team?.abbreviation,
          isHome: g.game?.home_team?.id === g.team?.id,
          pts: g.pts || 0,
          reb: g.reb || 0,
          ast: g.ast || 0,
          stl: g.stl || 0,
          blk: g.blk || 0,
          fg3m: g.fg3m || 0,
          min: parseInt(g.min) || 0,
          pra: (g.pts || 0) + (g.reb || 0) + (g.ast || 0)
        }));

        // Calculate averages
        const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3m: 0, min: 0, pra: 0 };
        for (const g of gameStats) {
          totals.pts += g.pts;
          totals.reb += g.reb;
          totals.ast += g.ast;
          totals.stl += g.stl;
          totals.blk += g.blk;
          totals.fg3m += g.fg3m;
          totals.min += g.min;
          totals.pra += g.pra;
        }
        const gp = gameStats.length;
        const avgs = {
          pts: totals.pts / gp,
          reb: totals.reb / gp,
          ast: totals.ast / gp,
          stl: totals.stl / gp,
          blk: totals.blk / gp,
          fg3m: totals.fg3m / gp,
          min: totals.min / gp,
          pra: totals.pra / gp
        };

        // Calculate standard deviations for consistency
        const calcStdDev = (values, mean) => {
          const sqDiffs = values.map(v => Math.pow(v - mean, 2));
          return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
        };

        const stdDevs = {
          pts: calcStdDev(gameStats.map(g => g.pts), avgs.pts),
          reb: calcStdDev(gameStats.map(g => g.reb), avgs.reb),
          ast: calcStdDev(gameStats.map(g => g.ast), avgs.ast),
          fg3m: calcStdDev(gameStats.map(g => g.fg3m), avgs.fg3m),
          pra: calcStdDev(gameStats.map(g => g.pra), avgs.pra)
        };

        // Calculate consistency scores (1 - CV, where CV = stdDev/mean)
        const consistency = {
          pts: avgs.pts > 0 ? Math.max(0, 1 - (stdDevs.pts / avgs.pts)).toFixed(2) : '0.00',
          reb: avgs.reb > 0 ? Math.max(0, 1 - (stdDevs.reb / avgs.reb)).toFixed(2) : '0.00',
          ast: avgs.ast > 0 ? Math.max(0, 1 - (stdDevs.ast / avgs.ast)).toFixed(2) : '0.00',
          fg3m: avgs.fg3m > 0 ? Math.max(0, 1 - (stdDevs.fg3m / avgs.fg3m)).toFixed(2) : '0.00',
          pra: avgs.pra > 0 ? Math.max(0, 1 - (stdDevs.pra / avgs.pra)).toFixed(2) : '0.00'
        };

        // Calculate home/away splits
        const homeGames = gameStats.filter(g => g.isHome);
        const awayGames = gameStats.filter(g => !g.isHome);
        const splits = {
          home: homeGames.length > 0 ? {
            games: homeGames.length,
            pts: (homeGames.reduce((s, g) => s + g.pts, 0) / homeGames.length).toFixed(1),
            reb: (homeGames.reduce((s, g) => s + g.reb, 0) / homeGames.length).toFixed(1),
            ast: (homeGames.reduce((s, g) => s + g.ast, 0) / homeGames.length).toFixed(1)
          } : null,
          away: awayGames.length > 0 ? {
            games: awayGames.length,
            pts: (awayGames.reduce((s, g) => s + g.pts, 0) / awayGames.length).toFixed(1),
            reb: (awayGames.reduce((s, g) => s + g.reb, 0) / awayGames.length).toFixed(1),
            ast: (awayGames.reduce((s, g) => s + g.ast, 0) / awayGames.length).toFixed(1)
          } : null
        };

        // Calculate hit rates for prop lines if provided
        const hitRates = {};
        if (propLines.points !== undefined) {
          const hits = gameStats.filter(g => g.pts > propLines.points).length;
          hitRates.points = { line: propLines.points, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.rebounds !== undefined) {
          const hits = gameStats.filter(g => g.reb > propLines.rebounds).length;
          hitRates.rebounds = { line: propLines.rebounds, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.assists !== undefined) {
          const hits = gameStats.filter(g => g.ast > propLines.assists).length;
          hitRates.assists = { line: propLines.assists, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.threes !== undefined) {
          const hits = gameStats.filter(g => g.fg3m > propLines.threes).length;
          hitRates.threes = { line: propLines.threes, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.pra !== undefined) {
          const hits = gameStats.filter(g => g.pra > propLines.pra).length;
          hitRates.pra = { line: propLines.pra, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }

        console.log(`[Ball Don't Lie] Got ${gp} NBA game logs for player ${playerId}`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: gameStats,
          averages: {
            pts: avgs.pts.toFixed(1),
            reb: avgs.reb.toFixed(1),
            ast: avgs.ast.toFixed(1),
            stl: avgs.stl.toFixed(1),
            blk: avgs.blk.toFixed(1),
            fg3m: avgs.fg3m.toFixed(1),
            min: avgs.min.toFixed(1),
            pra: avgs.pra.toFixed(1)
          },
          stdDevs: {
            pts: stdDevs.pts.toFixed(1),
            reb: stdDevs.reb.toFixed(1),
            ast: stdDevs.ast.toFixed(1),
            fg3m: stdDevs.fg3m.toFixed(1),
            pra: stdDevs.pra.toFixed(1)
          },
          consistency,
          splits,
          hitRates,
          lastGame: gameStats[0] || null,
          formTrend: (() => {
            if (gameStats.length < 5) return 'neutral';
            // Compare L2 composite (pts+reb+ast) vs L5 composite to detect form trend
            const l2 = gameStats.slice(0, 2);
            const l5 = gameStats.slice(0, 5);
            const composite = g => (g.pts || 0) + (g.reb || 0) + (g.ast || 0);
            const l2Avg = l2.reduce((s, g) => s + composite(g), 0) / l2.length;
            const l5Avg = l5.reduce((s, g) => s + composite(g), 0) / l5.length;
            if (l2Avg > l5Avg * 1.15) return 'hot';
            if (l2Avg < l5Avg * 0.85) return 'cold';
            return 'stable';
          })()
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Batch fetch NBA game logs for multiple players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} numGames - Number of recent games per player
   * @returns {Promise<Object>} - Map of playerId to game logs
   */
  async getNbaPlayerGameLogsBatch(playerIds, numGames = 10) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 20); // Limit to 20 players
      console.log(`[Ball Don't Lie] Batch fetching NBA game logs for ${uniqueIds.length} players`);

      const results = {};
      const failures = [];
      const batchSize = 5;

      // Helper to fetch with retry on rate limit
      const fetchWithRetry = async (id, maxRetries = 2) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await this.getNbaPlayerGameLogs(id, numGames);
          } catch (e) {
            const isRateLimit = e?.response?.status === 429;
            if (isRateLimit && attempt < maxRetries) {
              console.warn(`[Ball Don't Lie] Rate limited on player ${id}, retrying in 2s...`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
        return null;
      };

      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => fetchWithRetry(id).catch(e => {
            failures.push({ id, error: e.message });
            return null;
          }))
        );

        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 150)); // Slightly longer delay
        }
      }

      const successCount = Object.keys(results).length;
      console.log(`[Ball Don't Lie] Retrieved game logs for ${successCount}/${uniqueIds.length} NBA players`);
      if (failures.length > 0) {
        console.warn(`[Ball Don't Lie] Failed to get logs for ${failures.length} players`);
      }
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaPlayerGameLogsBatch error:', e.message);
      return {};
    }
  },

  /**
   * Get NHL player game logs with enhanced stats for prop analysis
   * Includes: individual game stats, consistency metrics, hit rates, home/away splits
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games (default 10)
   * @param {Object} propLines - Optional prop lines to calculate hit rates { shots: 2.5, points: 0.5 }
   * @returns {Promise<Object>} - Enhanced game log data
   */
  async getNhlPlayerGameLogs(playerId, numGames = 10, propLines = {}) {
    try {
      if (!playerId) return null;

      const cacheKey = `nhl_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Get dates for last 30 days
        const dates = [];
        for (let i = 1; i <= 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }

        const boxScores = await this.getNhlRecentBoxScores(dates.slice(0, 14), { player_ids: [playerId] });
        
        if (!boxScores || boxScores.length === 0) return null;

        // Filter to this player and sort by date
        const games = boxScores
          .filter(bs => bs.player?.id === playerId && bs.time_on_ice)
          .sort((a, b) => new Date(b.game?.game_date) - new Date(a.game?.game_date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => {
          // Parse TOI
          let toiMins = 0;
          if (g.time_on_ice) {
            const [mins, secs] = g.time_on_ice.split(':').map(Number);
            toiMins = mins + (secs / 60);
          }
          
          return {
            date: g.game?.game_date,
            opponent: g.game?.home_team?.id === g.team?.id 
              ? g.game?.away_team?.abbreviation 
              : g.game?.home_team?.abbreviation,
            isHome: g.game?.home_team?.id === g.team?.id,
            sog: g.shots_on_goal || 0,
            goals: g.goals || 0,
            assists: g.assists || 0,
            points: g.points || 0,
            ppGoals: g.power_play_goals || 0,
            ppAssists: g.power_play_assists || 0,
            toi: toiMins
          };
        });

        // Calculate averages
        const totals = { sog: 0, goals: 0, assists: 0, points: 0, ppGoals: 0, ppAssists: 0, toi: 0 };
        for (const g of gameStats) {
          totals.sog += g.sog;
          totals.goals += g.goals;
          totals.assists += g.assists;
          totals.points += g.points;
          totals.ppGoals += g.ppGoals;
          totals.ppAssists += g.ppAssists;
          totals.toi += g.toi;
        }
        const gp = gameStats.length;
        const avgs = {
          sog: totals.sog / gp,
          goals: totals.goals / gp,
          assists: totals.assists / gp,
          points: totals.points / gp,
          ppPoints: (totals.ppGoals + totals.ppAssists) / gp,
          toi: totals.toi / gp
        };

        // Calculate standard deviations
        const calcStdDev = (values, mean) => {
          const sqDiffs = values.map(v => Math.pow(v - mean, 2));
          return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
        };

        const stdDevs = {
          sog: calcStdDev(gameStats.map(g => g.sog), avgs.sog),
          goals: calcStdDev(gameStats.map(g => g.goals), avgs.goals),
          assists: calcStdDev(gameStats.map(g => g.assists), avgs.assists),
          points: calcStdDev(gameStats.map(g => g.points), avgs.points)
        };

        // Consistency scores
        const consistency = {
          sog: avgs.sog > 0 ? Math.max(0, 1 - (stdDevs.sog / avgs.sog)).toFixed(2) : '0.00',
          goals: avgs.goals > 0 ? Math.max(0, 1 - (stdDevs.goals / avgs.goals)).toFixed(2) : '0.00',
          assists: avgs.assists > 0 ? Math.max(0, 1 - (stdDevs.assists / avgs.assists)).toFixed(2) : '0.00',
          points: avgs.points > 0 ? Math.max(0, 1 - (stdDevs.points / avgs.points)).toFixed(2) : '0.00'
        };

        // Home/away splits
        const homeGames = gameStats.filter(g => g.isHome);
        const awayGames = gameStats.filter(g => !g.isHome);
        const splits = {
          home: homeGames.length > 0 ? {
            games: homeGames.length,
            sog: (homeGames.reduce((s, g) => s + g.sog, 0) / homeGames.length).toFixed(1),
            points: (homeGames.reduce((s, g) => s + g.points, 0) / homeGames.length).toFixed(2)
          } : null,
          away: awayGames.length > 0 ? {
            games: awayGames.length,
            sog: (awayGames.reduce((s, g) => s + g.sog, 0) / awayGames.length).toFixed(1),
            points: (awayGames.reduce((s, g) => s + g.points, 0) / awayGames.length).toFixed(2)
          } : null
        };

        // Calculate hit rates for prop lines
        const hitRates = {};
        if (propLines.shots !== undefined) {
          const hits = gameStats.filter(g => g.sog > propLines.shots).length;
          hitRates.shots = { line: propLines.shots, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.goals !== undefined) {
          const hits = gameStats.filter(g => g.goals > propLines.goals).length;
          hitRates.goals = { line: propLines.goals, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.assists !== undefined) {
          const hits = gameStats.filter(g => g.assists > propLines.assists).length;
          hitRates.assists = { line: propLines.assists, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.points !== undefined) {
          const hits = gameStats.filter(g => g.points > propLines.points).length;
          hitRates.points = { line: propLines.points, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }

        console.log(`[Ball Don't Lie] Got ${gp} NHL game logs for player ${playerId}`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: gameStats,
          averages: {
            sog: avgs.sog.toFixed(1),
            goals: avgs.goals.toFixed(2),
            assists: avgs.assists.toFixed(2),
            points: avgs.points.toFixed(2),
            ppPoints: avgs.ppPoints.toFixed(2),
            toi: avgs.toi.toFixed(1)
          },
          stdDevs: {
            sog: stdDevs.sog.toFixed(2),
            goals: stdDevs.goals.toFixed(2),
            assists: stdDevs.assists.toFixed(2),
            points: stdDevs.points.toFixed(2)
          },
          consistency,
          splits,
          hitRates,
          lastGame: gameStats[0] || null,
          formTrend: gameStats.length >= 5
            ? (avgs.sog > (gameStats.slice(-5).reduce((s, g) => s + g.sog, 0) / 5) ? 'hot' : 'cold')
            : 'neutral'
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNhlPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Batch fetch NHL game logs for multiple players
   * @param {Array<number>} playerIds - Array of player IDs  
   * @param {number} numGames - Number of recent games per player
   * @returns {Promise<Object>} - Map of playerId to game logs
   */
  async getNhlPlayerGameLogsBatch(playerIds, numGames = 10) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 20);
      console.log(`[Ball Don't Lie] Batch fetching NHL game logs for ${uniqueIds.length} players`);

      const results = {};
      const failures = [];
      const batchSize = 5;

      // Helper to fetch with retry on rate limit
      const fetchWithRetry = async (id, maxRetries = 2) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await this.getNhlPlayerGameLogs(id, numGames);
          } catch (e) {
            const isRateLimit = e?.response?.status === 429;
            if (isRateLimit && attempt < maxRetries) {
              console.warn(`[Ball Don't Lie] Rate limited on player ${id}, retrying in 2s...`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
        return null;
      };

      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => fetchWithRetry(id).catch(e => {
            failures.push({ id, error: e.message });
            return null;
          }))
        );

        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 150)); // Slightly longer delay
        }
      }

      const successCount = Object.keys(results).length;
      console.log(`[Ball Don't Lie] Retrieved game logs for ${successCount}/${uniqueIds.length} NHL players`);
      if (failures.length > 0) {
        console.warn(`[Ball Don't Lie] Failed to get logs for ${failures.length} players`);
      }
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNhlPlayerGameLogsBatch error:', e.message);
      return {};
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NFL PLAYER PROPS (Ball Don't Lie API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get NFL player props from Ball Don't Lie API
   * Supports: passing_yards, rushing_yards, receiving_yards, receptions, anytime_td, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNflPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NFL player props requires game_id');
        return [];
      }

      const cacheKey = `nfl_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching NFL player props: ${url}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NFL player props for game ${gameId}`);
        return props;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NFL player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NFL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NFL game objects with IDs
   */
  async getNflGamesForDate(dateStr) {
    try {
      const cacheKey = `nfl_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NFL games for ${dateStr}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NFL games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NFL games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NFL players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNflPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nfl_players_${uniqueIds.sort().join(',')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NFL players`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const players = response.data?.data || [];

        // Build lookup map
        const playerMap = {};
        for (const player of players) {
          playerMap[player.id] = {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position,
            team: player.team?.full_name || player.team?.name || 'Unknown'
          };
        }

        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NFL player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NFL players error:`, error?.response?.data || error.message);
      return {};
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NBA PLAYER PROPS (Ball Don't Lie API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get NBA player props from Ball Don't Lie API
   * Supports: points, rebounds, assists, threes, blocks, steals, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNbaPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NBA player props requires game_id');
        return [];
      }

      const cacheKey = `nba_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId, per_page: 100 };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        // NBA player props use v2 endpoint — paginate to get all props
        const baseUrl = `${BALLDONTLIE_API_BASE_URL}/v2/odds/player_props`;
        let allProps = [];
        let nextCursor = undefined;
        let pageCount = 0;
        const maxPages = 10;

        do {
          const currentParams = { ...params };
          if (nextCursor) currentParams.cursor = nextCursor;

          const url = `${baseUrl}${buildQuery(currentParams)}`;
          console.log(`[Ball Don't Lie] Fetching NBA player props: ${url} (Page ${pageCount + 1})`);

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const props = response.data?.data || [];
          allProps = allProps.concat(props);
          nextCursor = response.data?.meta?.next_cursor;
          pageCount++;
        } while (nextCursor && pageCount < maxPages);

        console.log(`[Ball Don't Lie] Retrieved ${allProps.length} NBA player props for game ${gameId} (${pageCount} page${pageCount > 1 ? 's' : ''})`);
        return allProps;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NBA player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NBA games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NBA game objects with IDs
   */
  async getNbaGamesForDate(dateStr) {
    try {
      const cacheKey = `nba_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NBA games for ${dateStr}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NBA games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NBA games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NBA players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNbaPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nba_players_${uniqueIds.sort().join(',')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NBA players`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const players = response.data?.data || [];

        // Build lookup map
        const playerMap = {};
        for (const player of players) {
          playerMap[player.id] = {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position,
            team: player.team?.full_name || 'Unknown'
          };
        }

        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NBA player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NBA players error:`, error?.response?.data || error.message);
      return {};
    }
  },

};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
