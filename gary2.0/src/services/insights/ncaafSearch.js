// The college lanes' grounded search transport (NCAAF Picks page parity,
// founder Sep 3-4 2026): the Codex subscription bridge first — $0 marginal,
// the same rung the desks ride — then the Anthropic server web-search API
// when the bridge is out. Both rungs answer { success, data }; a failure of
// both is a failure the caller treats as "no report", never an empty one.
//
// NCAAF-owned so a college lane never shares a breaker or a prompt with an
// NFL one (league isolation law).

import { codexCliWebSearch } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { anthropicWebSearchRaw } from '../agentic/scoutReport/shared/anthropicWebSearch.js';

async function attempt(label, fn) {
  try {
    const result = await fn();
    if (result?.success && result?.data) return { success: true, data: result.data, transport: label };
    return { success: false, error: `${label}: ${result?.error || 'empty answer'}` };
  } catch (err) {
    return { success: false, error: `${label}: ${err?.message || err}` };
  }
}

/**
 * @param {string} prompt   the full prompt (the caller owns freshness wording)
 * @param {object} [options] { timeoutMs, maxTokens }
 * @returns {Promise<{success:boolean, data:string|null, transport?:string, error?:string}>}
 */
export async function searchGrounded(prompt, options = {}) {
  const codex = await attempt('codex', () => codexCliWebSearch(prompt, { timeoutMs: options.timeoutMs }));
  if (codex.success) return codex;
  console.warn(`[ncaafSearch] ${codex.error} — trying the Anthropic server search`);
  const anthropic = await attempt('anthropic', () => anthropicWebSearchRaw(prompt, {
    timeoutMs: options.timeoutMs, maxTokens: options.maxTokens,
  }));
  if (anthropic.success) return anthropic;
  return { success: false, data: null, error: `${codex.error}; ${anthropic.error}` };
}

export default { searchGrounded };
