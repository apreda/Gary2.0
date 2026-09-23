import { claudeCliWebSearch } from './providerAdapters/claudeCliSession.js';
import { codexCliWebSearch } from './providerAdapters/codexCliSession.js';
import { deepseekOneShot } from './providerAdapters/deepseekSession.js';
import { subscriptionRoutes, LEAD_SHARE } from './subscriptionRoutes.js';
import { isCodexHomeCapped } from './providerAdapters/codexHomes.js';
import { searchResponseProblem } from '../searchResponseValidation.js';

// A GPT login answers a live search in 20-65 s (Codex sessions, Sep 23 2026).
// Behind a lead that took 60% of a six-minute budget, each backup got ~70 s,
// the slow answers were cut at 55-65 s, and three cuts tripped the search
// breaker for the rest of the run: every question Gary asked in the Nats @
// Tigers pick came back empty. A backup gets at least this much of what is
// left, never more than is left. Founder, Sep 23 2026: backend work may take
// as long as it takes ("5 or 6 minutes, or even more, 10 minutes"); only
// what users watch live needs speed. A dead account still trips the breaker
// after 2-3 full-length timeouts, so a hung search cannot run forever.
const BACKUP_FLOOR_MS = 5 * 60 * 1000;
const DEFAULT_SEARCH_BUDGET_MS = 10 * 60 * 1000;

// DeepSeek can write from supplied context, but cannot retrieve outside news.
export async function subscriptionSearch(prompt, options = {}) {
  const errors = [];
  const deadline = Date.now() + (options.timeoutMs || DEFAULT_SEARCH_BUDGET_MS);
  // A lane may ask for the heavy tier (the Wire: Opus first, its GPT model behind).
  const configured = subscriptionRoutes(options.model || 'claude-sonnet-5', { tier: options.tier || 'light' });
  // A login the CLI already reported capped cannot answer; it must not take a
  // share of the window either (Sep 21 2026: the Wire's 130 s league window
  // was cut to 43 s slices and every route timed out).
  const capped = route => Array.isArray(route.codexHomes) && route.codexHomes.length && route.codexHomes.every(dir => isCodexHomeCapped(dir));
  const routes = configured.filter(route => route.model !== 'deepseek' || options.requireRetrieval === false);
  const live = routes.filter(route => !capped(route));
  for (const route of routes.filter(capped)) errors.push(`${route.id}: login capped`);
  for (const [i, route] of live.entries()) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) { errors.push('Search time budget exhausted'); break; }
    // The first route takes most of the window (LEAD_SHARE, the same rule as
    // every model call) and at least the caller's bridge window; the rest
    // divide what is left. A lone live route takes the whole window.
    const even = Math.max(30000, remaining / (live.length - i));
    const lead = i === 0 && live.length > 1 ? Math.max(remaining * LEAD_SHARE, options.primaryTimeoutMs || 0) : 0;
    const share = Math.max(lead, even, i > 0 ? BACKUP_FLOOR_MS : 0);
    const timeoutMs = Math.max(1, Math.min(remaining, share));
    try {
      const r = route.model === 'deepseek'
        ? { ...await deepseekOneShot(prompt, { ...options, model: route.model, timeoutMs }), raw: null }
        : route.model.startsWith('claude-')
        ? await claudeCliWebSearch(prompt, { ...options, model: route.model, timeoutMs })
        : await codexCliWebSearch(prompt, { ...options, ...route, model: route.model.replace(/^codex-/, ''), timeoutMs });
      const problem = searchResponseProblem(r?.data);
      if (r?.success && !problem) return { ...r, transport: route.id };
      errors.push(`${route.id}: ${r?.error || problem || 'empty answer'}`);
    } catch (error) { options.signal?.throwIfAborted(); errors.push(`${route.id}: ${error.message}`); }
  }
  if (options.requireRetrieval !== false && configured.some(route => route.model === 'deepseek')) errors.push('DeepSeek has no configured search transport');
  return { success: false, data: null, raw: null, error: errors.join('; ') };
}
