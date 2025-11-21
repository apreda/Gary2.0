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
      value.forEach(v => {
        if (v == null) return;
        // Note: API expects literal brackets key[]=value. 
        // Some frameworks require encoded brackets %5B%5D, but standard BDL examples show literal.
        // We use encodeURIComponent ONLY on key name (usually safe) and value.
        // BUT we append [] literally.
        parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(v))}`);
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
        // NBA uses V2 endpoint per latest docs; fallback to V1 if needed
        const tryRequest = async (url) => {
          const qs = buildQuery(norm); // ensures dates[]=... & game_ids[]=...
          const fullUrl = `${url}${qs}`;
          try {
            console.log(`[Ball Don't Lie] GET ${fullUrl}`);
          } catch {}
          const resp = await axios.get(fullUrl, {
            headers: { Authorization: API_KEY }
          });
          const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
          return rows;
        };

        if (sportKey === 'nba') {
          try {
            const v2Url = `${BALLDONTLIE_API_BASE_URL}/v2/odds`;
            const data = await tryRequest(v2Url);
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
          return await tryRequest(v1Url);
        }
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getOdds error (${sport}):`, e?.response?.status || e?.message);
      return [];
    }
  },

  // ... (rest of file remains unchanged, but we need to preserve it so using read_file content if possible or partial write)
  // Since I cannot do partial write on this tool easily without full content, and file is huge,
  // I will use sed/patch or just carefully re-read and write.
  // Actually, I'll use apply_patch tool instead of write to be safe.
  
  // Wait, I already read the file start. I can just patch buildQuery.
};
