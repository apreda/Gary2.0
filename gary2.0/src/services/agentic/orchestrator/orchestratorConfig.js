// September 19 account policy: Claude subscription → business GPT → personal
// GPT → configured DeepSeek. College decisions retain Sol and remain paused.
export const GAME_PICK_MODEL = process.env.GARY_MODEL_OVERRIDE || 'claude-fable-5-1';

// Founder Sep 12: included subscription capacity first, then real money.
// Applies to the shared NFL/NBA researcher; MLB's frozen June adapter carries
// the same order while preserving its exact successful research conversation.
export const GAME_RESEARCH_MODEL = process.env.GARY_RESEARCH_MODEL || 'claude-sonnet-5';
export const GAME_RESEARCH_FALLBACK_MODEL = process.env.GARY_RESEARCH_FALLBACK_MODEL || 'codex-gpt-5.6-terra';
export const GAME_RESEARCH_BRIDGE_MODEL = process.env.GARY_RESEARCH_BRIDGE_MODEL || 'deepseek';
// Same game model policy for the preserved June MLB engine.
// GARY_MLB_BRAIN_MODEL is the explicit per-lane override.
export const MLB_JUNE_BRAIN_MODEL = process.env.GARY_MLB_BRAIN_MODEL || 'claude-fable-5-1';

// HOUSE LIMIT (founder, Aug 18 — restored from the pickdesk-era -179 rule):
// no moneyline heavier than this ships to users. Payout law, not value
// steering: on a game priced past the cap the market is the runline/spread,
// not the winner. Enforced belt-and-suspenders in agentLoop with one
// corrective re-ask; the menu clause lives in Pass 2.
export const GAME_ML_CAP = Number(process.env.GARY_ML_CAP || -179);
// ═══ GEMINI ERADICATED (founder order, Aug 24 2026) ═══
// "no more gemini for anything" — after the Google billing dunning
// (project 704963887148) silently killed recaps, the Wire, and the tweet
// composer for four days, every lane runs Anthropic (API or subscription
// bridge) or ChatGPT (codex bridge / OpenAI API). No Gemini model may be a
// primary, a fallback, or a default anywhere. The legacy constants below
// now resolve to the brains we actually run so an env-less spawn can never
// land on a dead vendor (same lesson as solText, Aug 21).
// Legacy caller compatibility; sessionManager applies the subscription policy. LEGACY_BRAIN_MODEL deleted Sep 1 2026, zero consumers;
// ⚑verify the pinned NBA pick path before its season opens (~Oct 1).
export const LEGACY_BRAIN_FALLBACK = 'claude-sonnet-5';
// validateSessionModel's reroute target for refused model names.
export const LEGACY_RESEARCH_MODEL = 'claude-sonnet-5';
// Founder Sep 16: props use Sol. Keep medium effort and the existing Claude
// subscription fallbacks. The Codex account gate restricts props to Plus;
// personal Pro follows the business subscription across lanes; DeepSeek is last.
export const PROPS_DESK_MODEL = process.env.GARY_PROPS_MODEL_OVERRIDE || 'codex-gpt-5.6-sol';
// sessionManager owns account recovery; never restart its exhausted cascade.
export const PROPS_CASCADE = [PROPS_DESK_MODEL];
export const PROPS_EFFORT = process.env.GARY_PROPS_EFFORT || 'medium';

// Each model/account restarts the same game engine with complete data.
// Required-data failures remain terminal; they never justify another brain.
// gameBrainRoutes resolves the current subscription account order.
export const GAME_FALLBACK_MODELS = ['codex-gpt-6-astra'].filter((m) => m !== GAME_PICK_MODEL);

// Non-game consumers retain their existing Sol/Fable choices independently
// of the game brain. Content's own subscription policy still filters Claude.
export const DESK_FALLBACK_MODELS = ['codex-gpt-5.6-sol', 'claude-fable-5-1'];

// $ per 1M tokens [input, output] — desk-lane cost logging only, not billing.
// Bridge entries are $0 (no marginal token cost on a subscription); the
// anthropic- API rungs are metered and logged at list price.
export const DESK_COST_PER_M = {
  'codex-gpt-6-astra': [0, 0],
  'gpt-5.6-sol': [5, 30],
  'codex-gpt-5.6-sol': [0, 0],
  'codex-gpt-5.6-luna': [0, 0],
  'codex-gpt-5.6-terra': [0, 0],
  'claude-fable-5': [0, 0],
  'claude-fable-5-1': [0, 0],
  'claude-opus-5': [0, 0],
  'claude-sonnet-5': [0, 0],
  'anthropic-claude-opus-5': [15, 75],
  'anthropic-claude-sonnet-5': [3, 15],
};

// Session-model gate — the founder's Aug 24 vendor ban enforced at the ONE
// seam every session passes through: Anthropic and ChatGPT families pass;
// any gemini-* name is refused loudly and rerouted to the research default
// so a stale caller can never resurrect the dead vendor.
export function validateSessionModel(model) {
  const name = String(model || '');
  if (/gemini/i.test(name)) {
    console.error(`[MODEL POLICY] "${name}" refused — Gemini is retired (founder, Aug 24 2026). Routing to ${LEGACY_RESEARCH_MODEL}.`);
    return LEGACY_RESEARCH_MODEL;
  }
  if (/^(codex-|claude-|anthropic-|gpt-|deepseek)/.test(name)) return model;
  console.error(`[MODEL POLICY VIOLATION] Attempted to use "${name}" — unknown model family. Routing to ${LEGACY_RESEARCH_MODEL}.`);
  return LEGACY_RESEARCH_MODEL;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SELECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  maxIterations: 15,
  maxTokens: 65536,
};


// Flash research timeout — generous to accommodate full investigation
// Flash does 25+ stat calls + 6+ grounding searches (~20s each) + 5+ Gemini API calls
// Real-world observed: 27 stat + 6 grounding + 5 iterations ≈ 250s
export const RESEARCH_BRIEFING_TIMEOUT_MS = 3600000; // 1 hour — let research finish naturally, never kill due to time

// Machine-readable reports reserve stdout for their JSON result.
const logModelPolicy = process.argv.includes('--json') ? console.error : console.log;
logModelPolicy(`[Orchestrator] MLB June brain: ${MLB_JUNE_BRAIN_MODEL}. NBA/NFL game brain: ${GAME_PICK_MODEL}. NCAAF game brain: codex-gpt-5.6-sol. Props desk: ${PROPS_DESK_MODEL}. Account order: Claude subscription → business GPT → personal GPT → configured DeepSeek. NCAAF: one game pick and one prop for covered games.`);
