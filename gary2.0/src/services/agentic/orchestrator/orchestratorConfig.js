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

// Primary model for all flows (game picks, props, DFS, research).
// Flash is fast enough and the reasoning benchmarks are close to Pro — default everywhere.
export const GEMINI_PRO_MODEL = 'gemini-3-flash-preview';
// Fallback when Flash 429s or errors — switch to 3.1 Pro so we keep generating picks.
// (gemini-3-pro-preview was shut down March 9, 2026 — do not reintroduce it.)
export const GEMINI_PRO_FALLBACK = 'gemini-3.1-pro-preview';

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3-flash-preview',  // Primary: game picks, props, DFS, research
  'gemini-3.1-pro-preview',  // Fallback: when Flash is throttled or failing
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
export const RESEARCH_BRIEFING_TIMEOUT_MS = 3600000; // 1 hour — let research finish naturally, never kill due to time

console.log(`[Orchestrator] Flash primary + 3.1 Pro fallback (research + grounding)`);
