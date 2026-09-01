/**
 * Generic Anthropic server-side web search (Aug 24 2026).
 *
 * Extracted from anthropicFootballGrounding.js — the hardened transport core
 * (pause_turn continuation contract, search-result validation, timeout) with
 * the football-specific prompt/validation left behind in that module. This is
 * the METERED grounding rail of the post-Gemini world: the codex GPT Pro
 * bridge (codexCliWebSearch, $0) goes first everywhere — Claude CLI left the
 * pick lane Sep 1 2026 — and this API-key rail catches what the bridge drops.
 *
 * Founder order, Aug 24: "no more gemini for anything — everything should be
 * Anthropic through the API or ChatGPT through the API."
 */

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_PAUSE_CONTINUATIONS = 2;

function apiModelId(value) {
  const model = String(value || DEFAULT_MODEL).trim();
  return model.startsWith('anthropic-') ? model.slice('anthropic-'.length) : model;
}

function searchResultStatus(blocks) {
  let successfulSearches = 0;
  const errors = [];
  for (const block of blocks || []) {
    if (block?.type !== 'web_search_tool_result') continue;
    if (Array.isArray(block.content)) {
      if (block.content.some((item) => item?.type === 'web_search_result')) {
        successfulSearches += 1;
      }
    } else if (block.content?.type === 'web_search_tool_result_error') {
      errors.push(block.content.error_code || 'unknown_search_error');
    }
  }
  return { successfulSearches, errors };
}

/**
 * Run one prompt against the Anthropic Messages API with the server web-search
 * tool. Returns { success, data, searchCount } — success only when at least
 * one search actually ran and text came back; { success: false } on any
 * contained failure (missing key, HTTP error, timeout, no searches).
 *
 * @param {string} prompt   the FULL prompt (caller owns freshness anchoring)
 * @param {object} [options]
 * @param {number} [options.maxTokens=6000]
 * @param {number} [options.maxUses=6]      web_search tool max_uses
 * @param {number} [options.timeoutMs=90000]
 * @param {string} [options.model]          overrides ANTHROPIC_GROUNDING_MODEL
 */
export async function anthropicWebSearchRaw(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Anthropic Search] unavailable (ANTHROPIC_API_KEY missing)');
    return { success: false, data: null, error: 'ANTHROPIC_API_KEY missing' };
  }

  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: options.maxUses ?? 6,
    user_location: {
      type: 'approximate',
      country: 'US',
      timezone: 'America/New_York',
    },
  };
  const messages = [{ role: 'user', content: String(prompt) }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const textParts = [];
  let successfulSearches = 0;
  const searchErrors = [];

  try {
    for (let continuation = 0; continuation <= MAX_PAUSE_CONTINUATIONS; continuation += 1) {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: apiModelId(options.model || process.env.ANTHROPIC_GROUNDING_MODEL),
          max_tokens: options.maxTokens ?? 6000,
          messages,
          tools: [tool],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`[Anthropic Search] HTTP ${response.status}`);
        return { success: false, data: null, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const blocks = Array.isArray(data?.content) ? data.content : [];
      textParts.push(...blocks
        .filter((block) => block?.type === 'text' && block.text)
        .map((block) => block.text));
      const status = searchResultStatus(blocks);
      successfulSearches += status.successfulSearches;
      searchErrors.push(...status.errors);

      if (data.stop_reason === 'pause_turn') {
        if (continuation === MAX_PAUSE_CONTINUATIONS) {
          console.warn('[Anthropic Search] pause_turn continuation cap exceeded');
          return { success: false, data: null, error: 'pause_turn cap' };
        }
        // Server search results contain encrypted fields. Preserve the entire
        // assistant turn and resend it unchanged, per Anthropic's continuation
        // contract.
        messages.push({ role: 'assistant', content: blocks });
        continue;
      }

      if (data.stop_reason !== 'end_turn') {
        console.warn(`[Anthropic Search] incomplete stop reason: ${data.stop_reason || 'missing'}`);
        return { success: false, data: null, error: `stop_reason ${data.stop_reason || 'missing'}` };
      }

      if (successfulSearches < 1) {
        console.warn(`[Anthropic Search] no successful web search${searchErrors.length ? ` (${searchErrors.join(',')})` : ''}`);
        return { success: false, data: null, error: 'no successful searches' };
      }

      const text = textParts.join('\n\n').trim();
      if (!text) return { success: false, data: null, error: 'empty text' };
      const duration = Date.now() - startedAt;
      console.log(`[Anthropic Search] OK (${successfulSearches} search block(s), ${text.length} chars, ${duration}ms)`);
      return { success: true, data: text, searchCount: successfulSearches };
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : (error?.message || 'request failed');
    console.warn(`[Anthropic Search] request failed: ${reason}`);
    return { success: false, data: null, error: reason };
  } finally {
    clearTimeout(timer);
  }

  return { success: false, data: null, error: 'exhausted continuations' };
}

export default anthropicWebSearchRaw;
