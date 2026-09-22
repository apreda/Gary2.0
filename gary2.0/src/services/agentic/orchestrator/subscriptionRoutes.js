import { discoverCodexHomes, personalCodexHome } from './providerAdapters/codexHomes.js';
import { deepseekConfigured } from './providerAdapters/deepseekSession.js';

// September 19: one explicit account order for every lane. College decisions
// retain Sol; light factual readers use Terra on GPT recovery.
export function subscriptionRoutes(primary = 'claude-sonnet-5', { tier = 'light', college = false, env = process.env, home } = {}) {
  const raw = String(primary).replace(/^anthropic-/, '').replace(/^codex-/, '');
  const claude = raw.startsWith('claude-') ? raw : (tier === 'heavy' ? 'claude-opus-5' : 'claude-sonnet-5');
  const gpt = college ? 'codex-gpt-5.6-sol' : raw.startsWith('gpt-') ? `codex-${raw}` : tier === 'heavy' ? 'codex-gpt-6-astra' : 'codex-gpt-5.6-terra';
  return [
    // College excluded the Claude subscription while it was pinned to Sol on
    // GPT. NCAAF game picks and props run Opus on the Claude subscription now
    // (founder, Sep 22 2026: "all ncaaf picks should be on Opus not Fable or
    // Astra"), so college takes the Claude route for Opus and only Opus; every
    // other Claude model, Fable included, stays out of college by construction,
    // and the GPT rungs behind it remain Sol.
    // The REQUESTED primary must be Opus: a heavy tier derives Opus as its
    // Claude rung for any model, which would have walked Astra's lane into
    // college through the back door.
    ...(!college || raw === 'claude-opus-5' ? [{ id: 'claude-subscription', model: claude }] : []),
    ...discoverCodexHomes({ env, home }).map((dir,i) => ({ id: `business-gpt-${i}`, model: gpt, codexHomes: [dir] })),
    { id: 'personal-gpt', model: gpt, codexHomes: [personalCodexHome({ env, home })], allowPersonalAccount: true },
    ...(deepseekConfigured(env) ? [{ id: 'deepseek-last', model: 'deepseek' }] : []),
  ];
}
