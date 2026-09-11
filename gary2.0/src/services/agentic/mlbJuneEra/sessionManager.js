// ═══ THE JUNE ENGINE, VERBATIM (commit c27db5f0, Jun 15 2026) ═══
// ADAPTED (models only). Every other line is June's.
// June created Gemini sessions here. Gemini is retired; the same options
// ({ modelName, systemPrompt, tools, thinkingLevel, _costTracker }) and the
// same { content, toolCalls, usage } contract now come from today's adapters
// (Codex CLI, Claude CLI, Anthropic API) — the model names are the difference.
import { createModelSession, sendToSession, sendToSessionWithRetry } from '../orchestrator/sessionManager.js';
export async function createGeminiSession(options = {}) { return createModelSession(options); }
export { sendToSession, sendToSessionWithRetry };
