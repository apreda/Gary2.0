// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (May 2026 — Gemini 3.5 Flash GA)
// ═══════════════════════════════════════════════════════════════════════════
// ONLY Gemini 3.x models are allowed. NEVER use Gemini 1.x or 2.x.
//
// Tier 1 — Gary's brain (game picks):
//   gemini-3.5-flash (GA, May 19 2026) — outperforms 3.1 Pro on agentic
//   + coding benchmarks (Terminal-Bench 2.1: 76.2%, MCP Atlas: 83.6%),
//   $1.50/$9 vs Pro's $2/$12. Google: "particularly effective for rapid
//   agentic loops" — that's literally Gary.
//
// Tier 2 — Research assistant, props, DFS:
//   gemini-3-flash-preview ($0.50/$3) — cheap and called many times
//   per pick. Quality is sufficient for tool-calling research and
//   constrained prop selection.
//
// Tier 3 — Fallback when Tier 1 errors / rate-limits:
//   gemini-3.1-pro-preview — different model family, similar capability,
//   keeps the pipeline producing if 3.5 Flash hiccups.
//
// Note: gemini-3-pro-preview shut down March 9, 2026 — do not reintroduce.
// ═══════════════════════════════════════════════════════════════════════════

// Primary "brain" model — used for game picks (the Gary side).
export const GEMINI_PRO_MODEL = 'gemini-3.5-flash';
// Fallback when the primary errors / rate-limits.
export const GEMINI_PRO_FALLBACK = 'gemini-3.1-pro-preview';
// Cheaper Flash for research, props, DFS, and tool-calling investigation.
export const GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3.5-flash',         // Tier 1: Gary's brain — game picks
  'gemini-3-flash-preview',   // Tier 2: research, props, DFS
  'gemini-3.1-pro-preview',   // Tier 3: fallback only
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

console.log(`[Orchestrator] ${GEMINI_PRO_MODEL} primary + ${GEMINI_FLASH_MODEL} research + ${GEMINI_PRO_FALLBACK} fallback`);
