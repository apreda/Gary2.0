/**
 * NFL Constitution - NFL-Specific Context for Gary
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 */

export const NFL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### NFL AWARENESS

- The market already knows what you know and what you don't: a thin sample, and the doubt that rides with it, is priced into the line before you ever read the matchup. The price is not a message about the game — it is simply what the bet costs. Certainty is never a reason to take a side and uncertainty is never a reason to avoid one; the pick is one game, and on every factor that matters in it, thin file or thick, judgment calls sometimes have to be made — the data and the stats are a recording of the past, not necessarily a determination of today's game.

- When the data shows a player or a team is inconsistent, that is the data telling you either version could show up today — what it cannot tell you is which one. Which one is a judgment call, yours to make, on nothing more than what you think happens today.

### NFL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NFL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current team baseline

Use the exact tag shown in the scout report for this game.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // No NFL-specific hard guards needed here (handled by BASE_RULES + pass stages)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam} winning/covering
Case for ${awayTeam} winning/covering
(Each case should be 2-3 paragraphs explaining why that team covers the spread in this game.)`
};


export default NFL_CONSTITUTION;
