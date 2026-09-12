import { createModelSession, resetSessionChat, sendToSessionWithRetry } from './sessionManager.js';
import { formatCliFunctionResponses } from './providerAdapters/cliToolProtocol.js';
import { requestSignal } from './requestCancellation.js';

// September 12: model/transport adaptation only. June still owns every
// research prompt, factor, tool invocation and final briefing. No API rung.
export const JUNE_RESEARCH_MODELS = Object.freeze(['claude-sonnet-5', 'codex-gpt-5.6-luna']);
const cappedModels = new Set();

export function juneResearchModels() {
  return [...JUNE_RESEARCH_MODELS];
}

export async function createJuneResearchSession(options) {
  const signal = requestSignal(options.signal);
  signal?.throwIfAborted();
  return {
    provider: 'june-research',
    modelName: JUNE_RESEARCH_MODELS[0],
    options: { ...options, signal, breakerLane: 'research', researchEffort: options.thinkingLevel || 'high' },
    signal,
    current: null,
    modelIndex: 0,
    history: [],
    exhausted: false,
  };
}

function userText(session, message, options) {
  return session.options.tools && options.isFunctionResponse && Array.isArray(message)
    ? formatCliFunctionResponses(message)
    : typeof message === 'string' ? message : JSON.stringify(message);
}

export async function sendToJuneResearchSession(session, message, options = {}, maxRetries = 3) {
  const signal = requestSignal(options.signal, session.signal);
  signal?.throwIfAborted();
  while (!session.exhausted && session.modelIndex < JUNE_RESEARCH_MODELS.length) {
    const modelName = JUNE_RESEARCH_MODELS[session.modelIndex];
    if (cappedModels.has(modelName)) {
      session.current = null;
      session.modelIndex++;
      continue;
    }
    try {
      signal?.throwIfAborted();
      if (!session.current) {
        session.current = await createModelSession({ ...session.options, modelName, signal });
        // Carry the exact successful conversation across a provider switch.
        // No model-generated summary, repeated stat fetch, or rewritten finding.
        if (session.history.length) resetSessionChat(session.current, [...session.history]);
      }
      session.modelName = modelName;
      const response = await sendToSessionWithRetry(session.current, message, { ...options, signal }, maxRetries);
      signal?.throwIfAborted();
      session.history.push(
        { role: 'user', parts: [{ text: `USER:\n${userText(session, message, options)}` }] },
        { role: 'model', parts: [{ text: `ASSISTANT:\n${response.transcriptText ?? response.content ?? ''}` }] },
      );
      return response;
    } catch (error) {
      signal?.throwIfAborted();
      if (error.name === 'AbortError') throw error;
      if (error.isQuotaError) cappedModels.add(modelName);
      session.current = null;
      session.modelIndex++;
      const next = JUNE_RESEARCH_MODELS[session.modelIndex];
      console.warn(`[June Research] ${modelName} failed: ${error.message}${next ? ` — continuing the same research on ${next}` : ' — research unavailable; no metered fallback'}`);
    }
  }
  session.exhausted = true;
  const error = new Error('June research unavailable: Sonnet and Luna could not finish; wait for subscription capacity. No API fallback.');
  error.code = 'JUNE_RESEARCH_UNAVAILABLE';
  error.isQuotaError = true;
  throw error;
}
