/**
 * The one model cascade every Winners lane reads through.
 *
 * Founder, Sep 18 2026: "winners fallbacks should be the same as game picks...
 * Same cascade, same models and you can add in Sol then too."
 *
 * Prop selection had kept its own pair since Sep 16 (claude-sonnet-5 then
 * claude-fable-5-1) and so never received that cascade. Sonnet-5 is the rung
 * pulled on Sep 9 for spending the metered key, and on Sep 18 it hung for the
 * entire remaining window on every run: each failure reads "Codex capped ->
 * sonnet-5 aborted due to timeout -> prop selection time budget exhausted",
 * with the rung behind it never tried. One shared reader is why that cannot
 * drift apart again.
 *
 * Sol stays FIRST for its 272K context, which the college batches are sized
 * against. The personal Pro account is never an account here: it is reserved
 * for final game-pick recovery.
 */
import { codexCliOneShot } from '../agentic/orchestrator/providerAdapters/codexCliSession.js';
import { createClaudeCliSession, sendToClaudeCliSession } from '../agentic/orchestrator/providerAdapters/claudeCliSession.js';
import { GAME_PICK_MODEL, GAME_FALLBACK_MODELS } from '../agentic/orchestrator/orchestratorConfig.js';

export const SOL_MODEL = 'gpt-5.6-sol';
export const WINNERS_CASCADE = [SOL_MODEL, GAME_PICK_MODEL, ...GAME_FALLBACK_MODELS]
  .filter((m, i, a) => m && a.indexOf(m) === i);

// A rung needs a real window; the Claude CLI's measured median is ~2.3m.
export const RUNG_RESERVE_MS = 150_000;
// Below this there is no point starting a rung at all.
export const MIN_RUNG_MS = 30_000;
const isClaudeRung = m => String(m).startsWith('claude-');

/**
 * Read `prompt` through the cascade and return the shape codexCliOneShot does.
 *
 * Every rung but the last hands the window behind it back, so a rung that hangs
 * cannot swallow the budget: that reserve used to guard only the Codex rungs,
 * which is exactly how a hanging sonnet-5 left nothing for the rung after it.
 * An eight-minute budget cannot give four sequential rungs a full window each —
 * what this guarantees is that the NEXT rung always has one.
 */
export async function cascadeRead(prompt, options = {}) {
  const { timeoutMs, systemPrompt, breakerKey, codexHomes, cascade = WINNERS_CASCADE, unavailable = 'Comparison unavailable' } = options;
  const deadline = Date.now() + timeoutMs;
  const errors = [];
  for (const [index, model] of cascade.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_RUNG_MS) { errors.push(`${model}: time budget exhausted`); break; }
    const last = index === cascade.length - 1;
    const budget = last ? remaining : Math.max(MIN_RUNG_MS, remaining - RUNG_RESERVE_MS);
    try {
      if (isClaudeRung(model)) {
        const signal = AbortSignal.timeout(budget);
        const session = await createClaudeCliSession({ modelName: model, systemPrompt, thinkingLevel: 'high', browse: false, signal });
        const answer = await sendToClaudeCliSession(session, prompt, { signal });
        if (!answer?.content) throw new Error('Empty comparison');
        return { success: true, data: answer.content, raw: answer.content, model };
      }
      const r = await codexCliOneShot(prompt, { systemPrompt, timeoutMs: budget,
        model: String(model).replace(/^codex-/, ''), effort: 'high', search: false,
        allowPersonalAccount: false, ...(codexHomes ? { codexHomes } : {}), breakerKey });
      if (r?.success) return { ...r, model };
      throw new Error(r?.error || unavailable);
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }
  return { success: false, error: errors.join('; ') };
}
