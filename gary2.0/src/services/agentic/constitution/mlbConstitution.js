/**
 * MLB Constitution - MLB-Specific Context for Gary
 *
 * Phase-aligned delivery (matches NBA pattern):
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Everything else is covered elsewhere (do NOT duplicate here):
 * - Stat categories / pitcher analysis → Flash investigation prompts + scout report
 * - Betting theory / market dynamics → model knowledge (Gary already knows MLB betting)
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (ML/RL) → system prompt <output_format>
 * - Transitive property → BASE_RULES
 * - Anti-hallucination / current season → BASE_RULES
 * - Detailed situational awareness (streaks, tough spots, pitcher situations) → Flash investigation prompts
 */

export const MLB_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  // Awareness bullets live in getMlbSeasonAwareness (spreadEvaluationFactors.js),
  // rendered once inside Pass 1 — this block carries ONLY the injury-label
  // semantics (LOCKED) so the two never duplicate (Jul 7 sweep: Pass 1 was
  // rendering two near-identical MLB AWARENESS sections).
  pass1Context: `
### MLB INJURY LABELS (READ FROM SCOUT REPORT)

MLB injuries use a simplified 3-tier system. The key question in baseball is: did this absence change who is pitching tonight?

- **NEW** — Placed on IL or scratched within the last 3 days. This is the only tier that may not be fully reflected in the line. A starting pitcher scratch day-of is the single highest-impact roster change in baseball.
- **KNOWN** — On IL for 4+ days. The line, the team's recent stats, and the opponent's game plan already account for this absence.
- **SP SCRATCH** — Special flag: the scheduled starting pitcher was scratched or replaced. This changes the entire game projection and may not be in the posted line yet.

Use the exact tag shown in the scout report for this game.

**MLB GTD/IL NOTE:**
- A starting pitcher placed on the IL or scratched day-of changes the entire game projection
- Position player IL stints matter less individually but accumulate
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: BILATERAL CASE PROMPT — injected at end of Pass 1
  // ═══════════════════════════════════════════════════════════════════════════
  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for backing ${homeTeam} tonight
Case for backing ${awayTeam} tonight
(Each case should be 2-3 paragraphs making the argument for that side as tonight's bet — why it wins and why its price is one you'd take — based on the matchup evidence you investigated.)`
};

export default MLB_CONSTITUTION;
