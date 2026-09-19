/**
 * DeepSeek one-shot adapter — the cascade's last resort (founder, Sep 18 2026:
 * "lets do a final deepseek fail back").
 *
 * On Sep 18 every $0 rung ran dry at once: Fable hit its subscription limit
 * ("You've reached your Fable limit", 87 times), the Codex Plus login was
 * capped, Astra was unavailable, and all sixteen of the day's picks came out of
 * claude-opus-5, the last rung standing. This is the rung below that one, so an
 * empty supply stops costing Gary a slate.
 *
 * It is METERED, unlike every rung above it, so it sits dead last in both tiers
 * and is reached only when nothing free could answer.
 *
 * NO KEY IS NOT AN ERROR. Without DEEPSEEK_API_KEY the rung reports itself
 * unconfigured and the cascade simply ends where it used to end — adding this
 * file changes nothing until a key exists.
 *
 * DeepSeek speaks the OpenAI chat-completions shape, not the Responses API that
 * openaiSession.js targets, and the cascade needs a one-shot rather than a
 * chained session, so this stays deliberately small.
 */

const DEEPSEEK_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';

/** The served model id, overridable because DeepSeek renames faster than we redeploy. */
export const deepseekModel = () => process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const DEEPSEEK_RUNG = 'deepseek';

export const deepseekConfigured = (env = process.env) => Boolean(env.DEEPSEEK_API_KEY);

/** True for the cascade's rung name, so callers need not know the model id. */
export const isDeepseekRung = model => String(model || '').startsWith('deepseek');

/**
 * One request, one answer. Returns the shape codexCliOneShot returns, so the
 * cascade treats it like any other rung.
 */
export async function deepseekOneShot(prompt, options = {}) {
  const { systemPrompt = '', timeoutMs = 120_000, signal, _costTracker = null } = options;
  if (!deepseekConfigured()) return { success: false, error: 'DeepSeek is not configured (DEEPSEEK_API_KEY is unset)' };
  const model = options.model && isDeepseekRung(options.model) ? deepseekModel() : (options.model || deepseekModel());
  const messages = [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: String(prompt) }];
  const timer = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: signal ? AbortSignal.any([signal, timer]) : timer,
    });
    if (!response.ok) {
      // The body carries DeepSeek's own reason (quota, auth, bad model id);
      // an unread body would leave the run record saying only "HTTP 400".
      const body = await response.text().catch(() => '');
      return { success: false, error: `DeepSeek HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}` };
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return { success: false, error: 'DeepSeek returned no content' };
    // DeepSeek reports OpenAI-style usage, but its cache count is NOT the
    // top-level `cached_tokens` addUsage reads — it arrives as
    // prompt_cache_hit_tokens, and nested under prompt_tokens_details
    // (verified live Sep 18 2026). Left unmapped, every cached read would be
    // billed in the report at full input rate. Recorded under the SERVED model
    // id, so an unrecognised id shows as an unpriced call rather than
    // borrowing another model's rate.
    const usage = payload?.usage;
    if (_costTracker && usage) {
      _costTracker.addUsage?.(model, { ...usage,
        cached_tokens: usage.cached_tokens ?? usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0 });
    }
    return { success: true, data: content, raw: content, model: DEEPSEEK_RUNG, usage };
  } catch (error) {
    return { success: false, error: `DeepSeek: ${error.message}` };
  }
}

export default { deepseekOneShot, deepseekConfigured, deepseekModel, isDeepseekRung, DEEPSEEK_RUNG };
