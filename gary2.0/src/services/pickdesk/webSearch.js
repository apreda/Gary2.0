import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { subscriptionSearch } from '../agentic/orchestrator/subscriptionSearch.js';
/**
 * Current reporting through Claude, business GPT, then personal GPT
 * subscriptions. Retrieval failures remain explicit missing reporting.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requestSignal } from '../agentic/orchestrator/requestCancellation.js';
import { searchResponseProblem } from '../agentic/searchResponseValidation.js';
import { withCleanText } from '../searchTextHygiene.js';
import { freshSearchRequest } from '../searchRequest.js';

// SEARCH CACHE (founder GO, Aug 10): the props tiers re-build the desk per
// window, so the same four questions about the same game were re-searched
// ~150×/day. DISK-backed because the scheduler spawns a fresh node per
// window — an in-memory cache would die between the game desk and the
// props desk. Successful, non-empty results only; 45-minute TTL keeps
// same-day news honest; any fs error just falls through to a live search.
const SEARCH_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../.cache/websearch');
const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000;

function searchCacheGet(key) {
  if (process.env.GARY_SEARCH_CACHE_OFF === '1') return null;
  try {
    const { at, value } = JSON.parse(readFileSync(join(SEARCH_CACHE_DIR, `${key}.json`), 'utf8'));
    if (Date.now() - at > SEARCH_CACHE_TTL_MS) return null;
    if (!value?.success || searchResponseProblem(value.data)) return null;
    console.log(`[Web Search] cache hit (${Math.round((Date.now() - at) / 60000)}m old)`);
    return value;
  } catch { return null; }
}

function searchCachePut(key, value) {
  if (process.env.GARY_SEARCH_CACHE_OFF === '1') return;
  try {
    mkdirSync(SEARCH_CACHE_DIR, { recursive: true });
    writeFileSync(join(SEARCH_CACHE_DIR, `${key}.json`), JSON.stringify({ at: Date.now(), value }));
  } catch { /* cache is best-effort — never block a search result */ }
}

// The same plain-words request every desk search uses (Sep 24 2026).
function freshnessPrompt(query, freshnessHours = 48) {
  return freshSearchRequest(query, { freshnessHours });
}

/**
 * Run one grounded web search. Returns { success, data, raw } — data is the
 * text (empty string on any failure).
 */
export async function openaiWebSearch(query, options = {}) {
  const signal = requestSignal(options.signal);
  signal?.throwIfAborted();
  options = { ...options, signal };
  const cacheKey = createHash('sha256')
    .update(`v2|${query}|${options.freshnessHours || 48}`)
    .digest('hex')
    .slice(0, 24);
  const cached = searchCacheGet(cacheKey);
  if (cached) return withCleanText(cached);
  const cachePut = (result) => {
    signal?.throwIfAborted();
    if (result?.success && String(result?.data || '').trim()) searchCachePut(cacheKey, result);
    return result;
  };
  const result = await subscriptionSearch(freshnessPrompt(query, options.freshnessHours), options);
  if (!result.success) recordPickDataFailure('current_reporting', { code: 'search_unavailable' });
  return withCleanText(cachePut(result));
}
