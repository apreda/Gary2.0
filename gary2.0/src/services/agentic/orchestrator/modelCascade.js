// Shared text reader: Claude subscription → business GPT → personal GPT → DeepSeek.
import { subscriptionRoutes } from './subscriptionRoutes.js';
import { createSubscriptionSession, sendToSubscriptionSession } from './subscriptionSession.js';
export const SOL_MODEL = 'gpt-5.6-sol';
export const TERRA_MODEL = 'codex-gpt-5.6-terra';
export const LIGHT_CLAUDE_RUNG = 'claude-sonnet-5';
export const LAST_RESORT = 'deepseek';
export const RUNG_RESERVE_MS = 150000;
export const MIN_RUNG_MS = 30000;
export const cascadeFor = (primary, tier = 'heavy') => subscriptionRoutes(primary, { tier }).map(r => r.model);
export const HEAVY_CASCADE = cascadeFor(SOL_MODEL, 'heavy');
export const LIGHT_CASCADE = cascadeFor(SOL_MODEL, 'light');
export async function cascadeRead(prompt, options = {}) {
  const primary = options.model || SOL_MODEL;
  const session = createSubscriptionSession({ modelName: primary, systemPrompt: options.systemPrompt || '',
    thinkingLevel: options.effort || 'high', browse: options.search || false, signal: options.signal,
    timeoutMs: options.timeoutMs || 600000, _costTracker: options._costTracker,
    subscriptionRoutes: subscriptionRoutes(primary, { tier: options.tier || 'heavy' }), tools: [] });
  try {
    const response = await sendToSubscriptionSession(session, prompt, options);
    return { success: true, data: response.content, raw: response.transcriptText || response.content, model: response.model, accountRoute: response.accountRoute };
  } catch (error) { options.signal?.throwIfAborted(); return { success: false, error: error.message }; }
}
export const cascadeOneShot = (tier, breakerKey) => (prompt, options = {}) => cascadeRead(prompt, { ...options, tier, breakerKey });
