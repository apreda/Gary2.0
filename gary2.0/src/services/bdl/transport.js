import axios from 'axios';
import { BalldontlieAPI } from '@balldontlie/sdk';
import { isSharedBdlCacheKey, readSharedBdlCache, isFootballBdlCacheKey, writeSharedBdlCache } from '../bdlSharedCache.js';
import { recordPickDataFailure, assertPickDataIntegrity } from '../pickDataIntegrity.js';
import { waitForBdlRequestSlot } from '../bdlRequestGate.js';
import { setTimeout as retryDelay } from 'node:timers/promises';

/** Shared HTTP/SDK construction and cache state for every endpoint family.
 * Cache hits and single-flight work share this module instance; cancellable
 * callers own their transport. Failed or integrity-rejected reads never cache.
 * HTTP has a 12-second deadline; retry ladders retain the existing provider policy.
 */
const TTL_MINUTES = 5;

const cacheMap = new Map();

function clearCache() {
  const size = cacheMap.size;
  cacheMap.clear();
  console.log(`[Ball Don't Lie] 🗑️ Cache cleared (${size} entries removed)`);
}

const BALLDONTLIE_API_BASE_URL = 'https://api.balldontlie.io';

const BDL_TIMEOUT_MS = 12000;

const bdlHttp = axios.create({ timeout: BDL_TIMEOUT_MS });

function getApiKey() {
  try {
    const serverKey =
      (typeof process !== 'undefined' && process?.env?.BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.VITE_BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BALLDONTLIE_API_KEY);
    const clientKey =
      (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BALLDONTLIE_API_KEY) || undefined;
    return serverKey || clientKey || '';
  } catch {
    return '';
  }
}

const API_KEY = getApiKey();

function initApi() {
  try {
    const client = new BalldontlieAPI({ apiKey: API_KEY });
    return client;
  } catch (e) {
    console.error('Error initializing Ball Don\'t Lie API client:', e);
    return null;
  }
}

const inflight = new Map();

const TRANSIENT_NETWORK_RE = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ECONNABORTED|EPIPE|ENETDOWN|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|fetch failed|socket hang up|TimeoutError|timeout/i;

function isTransientNetworkError(err) {
  const haystack = [err?.message, err?.code, err?.name, err?.cause?.message, err?.cause?.code, err?.cause?.name]
    .filter(Boolean)
    .join(' ');
  return TRANSIENT_NETWORK_RE.test(haystack);
}

function describeNetworkError(err) {
  return String(err?.cause?.code || err?.code || err?.cause?.message || err?.message || err);
}

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fetchFn
 * @param {number} [ttlMinutes]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<T>}
 */
async function getCachedOrFetch(key, fetchFn, ttlMinutes = TTL_MINUTES, { signal } = {}) {
  signal?.throwIfAborted();
  const now = Date.now();

  // Fresh cache hit
  if (cacheMap.has(key)) {
    const { data, expiry } = cacheMap.get(key);
    if (now < expiry) {
      return data;
    }
  }

  // Desks and insight lanes run in separate child processes. Reuse
  // substantive JSON fetched by a neighboring process before booking another
  // account-wide BDL request. Eligibility is the shared-cache allowlist:
  // football keys, plus MLB player splits/PvP (the Aug-24 429-storm families).
  if (isSharedBdlCacheKey(key)) {
    const shared = await readSharedBdlCache(key, now);
    signal?.throwIfAborted();
    if (shared.hit) {
      cacheMap.set(key, { data: shared.data, expiry: shared.expiry });
      return shared.data;
    }
  }

  // Single-flight: if another caller is already fetching the same key,
  // wait on their promise instead of issuing a duplicate request.
  // A caller with its own deadline must own its transport, rather than wait
  // on another request whose gate/HTTP calls cannot be cancelled by it.
  if (!signal && inflight.has(key)) {
    try { return await inflight.get(key); } catch (error) { recordPickDataFailure(`BDL:${key}`, error); throw error; }
  }

  console.log(`[Ball Don't Lie] Fetching fresh data for ${key}`);

  const fetchWithRetry = async () => {
    // 429: three retries on a growing ladder — under a burst the first 1.2s
    // retry lands inside the same throttle window and just doubles traffic
    // (the Aug-24 storm logged 5,035 429s doing exactly that); the later
    // sleeps land after the window clears. Transient network errors: up to
    // 3 retries with short backoff — a DNS blip usually clears in seconds.
    // Status surfaces a few ways depending on whether the call went through
    // axios, fetch, or the BDL SDK.
    const NETWORK_BACKOFF_MS = [800, 2000, 4500];
    const RATE_LIMIT_BACKOFF_MS = [1200, 4000, 10000];
    let rateLimitAttempt = 0;
    let netAttempt = 0;
    for (;;) {
      try {
        signal?.throwIfAborted();
        if (isFootballBdlCacheKey(key)) {
          // Football only: the 3/min pacing gate predates the paid tier and
          // MLB volume would starve behind it. MLB shared keys skip the gate
          // but still re-check the shared cache after any retry sleep below.
          await waitForBdlRequestSlot(key, { signal });
        }
        if (isSharedBdlCacheKey(key)) {
          // A sibling may have filled the shared cache while this process
          // waited or slept. Re-check immediately before the real transport.
          const shared = await readSharedBdlCache(key);
          signal?.throwIfAborted();
          if (shared.hit) return shared.data;
        }
        signal?.throwIfAborted();
        const data = await fetchFn();
        signal?.throwIfAborted();
        return data;
      } catch (err) {
        signal?.throwIfAborted();
        const status = err?.response?.status ?? err?.status;
        const msg = (err?.message || err?.response?.data?.error || '').toString();
        const isRateLimit = status === 429 || /too many requests/i.test(msg);
        if (isRateLimit && rateLimitAttempt < RATE_LIMIT_BACKOFF_MS.length) {
          const delay = RATE_LIMIT_BACKOFF_MS[rateLimitAttempt];
          rateLimitAttempt += 1;
          console.warn(`[Ball Don't Lie] 429 on ${key} — retry ${rateLimitAttempt}/${RATE_LIMIT_BACKOFF_MS.length} in ${delay}ms`);
          if (signal) await retryDelay(delay, undefined, { signal });
          else await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (!isRateLimit && isTransientNetworkError(err) && netAttempt < NETWORK_BACKOFF_MS.length) {
          const delay = NETWORK_BACKOFF_MS[netAttempt];
          netAttempt += 1;
          console.warn(`[Ball Don't Lie] transient network error on ${key} (${describeNetworkError(err)}) — retry ${netAttempt}/${NETWORK_BACKOFF_MS.length} in ${delay}ms`);
          if (signal) await retryDelay(delay, undefined, { signal });
          else await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        recordPickDataFailure(`BDL:${key}`, err);
        throw err;
      }
    }
  };

  const promise = fetchWithRetry()
    .then(async data => {
      signal?.throwIfAborted();
      assertPickDataIntegrity();
      const expiry = Date.now() + (ttlMinutes * 60 * 1000);
      cacheMap.set(key, { data, expiry });
      await writeSharedBdlCache(key, data, ttlMinutes);
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });

  if (!signal) inflight.set(key, promise);
  return promise;
}

/** Encode array query keys exactly once as key[]=value. */
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

export { cacheMap, clearCache, BALLDONTLIE_API_BASE_URL, BDL_TIMEOUT_MS, bdlHttp, getApiKey, API_KEY, initApi, isTransientNetworkError, getCachedOrFetch, buildQuery };
