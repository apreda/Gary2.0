// ═══════════════════════════════════════════════════════════════════════════
// MODEL POLICY (Sep 1 2026 — the founder's Claude weekly subscription carries
// ZERO Gary traffic). Two vendors, three roles:
//   · ChatGPT codex bridge ($0 on GPT Pro): every game/props BRAIN, every
//     CONTENT pass, and the first grounded-SEARCH rung.
//   · Metered APIs as rare fallbacks only: OpenAI Responses web_search, then
//     Anthropic server search; the model cascade's anthropic- rungs.
//   · The Claude CLI adapter still exists as plumbing but nothing in
//     production names a claude-* model anymore.
// Gemini stays eradicated (founder, Aug 24: "no more gemini for anything");
// the session seam (validateSessionModel below) refuses any gemini-* name.
// ═══════════════════════════════════════════════════════════════════════════

// Non-MLB game lanes' configured brain; production's scheduler plist sets
// GARY_MODEL_OVERRIDE=codex-gpt-6-astra so every game brain rides the bridge.
export const GAME_PICK_MODEL = process.env.GARY_MODEL_OVERRIDE || 'codex-gpt-6-astra';

// THE RESEARCHER IS DEAD (founder, Aug 27 2026 — all sports): the desk is the
// entire evidence and the brains run tool-less. GAME_RESEARCH_MODEL survives
// ONLY as validateSessionModel's reroute target for refused model names.
// THE RESEARCH ASSISTANT (founder, Sep 3 2026: "use Haiku then Luna when
// Haiku is out of money — simple"): the Aug 18 Haiku researcher first
// (metered, ~12¢ a game); if the Anthropic key is out of credit or the call
// fails, Luna through the Codex bridge in tools mode — $0 on the sub, a
// different model from Gary's Astra.
export const GAME_RESEARCH_MODEL = process.env.GARY_RESEARCH_MODEL || 'anthropic-claude-haiku-4-5';
export const GAME_RESEARCH_FALLBACK_MODEL = process.env.GARY_RESEARCH_FALLBACK_MODEL || 'codex-gpt-5.6-luna';
// (MLB_RESEARCH_MODEL deleted Sep 1 2026 — zero consumers after the
// researcher kill.)
// The MLB June brain: Astra on the codex bridge (founder GO, Sep 4 2026).
// GARY_MLB_BRAIN_MODEL is the explicit per-lane override.
export const MLB_JUNE_BRAIN_MODEL = process.env.GARY_MLB_BRAIN_MODEL || 'codex-gpt-6-astra';

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
// Props-cascade last resort (metered Anthropic API — carries tools if a lane
// ever needs them). LEGACY_BRAIN_MODEL deleted Sep 1 2026, zero consumers;
// ⚑verify the pinned NBA pick path before its season opens (~Oct 1).
export const LEGACY_BRAIN_FALLBACK = 'anthropic-claude-haiku-4-5';
// validateSessionModel's reroute target for refused model names.
export const LEGACY_RESEARCH_MODEL = 'anthropic-claude-haiku-4-5';
// Props lane default = the brain the plists actually set (codex bridge).
export const PROPS_DESK_MODEL = process.env.GARY_PROPS_MODEL_OVERRIDE || 'codex-gpt-6-astra';

// Quota cascade for the desk lanes (founder approved Jul 29, after the Jul 28
// OpenAI balance outage shipped 6 games with no pick): when a desk brain
// throws — quota/429 first among the causes — the SAME desk re-runs on these
// models in order at their top thinking level.
// Sep 1 2026 (founder: Claude CLI OUT of the pick lane — his weekly Claude
// subscription usage never rides Gary's picks): the Anthropic rungs moved
// from the CLI bridge to the metered API (anthropic- prefix). They fire only
// when the codex bridge fails a whole game — a rare, cross-vendor last resort.
// The chain filters out the primary so a quota error never retries itself.
export const DESK_FALLBACK_MODELS = ['codex-gpt-5.6-sol', 'anthropic-claude-opus-5', 'anthropic-claude-sonnet-5'].filter((m) => m !== GAME_PICK_MODEL);

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
  if (/^(codex-|claude-|anthropic-|gpt-)/.test(name)) return model;
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

console.log(`[Orchestrator] MLB June brain: ${MLB_JUNE_BRAIN_MODEL}. Non-MLB game brain: ${GAME_PICK_MODEL}. Props desk: ${PROPS_DESK_MODEL}. Model cascade: ${DESK_FALLBACK_MODELS.join(' → ')} (each lane skips its own primary).`);
