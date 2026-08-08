/**
 * Content-pass text adapter for the insights pipeline (Jul 27 2026, Sol-only
 * mandate; provider seam Jul 29): the drop-in replacement for
 * geminiService.generateResponse in the hub/fantasy computers. One prompt in,
 * prose/JSON text out, no tools, low reasoning — these are content passes,
 * not picks.
 *
 * Routing (Jul 29, subscription bridge + cost consolidation): the call rides
 * the sessionManager provider seam, so the model is config, not plumbing.
 * GARY_CONTENT_MODEL_OVERRIDE picks the content brain explicitly (the bridge
 * plists set claude-sonnet-5 — its own weekly bucket, $0 marginal); the
 * DEFAULT is gemini-3.6-flash at high thinking (founder, Jul 29: content
 * write-ups get "3.6 Flash on high reasoning" — never Sol's $5/$30 again).
 */
import { createGeminiSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { DESK_FALLBACK_MODELS } from '../agentic/orchestrator/orchestratorConfig.js';

export const contentModel = () => process.env.GARY_CONTENT_MODEL_OVERRIDE || 'gemini-3.6-flash';
export const contentModelCascade = () => [...new Set([contentModel(), ...DESK_FALLBACK_MODELS])];

export async function generateSolText(prompt, { maxTokens = 4000, effort = 'high' } = {}) {
  const failures = [];
  for (const modelName of contentModelCascade()) {
    try {
      const session = await createGeminiSession({
        modelName,
        systemPrompt: '',
        tools: [],
        thinkingLevel: effort,
        maxOutputTokens: maxTokens,
      });
      const res = await sendToSessionWithRetry(session, prompt, {});
      const text = res?.content || '';
      if (!text.trim()) throw new Error('empty content response');
      if (modelName !== contentModel()) console.warn(`[Content] provider recovered on ${modelName}`);
      return text;
    } catch (error) {
      failures.push(`${modelName}: ${error?.message || error}`);
      console.warn(`[Content] ${modelName} failed — trying the next provider: ${error?.message || error}`);
    }
  }
  throw new Error(`content generation: all providers failed (${failures.join(' | ')})`);
}

export default { generateSolText };
