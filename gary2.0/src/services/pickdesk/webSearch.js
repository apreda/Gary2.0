import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { subscriptionSearch } from '../agentic/orchestrator/subscriptionSearch.js';
/**
 * Web-search grounding facade for the pick desks (founder GO, Jul 26 2026 —
 * de-Gemini step one; Gemini fully retired Aug 24 2026). Return contract
 * ({ success, data, raw }) is stable across every rung.
 *
 * The 2026 Freshness Protocol is ported from shared/grounding.js — the rules
 * are prompt text and provider-agnostic. Chain (Sep 1 2026 — founder: Claude
 * CLI OUT of the pick lane): codex GPT Pro bridge ($0) → OpenAI Responses
 * web_search (API) → Anthropic server web search on any failure. Failures
 * degrade to empty data (the desk renders "No same-day breaking news." —
 * never blocks a pick).
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describeSportsCalendar } from '../../utils/dateUtils.js';
import { codexCliWebSearch } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { claudeCliWebSearch } from '../agentic/orchestrator/providerAdapters/claudeCliSession.js';
import { takeMeteredSearch } from '../agentic/scoutReport/shared/meteredSearchBudget.js';
import { requestSignal } from '../agentic/orchestrator/requestCancellation.js';
import { searchResponseProblem } from '../agentic/searchResponseValidation.js';

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

const WEB_SEARCH_MODEL = 'gpt-5.6-sol';
const TIMEOUT_MS = 90000;

function freshnessPrompt(query, freshnessHours = 48) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const todayISO = today.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const staleCutoff = new Date(Date.now() - freshnessHours * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const seasonContext = describeSportsCalendar(today);

  return `<date_anchor>
  System Date: ${todayStr}
  ISO Date: ${todayISO}
  Season Context: ${seasonContext}
</date_anchor>

<grounding_instructions>
  GROUND TRUTH HIERARCHY (MANDATORY):
  1. PRIMARY TRUTH: This System Date and web search results are the absolute "Present"
  2. SECONDARY TRUTH: Your internal training data is a "Historical Archive" pre-dating the current season
  3. CONFLICT RESOLUTION: If your training says Player X is on Team A, but search shows a trade to Team B,
     your training is an "Amnesia Gap" - USE THE SEARCH RESULT

  FRESHNESS RULES:
  1. Run web search for this query - DO NOT skip the search
  2. ONLY use search results from the past ${freshnessHours} hours. Anything older is stale and must be ignored.
  3. If a search result is dated prior to ${staleCutoff}, DO NOT use it for current analysis
  4. EVIDENCE SUPREMACY: Surrender intuition to search results. Search results ARE the facts.
  5. NEVER state statistical facts (records, streaks, error counts, win streaks) from articles — these go stale within hours. Only use narrative context (storylines, matchup previews, injury news) from search.
  6. DATE-STAMP ANY NUMBER: Rule 5 stands — do not surface stat lines from articles. But when a number is unavoidable in narrative context (an injury date, a posted line/price, a figure the query explicitly demands), you MUST attach its vintage inline — e.g. "(per article dated ${todayStr})". A number without a date is unusable downstream.
  7. Do NOT include third-party picks, predictions, betting advice, or expert projections — facts only.

  ANTI-LAZY VERIFICATION:
  - Do NOT assume you know current rosters, injuries, or stats from training data
  - VERIFY claims using search - if you can't find verification, say "unverified"
  - For injuries: Look for articles from the LAST 24 HOURS specifically
  - If an article says "tonight" or "returns tonight", verify the article date matches ${todayStr}
</grounding_instructions>

<query>
${query}
</query>

CRITICAL REMINDER: Today is ${todayStr}. Use ONLY fresh search results. Your training data pre-dates this season.`;
}

/**
 * Run one grounded web search. Returns { success, data, raw } — data is the
 * text (empty string on any failure).
 */
/**
 * The funded last rung (Aug 26): Anthropic server web search catches EVERY
 * OpenAI provider failure — quota, timeout, missing key — not just 429s.
 * Cancellation of the enclosing research request stops the entire chain.
 * The observed failure was "This operation was aborted" returning EMPTY with
 * no third rung, which made the pitcher-press lane silently absent for weeks.
 */
export async function openaiWebSearch(query, options = {}) {
  const signal = requestSignal(options.signal);
  signal?.throwIfAborted();
  options = { ...options, signal };
  const cacheKey = createHash('sha256')
    .update(`${query}|${options.freshnessHours || 48}`)
    .digest('hex')
    .slice(0, 24);
  const cached = searchCacheGet(cacheKey);
  if (cached) return cached;
  const cachePut = (result) => {
    signal?.throwIfAborted();
    if (result?.success && String(result?.data || '').trim()) searchCachePut(cacheKey, result);
    return result;
  };
  const result = await subscriptionSearch(freshnessPrompt(query, options.freshnessHours), options);
  if (!result.success) recordPickDataFailure('current_reporting', { code: 'search_unavailable' });
  return cachePut(result);
}
