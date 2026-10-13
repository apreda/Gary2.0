/**
 * NCAAF Constitution — every section empty since Oct 12 2026: college reads the NFL's stack
 * (nflPrompts.js) with college nouns. Kept as a module so getConstitution('NCAAF') resolves.
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (SP+, FPI, EPA, Havoc Rate) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES (NCAAF addendum kept in guardrails)
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Opt-outs / portal / motivation / conference strength → Flash investigation prompts + scout report
 */

export const NCAAF_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY (founder GO, Oct 12 2026: "fix college so it's like the NFL, too. Remove all the awareness and all
  // that kind of stuff"). The awareness bullets, THE SPOTS, the injury-label legend and the sample-size note are
  // gone; the injury legend is a column note on the desk (ncaaf.js INJURY REPORT), as on the NFL desk.
  pass1Context: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY, matching NFL, MLB and NBA (founder, Sep 18 2026). These rendered
  // AFTER the synthesis question — "What's your bet, and what are the reasons
  // why?" — so the last thing read before deciding was further conditions on
  // the decision. Gary considers both sides in Pass 1; no formatting checker approves his opinion.
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: null
};


export default NCAAF_CONSTITUTION;
