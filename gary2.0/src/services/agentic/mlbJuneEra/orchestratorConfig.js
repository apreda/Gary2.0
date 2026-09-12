// ═══ THE JUNE ENGINE, VERBATIM (commit c27db5f0, Jun 15 2026) ═══
// ADAPTED (models only). Every other line is June's.
// June: brain gemini-3.5-flash (GEMINI_PRO_MODEL), research assistant
// gemini-3-flash-preview (GEMINI_FLASH_MODEL), fallback brain
// GEMINI_PRO_FALLBACK. The same three roles, June's names kept so the June
// code reads unchanged, filled by the models the house runs today.
import { MLB_JUNE_BRAIN_MODEL, DESK_FALLBACK_MODELS } from '../orchestrator/orchestratorConfig.js';
import { JUNE_RESEARCH_MODELS } from '../orchestrator/juneResearchSession.js';
export const GEMINI_PRO_MODEL = MLB_JUNE_BRAIN_MODEL;
export const GEMINI_FLASH_MODEL = JUNE_RESEARCH_MODELS[0];
export const GEMINI_PRO_FALLBACK = DESK_FALLBACK_MODELS.find((m) => m !== MLB_JUNE_BRAIN_MODEL) || MLB_JUNE_BRAIN_MODEL;
export const ALLOWED_GEMINI_MODELS = [GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL, GEMINI_PRO_FALLBACK];
export function validateGeminiModel(model) { return model; }

export const CONFIG = {
  maxIterations: 15,
  maxTokens: 65536,
  gemini: {
    // Gemini 3.x: per Google's official migration guide (May 2026), temperature,
    // top_p, and top_k are no longer recommended. The model is optimized for
    // its own internal defaults — explicit values can hurt reasoning quality.
    // For determinism, prefer system-instruction rules (which we already do)
    // over fiddling with sampling parameters.
    grounding: {
      enabled: true
    }
  }
};

// Gemini safety settings - BLOCK_NONE for sports content
export const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

// Flash research timeout — generous to accommodate full investigation
// Flash does 25+ stat calls + 6+ grounding searches (~20s each) + 5+ Gemini API calls
// Real-world observed: 27 stat + 6 grounding + 5 iterations ≈ 250s
export const RESEARCH_BRIEFING_TIMEOUT_MS = 3600000; // 1 hour — let research finish naturally, never kill due to time

console.log(`[JuneEngine] brain ${GEMINI_PRO_MODEL} + research ${GEMINI_FLASH_MODEL} + fallback ${GEMINI_PRO_FALLBACK} (June 15 2026 engine, models adapted)`);
