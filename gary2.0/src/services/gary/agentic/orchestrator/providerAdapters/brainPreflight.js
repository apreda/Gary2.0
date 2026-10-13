/**
 * Preflight the brains before a game spends anything (founder, Sep 9 2026:
 * "why did it go through the whole process just to hit the cap when we could
 * check that up front"). A child used to build the desk and buy research,
 * then discover every brain rung was capped. One one-word turn per bridge
 * model answers that in seconds: a capped login refuses instantly and free.
 * The first bridge that answers ends the check; metered API rungs are
 * assumed to answer when they are in the cascade at all.
 */
import { isCodexCliModel, codexCliOneShot } from './codexCliSession.js';
import { isClaudeCliModel, claudeCliPing } from './claudeCliSession.js';
import { gameCodexHomes } from '../gameBrainRouting.js';
import { CLAUDE_CAP } from '../subscriptionRoutes.js';

const PING = 'Reply with the single word OK.';

export async function preflightBrains(models, { timeoutMs = 60 * 1000 } = {}) {
  const results = [];
  for (const entry of models || []) {
    const route = typeof entry === 'string' ? { model: entry } : entry;
    const { model } = route;
    let ok = false;
    let reason = null;
    let runOn = null;
    try {
      if (isCodexCliModel(model)) {
        // Check each game account explicitly: an invalid Plus login must not
        // hide an available Pro account from the model-level start plan.
        for (const home of route.codexHomes || gameCodexHomes()) {
          const r = await codexCliOneShot(PING, { model: String(model).replace(/^codex-/, ''), effort: 'low', timeoutMs, breakerKey: 'codex-preflight', codexHomes: [home], allowPersonalAccount: route.allowPersonalAccount === true });
          ok = Boolean(r.success);
          reason = r.error || null;
          if (ok) break;
        }
      } else if (isClaudeCliModel(model)) {
        const r = await claudeCliPing(model, { timeoutMs });
        ok = Boolean(r.success);
        reason = r.error || null;
        // A capped Claude brain hands the game to its heavy sibling on the
        // same subscription (founder, Sep 22 2026: "a Claude one which can use
        // multiple models if Fable is at capacity"). Ask the sibling before
        // calling the route dead, or the game falls through to DeepSeek.
        if (!ok && CLAUDE_CAP.test(reason || '')) {
          for (const sibling of (route.siblings || []).filter((m) => m === 'claude-opus-5-5')) {
            const s = await claudeCliPing(sibling, { timeoutMs });
            if (s.success) { ok = true; runOn = sibling; reason = `${model} capped; ${sibling} answers`; break; }
          }
        }
      } else {
        ok = true; // a metered API rung answers whenever it is in the cascade
        reason = 'api rung';
      }
    } catch (error) {
      reason = error?.message || String(error);
    }
    results.push({ model, ok, reason, ...(runOn ? { runOn } : {}), ...(route.id ? { routeId: route.id } : {}) });
    if (ok) break;
  }
  return { ok: results.some((r) => r.ok), results };
}

export function describePreflight(preflight) {
  return (preflight?.results || []).map((r) => `${r.routeId || r.model}: ${r.ok ? 'answers' : (r.reason || 'refused').slice(0, 90)}`).join(' | ');
}

export default { preflightBrains, describePreflight };
