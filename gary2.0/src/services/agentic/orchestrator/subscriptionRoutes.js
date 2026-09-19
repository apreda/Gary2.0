import { discoverCodexHomes, personalCodexHome } from './providerAdapters/codexHomes.js';
import { deepseekConfigured } from './providerAdapters/deepseekSession.js';

// September 19: one explicit account order for every lane. College decisions
// retain Sol; light factual readers use Terra on GPT recovery.
export function subscriptionRoutes(primary = 'claude-sonnet-5', { tier = 'light', college = false, env = process.env, home } = {}) {
  const raw = String(primary).replace(/^anthropic-/, '').replace(/^codex-/, '');
  const claude = raw.startsWith('claude-') ? raw : (tier === 'heavy' ? 'claude-opus-5' : 'claude-sonnet-5');
  const gpt = college ? 'codex-gpt-5.6-sol' : raw.startsWith('gpt-') ? `codex-${raw}` : tier === 'heavy' ? 'codex-gpt-6-astra' : 'codex-gpt-5.6-terra';
  return [
    ...(!college ? [{ id: 'claude-subscription', model: claude }] : []),
    ...discoverCodexHomes({ env, home }).map((dir,i) => ({ id: `business-gpt-${i}`, model: gpt, codexHomes: [dir] })),
    { id: 'personal-gpt', model: gpt, codexHomes: [personalCodexHome({ env, home })], allowPersonalAccount: true },
    ...(deepseekConfigured(env) ? [{ id: 'deepseek-last', model: 'deepseek' }] : []),
  ];
}
