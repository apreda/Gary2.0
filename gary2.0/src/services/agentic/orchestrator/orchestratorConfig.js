// ═══════════════════════════════════════════════════════════════════════════
// MODEL POLICY (Aug 24 2026 — Gemini retired; founder: "no more gemini for
// anything"). Two vendors: Anthropic (API for tool-calling research/legacy
// lanes, CLI subscription bridge for content/brains at $0) and ChatGPT (the
// codex bridge for the Sol brains, OpenAI API as a search rung). The session
// seam (validateSessionModel below) refuses any gemini-* name at runtime.
// ═══════════════════════════════════════════════════════════════════════════

// GAME PICKS run the FULL orchestrator prompt stack on GPT-5.6 Sol (founder,
// Jul 22 2026 PM: "the only thing we should have changed is that we are using
// Sol 5.6 now" — same pick process, new brain; routed via the OpenAI adapter
// seam in sessionManager, same as the July 5.5 bake-off).
//
// SUBSCRIPTION BRIDGE (founder, Jul 29 2026): while API balances are paused,
// GARY_MODEL_OVERRIDE=claude-fable-5 swaps the game brain onto the founder's
// Claude subscription via the claudeCliSession adapter ($0 marginal). The
// Gemini cascade stays behind it, firing only if the bridge brain itself
// fails. Unset the env var and the system is exactly the Sol architecture —
// the API stack returns with the next balance top-up, zero code changes.
export const GAME_PICK_MODEL = process.env.GARY_MODEL_OVERRIDE || 'gpt-5.6-sol';

// JUNE ENGINE RESTORATION (Aug 18 2026, founder GO after the ledger
// post-mortem: June +26u/58% on this engine, negative every week since the
// Jul 22-26 cutover): MLB games return to the agentic orchestrator.
// - Research assistant: Anthropic API Haiku (founder's cost call, Aug 18:
//   $1/$5 — the cheapest tools-capable tier anywhere; ~$3-6/night for the
//   full slate). The CLI sub bridges are tool-less by construction and
//   research needs 25+ fetch_stats calls per game, so the researcher is the
//   ONE metered piece of the lane.
// - Brain: Sol on the $0 codexCli bridge (founder's cost call, Aug 18) —
//   tool-less, reads the researcher's briefing as its evidence (the football
//   pattern). Full-June paid upgrade whenever he wants it:
//   GARY_MLB_BRAIN_MODEL=gpt-5.6-sol → API Sol WITH self-verification tools
//   (~$10-20/night more).
// Both env-overridable; the June engine is MLB's ONLY game lane (founder,
// Aug 27 — the arming flag and pickdesk default are retired; key
// requirement follows the research model's provider).
// Aug 18 PM (founder: "why keep Gemini for football — one system"): the
// researcher is Haiku for EVERY game sport, not just MLB. Same checklist
// walk, same tools, per-sport factor lists.
export const GAME_RESEARCH_MODEL = process.env.GARY_RESEARCH_MODEL || 'anthropic-claude-haiku-4-5';
export const MLB_RESEARCH_MODEL = process.env.GARY_MLB_RESEARCH_MODEL || GAME_RESEARCH_MODEL;
export const MLB_JUNE_BRAIN_MODEL = process.env.GARY_MLB_BRAIN_MODEL || 'codex-gpt-5.6-sol';

// HOUSE LIMIT (founder, Aug 18 — restored from the pickdesk-era -179 rule):
// no moneyline heavier than this ships to users. Payout law, not value
// steering: on a game priced past the cap the market is the runline/spread,
// not the winner. Enforced belt-and-suspenders in agentLoop with one
// corrective re-ask; the menu clause lives in Pass 2.5.
export const GAME_ML_CAP = Number(process.env.GARY_ML_CAP || -179);
// ═══ GEMINI ERADICATED (founder order, Aug 24 2026) ═══
// "no more gemini for anything" — after the Google billing dunning
// (project 704963887148) silently killed recaps, the Wire, and the tweet
// composer for four days, every lane runs Anthropic (API or subscription
// bridge) or ChatGPT (codex bridge / OpenAI API). No Gemini model may be a
// primary, a fallback, or a default anywhere. The legacy constants below
// now resolve to the brains we actually run so an env-less spawn can never
// land on a dead vendor (same lesson as solText, Aug 21).
// Legacy lanes do TOOL-CALLING, and the Claude CLI adapter is deliberately
// tools-free (brain calls only) — so these route to the Anthropic API
// adapter ('anthropic-' prefix), which carries tools. ⚑Verify the NBA/NHL/
// NCAAB pick paths on these models before their seasons open (~Oct 1).
export const LEGACY_BRAIN_MODEL = 'anthropic-claude-sonnet-5';
export const LEGACY_BRAIN_FALLBACK = 'anthropic-claude-haiku-4-5';
// Research / tool-calling investigation for the legacy non-MLB lanes — the
// same Haiku the June engine's researcher runs (Anthropic API pool).
export const LEGACY_RESEARCH_MODEL = 'anthropic-claude-haiku-4-5';
// Props lane default = the brain the plists actually set (codex bridge).
export const PROPS_DESK_MODEL = process.env.GARY_PROPS_MODEL_OVERRIDE || 'codex-gpt-5.6-sol';

// Quota cascade for the desk lanes (founder approved Jul 29, after the Jul 28
// OpenAI balance outage shipped 6 games with no pick): when a desk brain
// throws — quota/429 first among the causes — the SAME desk re-runs on these
// models in order at their top thinking level.
// Two subscription tanks, then the third Anthropic tier (Aug 24: the two
// metered Gemini last resorts are gone with the vendor).
// The chain filters out the primary so a quota error never retries itself.
export const DESK_FALLBACK_MODELS = ['codex-gpt-5.6-sol', 'claude-opus-5', 'claude-sonnet-5'].filter((m) => m !== GAME_PICK_MODEL);

// $ per 1M tokens [input, output] — desk-lane cost logging only, not billing.
// Claude entries are $0: the subscription bridge has no marginal token cost.
export const DESK_COST_PER_M = {
  'gpt-5.6-sol': [5, 30],
  'claude-fable-5': [0, 0],
  'claude-opus-5': [0, 0],
  'claude-sonnet-5': [0, 0],
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
