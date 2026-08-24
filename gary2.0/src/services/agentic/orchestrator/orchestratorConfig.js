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
// Both env-overridable; the lane arms via GARY_MLB_JUNE_ENGINE=1 in
// scripts/run-agentic-picks.js (key requirement follows the research model's
// provider).
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
export const GEMINI_PRO_MODEL = 'anthropic-claude-sonnet-5';
export const GEMINI_PRO_FALLBACK = 'anthropic-claude-haiku-4-5';
// Research / tool-calling investigation for the legacy non-MLB lanes — the
// same Haiku the June engine's researcher runs (Anthropic API pool).
export const GEMINI_FLASH_MODEL = 'anthropic-claude-haiku-4-5';
// Props lane default = the brain the plists actually set (codex bridge).
export const GEMINI_PROPS_MODEL = process.env.GARY_PROPS_MODEL_OVERRIDE || 'codex-gpt-5.6-sol';

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

// Session-model gate (name kept for import stability — it validated Gemini
// names for years). Post-eradication it enforces the founder's Aug 24 vendor
// ban at the ONE seam every session passes through: Anthropic and ChatGPT
// families pass; any gemini-* name is refused loudly and rerouted to the
// research default so a stale caller can never resurrect the dead vendor.
export function validateGeminiModel(model) {
  const name = String(model || '');
  if (/gemini/i.test(name)) {
    console.error(`[MODEL POLICY] "${name}" refused — Gemini is retired (founder, Aug 24 2026). Routing to ${GEMINI_FLASH_MODEL}.`);
    return GEMINI_FLASH_MODEL;
  }
  if (/^(codex-|claude-|anthropic-|gpt-)/.test(name)) return model;
  console.error(`[MODEL POLICY VIOLATION] Attempted to use "${name}" — unknown model family. Routing to ${GEMINI_FLASH_MODEL}.`);
  return GEMINI_FLASH_MODEL;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL SELECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

console.log(`[Orchestrator] MLB game desk: ${GAME_PICK_MODEL} (fallback chain: ${DESK_FALLBACK_MODELS.join(' → ')}). MLB props desk: ${GEMINI_PROPS_MODEL}. Non-MLB legacy: ${GEMINI_FLASH_MODEL} research.`);
