import { BalldontlieAPI } from '@balldontlie/sdk';
import axios from 'axios';
import { nhlSeason } from '../../utils/dateUtils.js';

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

// Re-export for sub-modules
export { clearCache, clearCacheByPattern, initApi, getCachedOrFetch, buildQuery, getCurrentNhlSeason, normalizeName };
export { axios, BALLDONTLIE_API_BASE_URL, API_KEY, TTL_MINUTES, cacheMap };
