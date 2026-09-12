// ═══ THE JUNE ENGINE, VERBATIM (commit c27db5f0, Jun 15 2026) ═══
// ADAPTED (models only). Every other line is June's.
// June created Gemini sessions here. Gemini is retired; the same options
// ({ modelName, systemPrompt, tools, thinkingLevel, _costTracker }) and the
// same { content, toolCalls, usage } contract now come from today's adapters
// (Codex CLI, Claude CLI, Anthropic API) — the model names are the difference.
import { createModelSession, sendToSession as sendModel, sendToSessionWithRetry as retryModel } from '../orchestrator/sessionManager.js';
import { createJuneResearchSession, sendToJuneResearchSession } from '../orchestrator/juneResearchSession.js';

export async function createGeminiSession(options = {}) {
  // June's literal research model is mapped here, before the global vendor
  // ban can redirect it to metered Haiku. Brain sessions keep their own model.
  return options.modelName === 'gemini-3-flash-preview'
    ? createJuneResearchSession(options)
    : createModelSession(options);
}

export function sendToSession(session, message, options = {}) {
  return session.provider === 'june-research'
    ? sendToJuneResearchSession(session, message, options, 1)
    : sendModel(session, message, options);
}

export function sendToSessionWithRetry(session, message, options = {}, maxRetries = 3) {
  return session.provider === 'june-research'
    ? sendToJuneResearchSession(session, message, options, maxRetries)
    : retryModel(session, message, options, maxRetries);
}
