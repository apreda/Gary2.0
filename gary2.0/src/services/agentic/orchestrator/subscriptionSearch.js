import { claudeCliWebSearch } from './providerAdapters/claudeCliSession.js';
import { codexCliWebSearch } from './providerAdapters/codexCliSession.js';
import { deepseekOneShot } from './providerAdapters/deepseekSession.js';
import { subscriptionRoutes } from './subscriptionRoutes.js';
import { searchResponseProblem } from '../searchResponseValidation.js';

// DeepSeek can write from supplied context, but cannot retrieve outside news.
export async function subscriptionSearch(prompt, options = {}) {
  const errors = [];
  const deadline = Date.now() + (options.timeoutMs || 360000);
  const configured = subscriptionRoutes(options.model || 'claude-sonnet-5', { tier: 'light' });
  const routes = configured.filter(route => route.model !== 'deepseek' || options.requireRetrieval === false);
  for (const [i, route] of routes.entries()) {
    options.signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) { errors.push('Search time budget exhausted'); break; }
    const timeoutMs = Math.max(1, Math.min(remaining, Math.max(30000, remaining / (routes.length - i))));
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
