import { validateSessionModel } from './orchestratorConfig.js';
import { isOpenAiModel, createOpenAISession, sendToOpenAISession, resetOpenAISessionChat } from './providerAdapters/openaiSession.js';
import { isClaudeCliModel, createClaudeCliSession, sendToClaudeCliSession, resetClaudeCliSessionChat } from './providerAdapters/claudeCliSession.js';
import { isCodexCliModel, createCodexCliSession, sendToCodexCliSession, resetCodexCliSessionChat } from './providerAdapters/codexCliSession.js';
import { isAnthropicApiModel, createAnthropicApiSession, sendToAnthropicApiSession, resetAnthropicApiSessionChat } from './providerAdapters/anthropicApiSession.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { requestSignal } from './requestCancellation.js';

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT SESSION MANAGEMENT — the provider seam.
// The function names keep their Gemini-era spellings (createModelSession /
// sendToSession…) for call-site stability, but since Aug 24 2026 every session
// routes to an adapter: OpenAI API, Anthropic API, Claude CLI bridge, or the
// codex CLI bridge. Gemini itself is retired (founder: "no more gemini for
// anything"); its client, explicit-cache machinery, and response parsing were
// excised with the vendor.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a persistent chat session on whichever adapter the model name selects.
 *
 * @param {Object} options - Session configuration
 * @param {string} options.modelName - Model to use (codex-, claude-, anthropic-, or gpt- family)
 * @param {string} options.systemPrompt - System instruction for the session
 * @param {Array} options.tools - Function calling tools (optional)
 * @param {string} options.thinkingLevel - Thinking level: 'low', 'medium', 'high' (default: 'high')
 * @returns {Object} - Provider session object
 */
export async function createModelSession(options = {}) {
  // VENDOR BAN FIRST (founder, Aug 24 2026: "no more gemini for anything").
  // validateSessionModel refuses any gemini-* or unknown name and reroutes it
  // to the research default — BEFORE adapter routing, so the coerced name
  // lands in a real adapter below. Every family the validator allows has an
  // adapter (gpt- / anthropic- / claude / codex-), which makes the old
  // Gemini session tail below unreachable; it now throws if ever entered.
  const requestedModel = validateSessionModel(options.modelName);
  if (requestedModel !== options.modelName) {
    options = { ...options, modelName: requestedModel };
  }
  // Provider seam (Jul 6 2026 bake-off): non-Gemini brains route to their
  // adapter. GARY_MODEL_OVERRIDE is the only switch — agentLoop and the
  // callers stay provider-blind.
  if (isOpenAiModel(options.modelName)) {
    return createOpenAISession(options);
  }
  if (isAnthropicApiModel(options.modelName)) {
    return createAnthropicApiSession(options);
  }
  if (isClaudeCliModel(options.modelName)) {
    return createClaudeCliSession(options);
  }
  if (isCodexCliModel(options.modelName)) {
    return createCodexCliSession(options);
  }
  throw new Error(`[Session] Gemini session path is retired (founder, Aug 24 2026) — "${options.modelName}" reached the dead tail; validateSessionModel should have rerouted it`);
}

export function resetSessionChat(session, seedHistory = []) {
  if (session?.provider === 'openai') {
    return resetOpenAISessionChat(session, seedHistory);
  }
  if (session?.provider === 'anthropic-api') {
    return resetAnthropicApiSessionChat(session, seedHistory);
  }
  if (session?.provider === 'claude-cli') {
    return resetClaudeCliSessionChat(session, seedHistory);
  }
  if (session?.provider === 'codex-cli') {
    return resetCodexCliSessionChat(session, seedHistory);
  }
  throw new Error(`[Session] unknown provider "${session?.provider}" — Gemini sessions are retired (Aug 24 2026)`);
}

/**
 * Send a message to a persistent chat session
 * Handles both text messages and function responses (single or batched)
 * SDK automatically preserves thought signatures
 *
 * @param {Object} session - Session from createModelSession
 * @param {string|Array} message - Text content OR array of function responses
 * @param {Object} options - Additional options
 * @param {boolean} options.isFunctionResponse - True if message contains function responses
 * @returns {Object} - Parsed response with content, toolCalls, usage
 */
export async function sendToSession(session, message, options = {}) {
  const signal = requestSignal(options.signal, session?.signal);
  signal?.throwIfAborted();
  options = { ...options, signal };
  if (session?.provider === 'openai') {
    return sendToOpenAISession(session, message, options);
  }
  if (session?.provider === 'anthropic-api') {
    return sendToAnthropicApiSession(session, message, options);
  }
  if (session?.provider === 'claude-cli') {
    return sendToClaudeCliSession(session, message, options);
  }
  if (session?.provider === 'codex-cli') {
    return sendToCodexCliSession(session, message, options);
  }
  throw new Error(`[Session] unknown provider "${session?.provider}" — Gemini sessions are retired (Aug 24 2026)`);
}

/**
 * Retry wrapper for sendToSession with exponential backoff
 * @param {Object} session - Gemini session
 * @param {string|Array} message - Message to send
 * @param {Object} options - Options for sendToSession
 * @param {number} maxRetries - Max retry attempts (default 3)
 * @returns {Object} - Response from sendToSession
 */
export async function sendToSessionWithRetry(session, message, options = {}, maxRetries = 3) {
  const signal = requestSignal(options.signal, session?.signal);
  signal?.throwIfAborted();
  options = { ...options, signal };
  // Transient network failures get extra attempts beyond maxRetries: local
  // DNS blips (getaddrinfo ENOTFOUND) outlasted the original ~7s retry
  // window and killed a full analysis (June 3 2026 — Tigers @ Rays lost its
  // pick to a mid-analysis "fetch failed"). 5 attempts ≈ 52s of cover.
  const NETWORK_MAX_ATTEMPTS = Math.max(maxRetries, 5);

  for (let attempt = 1; ; attempt++) {
    try {
      return await sendToSession(session, message, options);
    } catch (error) {
      signal?.throwIfAborted();
      if (error.name === 'AbortError') throw error;
      // Don't retry quota errors - they need manual intervention or fallback
      // (the model cascade handles 429s).
      if (error.isQuotaError) {
        throw error;
      }

      // Network-level failures: fetch failed, ECONNRESET, ETIMEDOUT,
      // ENOTFOUND, socket hang up — transient, retried with extra headroom.
      const errorMsg = error.message?.toLowerCase() || '';
      const isNetworkError =
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('econnreset') ||
        errorMsg.includes('etimedout') ||
        errorMsg.includes('enotfound') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('connection') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT';

      // Retry on server errors (500, 503), blocked responses, malformed function calls, AND network failures
      // MALFORMED_FUNCTION_CALL: Model generated invalid function call JSON - transient, retry usually succeeds
      const isRetryable =
        isNetworkError ||
        error.status >= 500 ||
        error.message?.includes('500') ||
        error.message?.includes('503') ||
        error.message?.includes('blocked') ||
        error.message?.includes('MALFORMED_FUNCTION_CALL') || // Explicit check for malformed function calls
        error.message?.includes('UNEXPECTED_TOOL_CALL') || // Model tried to call tools when not expected
        error.message?.includes('UNAVAILABLE');

      const maxAttempts = isNetworkError ? NETWORK_MAX_ATTEMPTS : maxRetries;
      if (!isRetryable || attempt >= maxAttempts) {
        throw error;
      }

      // Exponential backoff: 2s, 5s, 15s, 30s
      const backoffDelays = [2000, 5000, 15000, 30000];
      const delay = backoffDelays[attempt - 1] || 30000;
      console.log(`[Session] ⚠️ Retryable error (attempt ${attempt}/${maxAttempts}): ${error.message?.slice(0, 80)}...`);
      console.log(`[Session] 🔄 Waiting ${delay/1000}s before retry...`);
      await sleep(delay, undefined, { signal });
    }
  }
}
