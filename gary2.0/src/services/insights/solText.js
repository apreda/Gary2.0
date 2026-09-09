/**
 * Content-pass text adapter for the insights pipeline (Jul 27 2026, Sol-only
 * mandate; provider seam Jul 29): the drop-in replacement for
 * the retired geminiService.generateResponse in the hub/fantasy computers (that
 * file was deleted Aug 24 2026 with the vendor). One prompt in,
 * prose/JSON text out, no tools, low reasoning — these are content passes,
 * not picks.
 *
 * Routing (Jul 29, subscription bridge + cost consolidation): the call rides
 * the sessionManager provider seam, so the model is config, not plumbing.
 * GARY_CONTENT_MODEL_OVERRIDE picks the content brain explicitly, and the
 * bridge plists set codex-gpt-5.6-sol (Sep 1 2026 — founder: Claude CLI out
 * of the whole app; his Claude weekly bucket carries nothing of Gary's).
 *
 * The DEFAULT matches that (Aug 21 law). It used to be gemini-3.6-flash, which
 * made this a silent trap: the scheduled run inherits the plist and rides
 * Claude, but ANY spawn site without that env — a manual run, a new script,
 * a cron entry someone forgets to copy the env into — quietly used a
 * different brain. Once the Gemini project went 403 (billing dunning on
 * 704963887148) that difference turned a working lane into a dead one, and
 * the failure looked like a production outage rather than a missing env var.
 * Same lesson as the ANTHROPIC_API_KEY hijack: the default has to be the
 * thing we actually run, or the env is load-bearing in a way nobody can see.
 */
import { createModelSession, sendToSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { DESK_FALLBACK_MODELS } from '../agentic/orchestrator/orchestratorConfig.js';

export const contentModel = () => process.env.GARY_CONTENT_MODEL_OVERRIDE || 'codex-gpt-5.6-sol';
// Sep 9 2026: the desk cascade's Claude bridge rung is for the PICK brains.
// Content lanes (hundreds of lane reads a day) stay off the founder's Claude
// subscription unless GARY_CONTENT_BRIDGE_MODEL names a bridge model — a
// burned weekly cap must never cost a game pick.
const contentRung = (m) => (String(m).startsWith('claude-') ? (process.env.GARY_CONTENT_BRIDGE_MODEL || null) : m);
export const contentModelCascade = () => [...new Set([contentModel(), ...DESK_FALLBACK_MODELS.map(contentRung).filter(Boolean)])];

/** Optional editorial ordering gets one attempt on the configured content
 * model. Existing prose callers retain their established retry/cascade path. */
export async function generateSolTextOnce(prompt, { maxTokens = 3000, effort = 'low', signal } = {}) {
  signal?.throwIfAborted();
  const session = await createModelSession({ modelName: contentModel(), systemPrompt: '', tools: [],
    thinkingLevel: effort, maxOutputTokens: maxTokens, signal });
  const response = await sendToSession(session, prompt, { signal });
  const text = response?.content || '';
  if (!text.trim()) throw new Error('empty editorial content response');
  return text;
}

export async function generateSolText(prompt, { maxTokens = 4000, effort = 'high', signal } = {}) {
  const failures = [];
  for (const modelName of contentModelCascade()) {
    signal?.throwIfAborted();
    try {
      const session = await createModelSession({
        modelName,
        systemPrompt: '',
        tools: [],
        thinkingLevel: effort,
        maxOutputTokens: maxTokens,
        signal,
      });
      const res = await sendToSessionWithRetry(session, prompt, { signal });
      const text = res?.content || '';
      if (!text.trim()) throw new Error('empty content response');
      if (modelName !== contentModel()) console.warn(`[Content] provider recovered on ${modelName}`);
      return text;
    } catch (error) {
      signal?.throwIfAborted();
      failures.push(`${modelName}: ${error?.message || error}`);
      console.warn(`[Content] ${modelName} failed — trying the next provider: ${error?.message || error}`);
    }
  }
  throw new Error(`content generation: all providers failed (${failures.join(' | ')})`);
}

export default { generateSolText };
