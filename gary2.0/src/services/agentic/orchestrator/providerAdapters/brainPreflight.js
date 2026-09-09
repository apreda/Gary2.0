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

const PING = 'Reply with the single word OK.';

export async function preflightBrains(models, { timeoutMs = 60 * 1000 } = {}) {
  const results = [];
  for (const model of models || []) {
    let ok = false;
    let reason = null;
    try {
      if (isCodexCliModel(model)) {
        const r = await codexCliOneShot(PING, { model: String(model).replace(/^codex-/, ''), effort: 'low', timeoutMs, breakerKey: 'codex-preflight' });
        ok = Boolean(r.success);
        reason = r.error || null;
      } else if (isClaudeCliModel(model)) {
        const r = await claudeCliPing(model, { timeoutMs });
        ok = Boolean(r.success);
        reason = r.error || null;
      } else {
        ok = true; // a metered API rung answers whenever it is in the cascade
        reason = 'api rung';
      }
    } catch (error) {
      reason = error?.message || String(error);
    }
    results.push({ model, ok, reason });
    if (ok) break;
  }
  return { ok: results.some((r) => r.ok), results };
}

export function describePreflight(preflight) {
  return (preflight?.results || []).map((r) => `${r.model}: ${r.ok ? 'answers' : (r.reason || 'refused').slice(0, 90)}`).join(' | ');
}

export default { preflightBrains, describePreflight };
