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
  const currentMonth = new Date().getMonth() + 1; // 1-indexed for consistency
  const currentYear = new Date().getFullYear();
  // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
  return currentMonth >= 10 ? currentYear : currentYear - 1;
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
          return resp?.data || [];
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players/active',
          basketball_ncaab: 'ncaab/v1/players/active',
          basketball_wnba: 'wnba/v1/players/active',
          americanfootball_nfl: 'nfl/v1/players/active',
          americanfootball_ncaaf: 'ncaaf/v1/players/active',
          icehockey_nhl: 'nhl/v1/players/active',
          baseball_mlb: 'mlb/v1/players/active',
          soccer_epl: 'epl/v1/players/active'
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
      return [];
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
   * Get NBA game lineups (starting lineups + bench)
   * IMPORTANT: Lineup data is only available starting from the 2025 NBA season
   * and only once the game has begun.
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Array>} - Array of lineup entries with player, team, and starter status
   */
  async getNbaLineups(gameIds, ttlMinutes = 5) {
    try {
      if (!gameIds || gameIds.length === 0) return [];
      
      const cacheKey = `nba_lineups_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { 'game_ids[]': gameIds.slice(0, 10), per_page: 100 };
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/lineups${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching NBA lineups for games: ${gameIds.join(', ')}`);
        
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const lineups = Array.isArray(resp?.data?.data) ? resp.data.data : [];
        
        console.log(`[Ball Don't Lie] Retrieved ${lineups.length} lineup entries`);
        return lineups;
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaLineups error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA live box scores for current day's games
   * Returns real-time updated scores and player stats
   * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<Array>} - Array of live box score data
   */
  async getNbaLiveBoxScores(date = null, ttlMinutes = 1) {
    try {
      const today = date || new Date().toISOString().slice(0, 10);
      const cacheKey = `nba_live_box_scores_${today}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/box_scores/live`;
        console.log(`[Ball Don't Lie] Fetching live NBA box scores`);
        
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaLiveBoxScores error:', e.message);
      return [];
    }
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
   * Uses the season_averages/general endpoint with base type
   * Returns: pts, reb, ast, stl, blk, fg3m (threes), min, etc.
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
      const cacheKey = `nba_props_season_stats_${season}_${uniqueIds.sort().join(',')}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NBA season stats for ${uniqueIds.length} players (${season} season)...`);
        
        // Fetch base season averages
        const averages = await this.getNbaSeasonAverages({
          category: 'general',
          type: 'base',
          season,
          season_type: 'regular',
          player_ids: uniqueIds
        });

        if (!averages || averages.length === 0) {
          console.log('[Ball Don\'t Lie] No NBA season averages found');
          return {};
        }

        // Build map of playerId -> stats
        const statsMap = {};
        for (const avg of averages) {
          if (!avg.player?.id) continue;
          
          const playerId = avg.player.id;
          const stats = avg.stats || {};
          
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
            // Raw values for calculations
            raw: {
              pts: stats.pts,
              reb: stats.reb,
              ast: stats.ast,
              stl: stats.stl,
              blk: stats.blk,
              fg3m: stats.fg3m,
              min: stats.min,
              turnover: stats.turnover
            }
          };
        }

        console.log(`[Ball Don't Lie] Got NBA season stats for ${Object.keys(statsMap).length}/${uniqueIds.length} players`);
        return statsMap;
      }, 30); // Cache for 30 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaPlayerSeasonStatsForProps error:', e.message);
      return {};
    }
  },

  /**
   * Get NBA box scores for recent games (for trend analysis)
   * Endpoint: GET /v1/box_scores?date=YYYY-MM-DD
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of box score data
   */
  async getNbaBoxScoresForDate(date) {
    try {
      if (!date) return [];
      
      const cacheKey = `nba_box_scores_${date}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/v1/box_scores?date=${date}`;
        console.log(`[Ball Don't Lie] Fetching NBA box scores for ${date}`);
        
        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });
        
        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NBA games with box scores for ${date}`);
        return games;
      }, 15); // Cache for 15 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaBoxScoresForDate error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA player recent game stats from box scores
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games to analyze (default 5)
   * @returns {Promise<Object>} - Recent performance summary
   */
  async getNbaPlayerRecentPerformance(playerId, numGames = 5) {
    try {
      if (!playerId) return null;
      
      // Get stats for last 14 days
      const dates = [];
      for (let i = 1; i <= 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }

      // Fetch stats for this player over recent dates
      const cacheKey = `nba_player_recent_${playerId}_${dates[0]}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/v1/stats${buildQuery({
          player_ids: [playerId],
          start_date: dates[dates.length - 1],
          end_date: dates[0],
          per_page: 15
        })}`;
        
        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });
        
        const stats = response.data?.data || [];
        if (stats.length === 0) return null;

        // Sort by date (most recent first) and take last N
        const recentGames = stats
          .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
          .slice(0, numGames);

        if (recentGames.length === 0) return null;

        // Calculate averages
        const totals = {
          pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3m: 0, min: 0, games: recentGames.length
        };

        for (const game of recentGames) {
          totals.pts += game.pts || 0;
          totals.reb += game.reb || 0;
          totals.ast += game.ast || 0;
          totals.stl += game.stl || 0;
          totals.blk += game.blk || 0;
          totals.fg3m += game.fg3m || 0;
          const mins = parseInt(game.min) || 0;
          totals.min += mins;
        }

        const gp = totals.games;
        return {
          playerId,
          gamesAnalyzed: gp,
          recentPpg: (totals.pts / gp).toFixed(1),
          recentRpg: (totals.reb / gp).toFixed(1),
          recentApg: (totals.ast / gp).toFixed(1),
          recentSpg: (totals.stl / gp).toFixed(1),
          recentBpg: (totals.blk / gp).toFixed(1),
          recentTpg: (totals.fg3m / gp).toFixed(1),
          recentMpg: (totals.min / gp).toFixed(1),
          lastGamePts: recentGames[0]?.pts || 0,
          lastGameDate: recentGames[0]?.game?.date || null
        };
      }, 15);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaPlayerRecentPerformance error:', e.message);
      return null;
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
   * Get the starting QB for an NFL/NCAAF team based on season stats (most passing yards)
   * FALLBACK METHOD - use getStartingQBFromDepthChart as primary
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {string} sportKey - Sport key ('americanfootball_nfl' or 'americanfootball_ncaaf')
   * @param {number} ttlMinutes - Cache TTL
   * @param {Set<string>} excludeNames - Set of QB names (lowercase) to exclude (e.g., injured/IR players)
   * @returns {Object|null} - { id, name, firstName, lastName, team, passingYards, passingTds, qbRating, ... }
   */
  async getTeamStartingQB(teamId, season = null, sportKey = 'americanfootball_nfl', ttlMinutes = 60, excludeNames = null) {
    // Calculate dynamic NFL/NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return null;
      
      // Determine the API path based on sport
      const isNCAAF = sportKey === 'americanfootball_ncaaf' || sportKey === 'NCAAF';
      const apiPath = isNCAAF ? 'ncaaf/v1/season_stats' : 'nfl/v1/season_stats';
      const sportLabel = isNCAAF ? 'ncaaf' : 'nfl';
      
      // If we have exclusions, skip cache and fetch fresh to apply filtering
      const hasExclusions = excludeNames && excludeNames.size > 0;
      
      const fetchQB = async () => {
        // Fetch all player season stats for the team
        const url = `${BALLDONTLIE_API_BASE_URL}/${apiPath}${buildQuery({ 
          season, 
          team_id: teamId,
          per_page: 100 
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        const allStats = response.data?.data || [];
        
        // Filter to QBs only (position = "Quarterback" or position_abbreviation = "QB")
        let qbStats = allStats.filter(p => 
          p.player?.position === 'Quarterback' || 
          p.player?.position_abbreviation === 'QB' ||
          p.player?.position?.toLowerCase() === 'qb'
        );
        
        // Track if we actually excluded a meaningful starter
        let actuallyExcludedStarter = false;
        
        // Filter out excluded names (injured/IR QBs) - but only if they have meaningful stats
        // If a QB has been out all season (0 passing yards), they weren't the starter anyway
        if (hasExclusions) {
          const originalCount = qbStats.length;
          qbStats = qbStats.filter(p => {
            const fullName = `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.toLowerCase().trim();
            const passingYards = p.passing_yards || 0;
            const gamesPlayed = p.games_played || 0;
            const isExcluded = excludeNames.has(fullName);
            
            if (isExcluded) {
              // Only exclude if they actually played this season (had significant stats)
              // If they have <100 passing yards or 0 games, they weren't the starter anyway
              if (passingYards < 100 || gamesPlayed === 0) {
                console.log(`[Ball Don't Lie] Skipping ${fullName} - injured but wasn't playing anyway (${passingYards} yds, ${gamesPlayed} GP)`);
                return true; // Keep them in the list, but they won't be selected as starter due to low yards
              }
              console.log(`[Ball Don't Lie] ⚠️ Excluding ${fullName} from starting QB consideration (injured/IR, was starter with ${passingYards} yds)`);
              actuallyExcludedStarter = true;
              return false; // Exclude this QB - they were the starter but are now out
            }
            return true; // Not excluded
          });
          if (qbStats.length < originalCount) {
            console.log(`[Ball Don't Lie] Filtered out ${originalCount - qbStats.length} injured QB(s), ${qbStats.length} remaining`);
          }
        }
        
        if (qbStats.length === 0) {
          console.warn(`[Ball Don't Lie] No available QBs found for ${sportLabel.toUpperCase()} team ${teamId} in ${season}`);
          return null;
        }
        
        // Sort by passing yards descending to find the starter
        qbStats.sort((a, b) => (b.passing_yards || 0) - (a.passing_yards || 0));
        const starter = qbStats[0];
        
        const result = {
          id: starter.player?.id,
          firstName: starter.player?.first_name,
          lastName: starter.player?.last_name,
          name: `${starter.player?.first_name} ${starter.player?.last_name}`,
          position: starter.player?.position,
          team: starter.player?.team?.full_name || starter.player?.team?.name,
          teamAbbr: starter.player?.team?.abbreviation,
          jerseyNumber: starter.player?.jersey_number,
          passingYards: starter.passing_yards,
          passingTds: starter.passing_touchdowns,
          passingInterceptions: starter.passing_interceptions,
          passingCompletionPct: starter.passing_completion_pct,
          qbRating: starter.qbr || starter.qb_rating,
          gamesPlayed: starter.games_played,
          isBackup: actuallyExcludedStarter // Flag to indicate this is a backup QB (only if we actually excluded the starter)
        };
        
        const starterLabel = actuallyExcludedStarter ? 'BACKUP Starting QB' : 'Starting QB';
        console.log(`[Ball Don't Lie] ${starterLabel} for ${sportLabel.toUpperCase()} team ${teamId}: ${result.name} (${result.passingYards} pass yds)`);
        return result;
      };
      
      // Skip cache if we have exclusions, otherwise use cache
      if (hasExclusions) {
        return await fetchQB();
      }
      
      const cacheKey = `${sportLabel}_starting_qb_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, fetchQB, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getTeamStartingQB error for team ${teamId}:`, e.message);
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
   * NCAAB player game logs - returns season stats for a player
   * Note: BDL NCAAB API doesn't have game-by-game stats endpoint like NBA
   * So we use player_season_stats and return averages instead
   * @param {number} playerId - BDL player ID
   * @param {number} numGames - Ignored for NCAAB (API limitation)
   * @returns {Promise<Object|null>} - Player season averages (not individual games)
   */
  async getNcaabPlayerGameLogs(playerId, numGames = 10) {
    try {
      if (!playerId) return null;

      const cacheKey = `ncaab_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Calculate NCAAB season: Nov-Mar = current academic year, Apr-Oct = next academic year
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        // NCAAB season typically runs Nov-Apr, use academic year format
        const season = month >= 11 || month <= 4 ? (month >= 11 ? year : year - 1) : year;

        // Use player_season_stats endpoint (NCAAB doesn't have per-game stats like NBA)
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/player_season_stats${buildQuery({
          player_ids: [playerId],
          season: season,
          per_page: 10
        })}`;

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const stats = response.data?.data || [];
        if (stats.length === 0) {
          console.log(`[Ball Don't Lie] No NCAAB season stats found for player ${playerId}`);
          return null;
        }

        // Get the first (current season) stats
        const s = stats[0];
        const gp = s.games_played || 0;
        
        if (gp === 0) return null;

        // Calculate per-game averages from season totals
        const avgs = {
          pts: gp > 0 ? (s.pts || 0) / gp : 0,
          reb: gp > 0 ? (s.reb || 0) / gp : 0,
          ast: gp > 0 ? (s.ast || 0) / gp : 0,
          stl: gp > 0 ? (s.stl || 0) / gp : 0,
          blk: gp > 0 ? (s.blk || 0) / gp : 0,
          fg3m: gp > 0 ? (s.fg3m || 0) / gp : 0,
          min: gp > 0 ? (s.min || 0) / gp : 0,
          pra: gp > 0 ? ((s.pts || 0) + (s.reb || 0) + (s.ast || 0)) / gp : 0
        };

        console.log(`[Ball Don't Lie] Got NCAAB season stats for player ${playerId}: ${gp} games, ${avgs.pts.toFixed(1)} PPG`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: [], // No individual games available for NCAAB
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
          // Season stats don't have game-by-game data for stdDev/consistency
          stdDevs: { pts: 'N/A', reb: 'N/A', ast: 'N/A', pra: 'N/A' },
          consistency: { pts: 'N/A', reb: 'N/A', ast: 'N/A', pra: 'N/A' },
          splits: { home: null, away: null }, // Not available for NCAAB season stats
          lastGame: null,
          formTrend: 'N/A', // Can't calculate without game-by-game data
          note: 'NCAAB API provides season totals only, not individual game logs'
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
          basketball_wnba: 'wnba/v1/teams',
          soccer_epl: 'epl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getTeams not supported');
        
        // EPL requires season parameter - calculate current season
        let queryParams = { ...params };
        if (sportKey === 'soccer_epl' && !queryParams.season) {
          const now = new Date();
          const month = now.getMonth() + 1; // 1-indexed for consistency
          const year = now.getFullYear();
          // EPL season: Aug(8)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
          queryParams.season = month >= 8 ? year : year - 1;
        }
        
        const qs = Object.keys(queryParams).length > 0 ? buildQuery(queryParams) : '';
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
          basketball_wnba: 'wnba/v1/teams',
          basketball_nba: 'nba/v1/teams',
          soccer_epl: 'epl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (path) {
          // EPL requires season parameter
          let qs = '';
          if (sportKey === 'soccer_epl') {
            const now = new Date();
            const month = now.getMonth() + 1; // 1-indexed for consistency
            const year = now.getFullYear();
            // EPL season: Aug(8)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
            const season = month >= 8 ? year : year - 1;
            qs = `?season=${season}`;
          }
          const url = `https://api.balldontlie.io/${path}${qs}`;
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
        // ⭐ FIX: Return array consistently (matching SDK behavior)
        // Most code expects getGames to return an array, not {data, meta}
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
        // NOTE: NHL does not have a player_stats endpoint in BDL API - uses game logs instead
        const endpointMap = {
          basketball_nba: 'nba/v1/stats', // ⭐ FIX: Use correct endpoint per BDL docs
          basketball_wnba: 'wnba/v1/player_stats',
          basketball_ncaab: 'ncaab/v1/player_stats',
          americanfootball_nfl: 'nfl/v1/stats',
          americanfootball_ncaaf: 'ncaaf/v1/player_stats'
          // icehockey_nhl: NOT AVAILABLE - use getPlayerGameLogs instead
        };
        const path = endpointMap[sportKey];
        if (!path) {
          throw new Error('player stats not supported');
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
          icehockey_nhl_team: 'nhl/v1/team_stats/leaders',
          soccer_epl: 'epl/v1/player_stats/leaders',
          soccer_epl_team: 'epl/v1/team_stats/leaders'
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
          basketball_wnba: 'wnba/v1/player_injuries',
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
   * Get top performers for a specific team in the last N days
   */
  async getTeamTopPerformers(sportKey, teamId, days = 14, limit = 3) {
    try {
      const cacheKey = `top_performers_${sportKey}_${teamId}_${days}_${limit}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const dates = [];
        const now = new Date();
        for (let i = 1; i <= days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }

        const boxScores = await this.getNhlRecentBoxScores(dates, { team_ids: [teamId] });
        if (!boxScores || boxScores.length === 0) return [];

        const playerStats = {}; // { playerId: { name, points, goals, assists, games } }

        boxScores.forEach(bs => {
          if (!bs.player?.id || bs.team?.id !== teamId) return;
          const pid = bs.player.id;
          if (!playerStats[pid]) {
            playerStats[pid] = {
              name: `${bs.player.first_name} ${bs.player.last_name}`,
              points: 0,
              goals: 0,
              assists: 0,
              games: 0
            };
          }
          playerStats[pid].points += (bs.points || 0);
          playerStats[pid].goals += (bs.goals || 0);
          playerStats[pid].assists += (bs.assists || 0);
          playerStats[pid].games++;
        });

        return Object.values(playerStats)
          .filter(p => p.games > 0)
          .sort((a, b) => b.points - a.points || b.goals - a.goals)
          .slice(0, limit)
          .map(p => ({
            ...p,
            ppg: (p.points / p.games).toFixed(2)
          }));
      }, 60); // Cache for 1 hour
    } catch (e) {
      console.error(`[Ball Don't Lie] getTeamTopPerformers error:`, e.message);
      return [];
    }
  },

  /**
   * Get head-to-head history between two teams
   * @param {string} sportKey - The sport key (e.g., 'basketball_nba')
   * @param {number} teamId1 - First team ID
   * @param {number} teamId2 - Second team ID
   * @param {number} limit - Max number of games to return
   * @returns {Promise<Array>} Array of H2H game results
   */
  async getHeadToHeadHistory(sportKey, teamId1, teamId2, limit = 10) {
    try {
      const cacheKey = `h2h_${sportKey}_${teamId1}_${teamId2}_${limit}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const currentYear = new Date().getFullYear();
        // Fetch last 2 seasons to get enough H2H samples
        const seasons = [currentYear, currentYear - 1];
        
        const games = await this.getGames(sportKey, {
          team_ids: [teamId1, teamId2],
          seasons: seasons,
          per_page: 100
        });

        // Filter for games where BOTH teams were playing each other
        const h2h = games.filter(g => 
          (g.home_team.id === teamId1 && g.visitor_team?.id === teamId2) ||
          (g.home_team.id === teamId2 && g.visitor_team?.id === teamId1) ||
          (g.home_team.id === teamId1 && g.away_team?.id === teamId2) ||
          (g.home_team.id === teamId2 && g.away_team?.id === teamId1)
        );

        return h2h.sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime)).slice(0, limit);
      }, 60); // Cache for 1 hour
    } catch (e) {
      console.error(`[Ball Don't Lie] getH2HHistory error:`, e.message);
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
    
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? season : season - 1;
    
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
      }, 10); // Cache for 10 minutes since injury status changes frequently
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

  /**
   * Get active NBA playoff teams (teams still in the playoffs)
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team objects still in the playoffs
   */
  async getActivePlayoffTeams(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
    
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
    // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const actualSeason = currentMonth >= 10 ? season : season - 1;
    
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
      // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const playoffSeason = season || (currentMonth >= 10 ? nowYear : nowYear - 1);
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
   * Get NHL player recent performance from box scores
   * Aggregates stats from recent games for trend analysis
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games to analyze (default 5)
   * @returns {Promise<Object>} - Recent performance summary
   */
  async getNhlPlayerRecentPerformance(playerId, numGames = 5) {
    try {
      if (!playerId) return null;

      // Get dates for last 14 days to find recent games
      const dates = [];
      for (let i = 1; i <= 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }

      const boxScores = await this.getNhlRecentBoxScores(dates, { player_ids: [playerId] });
      
      if (!boxScores || boxScores.length === 0) {
        return null;
      }

      // Sort by game date (most recent first) and take last N games
      const playerGames = boxScores
        .filter(bs => bs.player?.id === playerId)
        .sort((a, b) => new Date(b.game?.game_date) - new Date(a.game?.game_date))
        .slice(0, numGames);

      if (playerGames.length === 0) return null;

      // Calculate averages
      const totals = {
        shots: 0,
        goals: 0,
        assists: 0,
        points: 0,
        toi: 0,
        ppGoals: 0,
        games: playerGames.length
      };

      for (const game of playerGames) {
        totals.shots += game.shots_on_goal || 0;
        totals.goals += game.goals || 0;
        totals.assists += game.assists || 0;
        totals.points += game.points || 0;
        totals.ppGoals += game.power_play_goals || 0;
        // Parse TOI string like "18:30" to minutes
        if (game.time_on_ice) {
          const [mins, secs] = game.time_on_ice.split(':').map(Number);
          totals.toi += mins + (secs / 60);
        }
      }

      const gp = totals.games;
      return {
        playerId,
        gamesAnalyzed: gp,
        recentSogAvg: (totals.shots / gp).toFixed(2),
        recentGoalsAvg: (totals.goals / gp).toFixed(2),
        recentAssistsAvg: (totals.assists / gp).toFixed(2),
        recentPointsAvg: (totals.points / gp).toFixed(2),
        recentToiAvg: (totals.toi / gp).toFixed(1),
        recentPpGoals: totals.ppGoals,
        lastGameSog: playerGames[0]?.shots_on_goal || 0,
        lastGameDate: playerGames[0]?.game?.game_date || null
      };
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL player recent performance error:`, error.message);
      return null;
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
          formTrend: gameStats.length >= 5 
            ? (avgs.pts > (gameStats.slice(-5).reduce((s, g) => s + g.pts, 0) / 5) ? 'hot' : 'cold')
            : 'neutral'
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

  // ==================== EPL PLAYER PROPS (BDL API) ====================

  /**
   * Get EPL player props from Ball Don't Lie API
   * Supports: anytime_goal, assists, first_goal, goals_assists, header_goal, last_goal,
   *           outside_box_goal, saves, shots, shots_on_target, tackles, first_half_goal, second_half_goal
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getEplPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] EPL player props requires game_id');
        return [];
      }

      const cacheKey = `epl_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        const url = `${BALLDONTLIE_API_BASE_URL}/epl/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching EPL player props: ${url}`);
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} EPL player props for game ${gameId}`);
        return props;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] EPL player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get EPL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of EPL game objects with IDs
   */
  async getEplGamesForDate(dateStr) {
    try {
      const cacheKey = `epl_games_date_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Calculate EPL season: Aug-Dec = current year, Jan-Jul = previous year
        const targetDate = new Date(dateStr);
        const month = targetDate.getMonth() + 1; // 1-indexed for consistency
        const year = targetDate.getFullYear();
        // EPL season: Aug(8)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
        const season = month >= 8 ? year : year - 1;
        
        // EPL season runs Aug-May with 38 matchweeks
        // Week estimation: Aug 10 is roughly week 1, each week is ~7 days
        // But matches can be rescheduled, so we search a wider range
        const seasonStart = new Date(season, 7, 10); // Approx Aug 10
        const daysSinceStart = Math.floor((targetDate - seasonStart) / (1000 * 60 * 60 * 24));
        const estimatedWeek = Math.max(1, Math.min(38, Math.floor(daysSinceStart / 7) + 1));
        
        // Search a wider range: 3 weeks before and after the estimate
        // This handles rescheduled matches and varying match schedules
        const weeksToFetch = [];
        for (let w = estimatedWeek - 3; w <= estimatedWeek + 3; w++) {
          if (w >= 1 && w <= 38) weeksToFetch.push(w);
        }
        
        let allGames = [];
        
        for (const week of weeksToFetch) {
          try {
            const url = `${BALLDONTLIE_API_BASE_URL}/epl/v1/games${buildQuery({ season, week, per_page: 20 })}`;
            
            const response = await axios.get(url, { 
              headers: { 'Authorization': API_KEY } 
            });
            
            const games = response.data?.data || [];
            allGames = allGames.concat(games);
          } catch (e) {
            // Silently skip failed weeks
          }
        }
        
        // Filter games to target date
        const games = allGames.filter(g => {
          if (!g.kickoff) return false;
          const gameDate = g.kickoff.slice(0, 10);
          return gameDate === dateStr;
        });
        
        console.log(`[Ball Don't Lie] Found ${games.length} EPL games for ${dateStr} (searched weeks ${weeksToFetch[0]}-${weeksToFetch[weeksToFetch.length-1]})`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] EPL games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get EPL players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getEplPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};
      
      // Dedupe and limit
      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `epl_players_${uniqueIds.sort().join(',')}`;
      
      // Calculate current EPL season
      const now = new Date();
      const month = now.getMonth() + 1; // 1-indexed for consistency
      const year = now.getFullYear();
      // EPL season: Aug(8)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
      const season = month >= 8 ? year : year - 1;
      
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/epl/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100, season })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} EPL players`);
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const players = response.data?.data || [];
        
        // Build lookup map
        const playerMap = {};
        for (const player of players) {
          playerMap[player.id] = {
            id: player.id,
            name: player.name || `${player.first_name} ${player.last_name}`,
            position: player.position,
            team: player.team_ids?.[0] ? `Team ${player.team_ids[0]}` : 'Unknown'
          };
        }
        
        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} EPL player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes (player names don't change)
    } catch (error) {
      console.error(`[Ball Don't Lie] EPL players error:`, error?.response?.data || error.message);
      return {};
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
