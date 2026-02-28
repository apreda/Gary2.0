import { GoogleGenerativeAI } from '@google/generative-ai';

let gemini;

export function getGemini() {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    gemini = new GoogleGenerativeAI(apiKey, "v1beta");
  }
  return gemini;
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (2026 AGENTIC OPTIMIZATION)
// ═══════════════════════════════════════════════════════════════════════════
// ONLY Gemini 3 models are allowed. NEVER use Gemini 1.x or 2.x.
//
// DUAL-MODEL (All sports): 3.1 Pro investigates + decides, 3 Pro builds cases
//   - Gemini 3.1 Pro: Full pipeline (Pass 1 → Pass 2.5 → Pass 3)
//   - Gemini 3 Pro: Independent Steel Man case builder (spawned at coverage threshold)
//   - Advisor receives 3.1 Pro's data (text only, no tools) → builds bilateral cases
//   - 3.1 Pro evaluates advisor's cases (never writes its own cases)
//   - Eliminates confirmation bias: the investigator is not the case writer
//
// IMPORTANT: Advisor and main Pro run as separate sessions (no signature conflicts)
//   - Advisor session is ephemeral (one API call, then discarded)
//   - Main Pro session persists throughout (no context loss)
//   - If advisor fails, the pick fails (no silent fallback to biased cases)
// ═══════════════════════════════════════════════════════════════════════════

export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_PRO_FALLBACK = 'gemini-3-pro-preview';  // Also used as independent advisor model

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3-flash-preview',  // Flash: used for scout report tool calling
  GEMINI_PRO_MODEL,          // Primary: Investigation + Evaluation + Final Decision
  GEMINI_PRO_FALLBACK,       // Advisor: Independent Steel Man case builder + Pro fallback
];

export function validateGeminiModel(model) {
  if (!ALLOWED_GEMINI_MODELS.includes(model)) {
    console.error(`[MODEL POLICY VIOLATION] Attempted to use "${model}" - not in allowed list!`);
    console.error(`[MODEL POLICY] Allowed models: ${ALLOWED_GEMINI_MODELS.join(', ')}`);
    return 'gemini-3-flash-preview';
  }
  return model;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SELECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  maxIterations: 15,
  maxTokens: 65536,
  gemini: {
    // Gemini 3: Temperature MUST be 1.0 per Google recommendation
    temperature: 1.0,
    topP: 0.95,

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

// Flash research needs a longer timeout than advisor Steel Man cases
// Flash does 25+ stat calls + 6+ grounding searches (~20s each) + 5+ Gemini API calls
// Real-world observed: 27 stat + 6 grounding + 5 iterations ≈ 250s
export const RESEARCH_BRIEFING_TIMEOUT_MS = 300000; // 300 seconds (5 min)

console.log(`[Orchestrator] Gemini 3.1 Pro (main) + 3 Pro (advisor) + Flash (grounding)`);
