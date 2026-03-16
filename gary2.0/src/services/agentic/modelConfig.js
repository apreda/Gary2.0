/**
 * Gemini model constants and client factory — single source of truth.
 *
 * All model name strings and the shared GoogleGenerativeAI client live here
 * so every service references the same values.
 *
 * KEY ROTATION: When the primary API key hits quota (429), call rotateToBackupKey()
 * to switch all clients to the backup key. This is automatic — all services that
 * use getGeminiClient() will get the new key on their next call.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Model identifiers ───────────────────────────────────────────────────────

/** Gemini 3 Flash — grounding, props, fallback, and lightweight tasks */
export const GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

/** Gemini 3.1 Pro — primary model for main picks via orchestrator */
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';

/** Flash — fallback when 3.1 Pro quota is exhausted (gemini-3-pro is dead since March 2026) */
export const GEMINI_PRO_FALLBACK = 'gemini-3-flash-preview';

/** Models the system is permitted to use */
const ALLOWED_GEMINI_MODELS = [
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
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

// ── Shared Gemini client factory with key rotation ──────────────────────────

/** Lazy-init singleton for standard API (v1) */
let _client = null;
/** Lazy-init singleton for v1beta API (grounding, etc.) */
let _clientBeta = null;
/** Track which key is active */
let _usingBackupKey = false;

/**
 * Get the active API key (primary or backup after rotation).
 */
function getActiveApiKey() {
  if (_usingBackupKey) {
    const backup = (() => { try { return process.env.GEMINI_API_KEY_BACKUP; } catch { return undefined; } })();
    if (backup) return backup;
    // Backup not set, fall through to primary
    console.warn('[Model Config] GEMINI_API_KEY_BACKUP not set — staying on primary key');
    _usingBackupKey = false;
  }
  const primary = (() => { try { return process.env.GEMINI_API_KEY; } catch { return undefined; } })();
  if (!primary) throw new Error('GEMINI_API_KEY environment variable is required');
  return primary;
}

/**
 * Rotate to the backup API key. Clears all cached clients so the next
 * getGeminiClient() call creates new ones with the backup key.
 * Returns true if rotation succeeded, false if no backup key available.
 */
export function rotateToBackupKey() {
  if (_usingBackupKey) {
    console.warn('[Model Config] Already on backup key — no further rotation available');
    return false;
  }
  const backup = (() => { try { return process.env.GEMINI_API_KEY_BACKUP; } catch { return undefined; } })();
  if (!backup) {
    console.warn('[Model Config] No GEMINI_API_KEY_BACKUP set — cannot rotate');
    return false;
  }
  console.log('[Model Config] 🔄 Rotating to backup API key');
  _usingBackupKey = true;
  _client = null;
  _clientBeta = null;
  return true;
}

/** Check if we're currently on the backup key */
export function isUsingBackupKey() {
  return _usingBackupKey;
}

/** Reset to primary API key. Used when falling to a lower model tier. */
export function resetToPrimaryKey() {
  if (!_usingBackupKey) return;
  console.log('[Model Config] 🔄 Resetting to primary API key');
  _usingBackupKey = false;
  _client = null;
  _clientBeta = null;
}

/**
 * Get (or create) a GoogleGenerativeAI client singleton.
 * @param {{ beta?: boolean }} opts  Pass `{ beta: true }` for the v1beta endpoint.
 * @returns {GoogleGenerativeAI}
 */
export function getGeminiClient({ beta = false } = {}) {
  const apiKey = getActiveApiKey();

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
