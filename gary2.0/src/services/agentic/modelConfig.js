/**
 * Gemini model constants and client factory — single source of truth.
 *
 * All model name strings and the shared GoogleGenerativeAI client live here
 * so every service references the same values.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Model identifiers ───────────────────────────────────────────────────────

/** Gemini 3 Flash — grounding, props, fallback, and lightweight tasks */
export const GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

/** Gemini 3.1 Pro — primary model for main picks via orchestrator */
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';

/** Gemini 3 Pro — fallback when 3.1 Pro quota is exhausted */
export const GEMINI_PRO_FALLBACK = 'gemini-3-pro-preview';

/** Models the system is permitted to use */
const ALLOWED_GEMINI_MODELS = [
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  GEMINI_PRO_FALLBACK,
];

/**
 * Validate a model name against the allow-list.
 * Returns the model unchanged if valid, or falls back to Flash.
 */
export function validateGeminiModel(model) {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) {
    console.error(`[MODEL POLICY VIOLATION] Attempted to use "${model}" - not in allowed list!`);
    console.error(`[MODEL POLICY] Allowed models: ${ALLOWED_GEMINI_MODELS.join(', ')}`);
    return GEMINI_FLASH_MODEL;
  }
  return model;
}

// ── Shared Gemini client factory ────────────────────────────────────────────

/** Lazy-init singleton for standard API (v1) */
let _client = null;
/** Lazy-init singleton for v1beta API (grounding, etc.) */
let _clientBeta = null;

/**
 * Get (or create) a GoogleGenerativeAI client singleton.
 * @param {{ beta?: boolean }} opts  Pass `{ beta: true }` for the v1beta endpoint.
 * @returns {GoogleGenerativeAI}
 */
export function getGeminiClient({ beta = false } = {}) {
  const apiKey = (() => {
    try { return process.env.GEMINI_API_KEY; } catch { return undefined; }
  })();

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }

  if (beta) {
    if (!_clientBeta) {
      _clientBeta = new GoogleGenerativeAI(apiKey, 'v1beta');
    }
    return _clientBeta;
  }

  if (!_client) {
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}
