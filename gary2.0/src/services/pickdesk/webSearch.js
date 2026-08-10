/**
 * OpenAI web-search grounding for the MLB game lane (founder GO, Jul 26 2026 —
 * de-Gemini step one). Same return contract as geminiGroundingSearch
 * ({ success, data, raw }) so call sites swap without unwrap changes.
 *
 * The 2026 Freshness Protocol is ported from shared/grounding.js — the rules
 * are prompt text and provider-agnostic. Search runs through the Responses
 * API's built-in web_search tool; failures degrade to empty data (the desk
 * renders "No same-day breaking news." — never blocks a pick).
 *
 * Quota fallback (founder approved Jul 29, after the Jul 28 balance outage
 * built news-less desks all evening): a 429/quota failure — and only that —
 * re-runs the query through geminiGroundingSearch (same return contract,
 * its own freshness protocol). OpenAI stays the preferred provider.
 */
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describeSportsCalendar } from '../../utils/dateUtils.js';
import { geminiGroundingSearch } from '../agentic/scoutReport/shared/grounding.js';
import { claudeCliWebSearch } from '../agentic/orchestrator/providerAdapters/claudeCliSession.js';

// SEARCH CACHE (founder GO, Aug 10): the props tiers re-build the desk per
// window, so the same four questions about the same game were re-searched
// ~150×/day. DISK-backed because the scheduler spawns a fresh node per
// window — an in-memory cache would die between the game desk and the
// props desk. Successful, non-empty results only; 45-minute TTL keeps
// same-day news honest; any fs error just falls through to a live search.
const SEARCH_CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../.cache/websearch');
const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000;

function searchCacheGet(key) {
  try {
    const { at, value } = JSON.parse(readFileSync(join(SEARCH_CACHE_DIR, `${key}.json`), 'utf8'));
    if (Date.now() - at > SEARCH_CACHE_TTL_MS) return null;
    console.log(`[Web Search] cache hit (${Math.round((Date.now() - at) / 60000)}m old)`);
    return value;
  } catch { return null; }
}

function searchCachePut(key, value) {
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
export async function openaiWebSearch(query, options = {}) {
  const cacheKey = createHash('sha256')
    .update(`${query}|${options.freshnessHours || 48}`)
    .digest('hex')
    .slice(0, 24);
  const cached = searchCacheGet(cacheKey);
  if (cached) return cached;
  const cachePut = (result) => {
    if (result?.success && String(result?.data || '').trim()) searchCachePut(cacheKey, result);
    return result;
  };
  // SUBSCRIPTION BRIDGE (founder, Jul 29): with GARY_GROUNDING_VIA_CLAUDE=1,
  // grounding runs on the Claude subscription first (WebSearch tool only,
  // Sonnet by default — its own weekly bucket), $0 marginal. The OpenAI →
  // Gemini chain below stays as the fallback if the bridge search fails.
  if (process.env.GARY_GROUNDING_VIA_CLAUDE === '1') {
    const viaClaude = await claudeCliWebSearch(freshnessPrompt(query, options.freshnessHours), options);
    if (viaClaude.success) return cachePut(viaClaude);
    console.warn('[Web Search] claude-cli grounding empty/failed — trying API providers');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, data: '', raw: null, error: 'OPENAI_API_KEY missing' };

  const body = {
    model: options.model || WEB_SEARCH_MODEL,
    input: freshnessPrompt(query, options.freshnessHours),
    tools: [{ type: 'web_search' }],
    reasoning: { effort: 'low' },
    max_output_tokens: options.maxTokens || 2000,
  };

  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let data;
    try {
      data = await attempt();
    } catch (first) {
      console.warn(`[Web Search] first attempt failed (${first.message}) — one retry`);
      data = await attempt();
    }
    const outputItems = Array.isArray(data.output) ? data.output : [];
    let text = outputItems
      .filter((o) => o.type === 'message')
      .flatMap((o) => (o.content || []).map((c) => c.text).filter(Boolean))
      .join('');
    // Never hand the desk a mid-sentence cutoff: if the output hit the token
    // cap, trim back to the last completed sentence.
    if (text && !/[.!?)\]"”]\s*$/.test(text)) {
      const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('.\n'), text.lastIndexOf('! '), text.lastIndexOf('? '));
      if (cut > text.length * 0.5) text = text.slice(0, cut + 1);
    }
    console.log(`[Web Search] ${WEB_SEARCH_MODEL} returned ${text.length} chars`);
    return cachePut({ success: text.length > 0, data: text, raw: data });
  } catch (e) {
    const msg = String(e.message || '');
    if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
      console.warn(`[Web Search] OpenAI quota/429 — falling back to Gemini grounding`);
      try {
        return cachePut(await geminiGroundingSearch(query, options));
      } catch (g) {
        console.warn(`[Web Search] Gemini grounding fallback also failed: ${g.message}`);
        return { success: false, data: '', raw: null, error: g.message };
      }
    }
    console.warn(`[Web Search] failed: ${msg}`);
    return { success: false, data: '', raw: null, error: msg };
  }
}
