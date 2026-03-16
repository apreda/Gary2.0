// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (2026 AGENTIC OPTIMIZATION)
// ═══════════════════════════════════════════════════════════════════════════
// ONLY Gemini 3 models are allowed. NEVER use Gemini 1.x or 2.x.
//
// 3.1 Pro (main) + Flash (research):
//   - Gemini 3.1 Pro: Full pipeline (Pass 1 → Pass 2.5 → Pass 3)
//   - Gemini 3 Flash: Research assistant (tool-calling investigation before Gary starts)
//   - Pro session persists throughout (no context loss)
// ═══════════════════════════════════════════════════════════════════════════

export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview';
// gemini-3-pro-preview is DEAD (shut down March 9, 2026) — cascade goes 3.1 Pro → Flash
export const GEMINI_PRO_FALLBACK = 'gemini-3-flash-preview';

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3-flash-preview',  // Flash: props, DFS, research, 429 fallback
  GEMINI_PRO_MODEL,          // Primary: Game picks investigation + evaluation + decision
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

// Flash research timeout — generous to accommodate full investigation
// Flash does 25+ stat calls + 6+ grounding searches (~20s each) + 5+ Gemini API calls
// Real-world observed: 27 stat + 6 grounding + 5 iterations ≈ 250s
export const RESEARCH_BRIEFING_TIMEOUT_MS = 420000; // 420 seconds (7 min) — WBC/international games need more grounding searches

console.log(`[Orchestrator] Gemini 3.1 Pro (main) + Flash (research + grounding)`);
