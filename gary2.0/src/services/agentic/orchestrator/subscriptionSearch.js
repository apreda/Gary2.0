import { claudeCliWebSearch } from './providerAdapters/claudeCliSession.js';
import { codexCliWebSearch } from './providerAdapters/codexCliSession.js';
import { subscriptionRoutes } from './subscriptionRoutes.js';
import { searchResponseProblem } from '../searchResponseValidation.js';

// Retrieval must actually search. DeepSeek's text endpoint cannot substitute
// remembered facts for source retrieval, even when it is the last text route.
export async function subscriptionSearch(prompt, options = {}) {
  const errors = [];
  const deadline = Date.now() + (options.timeoutMs || 360000);
  const configured = subscriptionRoutes(options.model || 'claude-sonnet-5', { tier: 'light' });
  const routes = configured.filter(route => route.model !== 'deepseek');
  for (const [i, route] of routes.entries()) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) { errors.push('Search time budget exhausted'); break; }
    const timeoutMs = Math.max(1, Math.min(remaining, Math.max(30000, remaining / (routes.length - i))));
    try {
      const r = route.model.startsWith('claude-')
        ? await claudeCliWebSearch(prompt, { ...options, model: route.model, timeoutMs })
        : await codexCliWebSearch(prompt, { ...options, ...route, model: route.model.replace(/^codex-/, ''), timeoutMs });
      const problem = searchResponseProblem(r?.data);
      if (r?.success && !problem) return { ...r, transport: route.id };
      errors.push(`${route.id}: ${r?.error || problem || 'empty answer'}`);
    } catch (error) { options.signal?.throwIfAborted(); errors.push(`${route.id}: ${error.message}`); }
  }
  if (configured.some(route => route.model === 'deepseek')) errors.push('DeepSeek has no configured search transport');
  return { success: false, data: null, raw: null, error: errors.join('; ') };
}
