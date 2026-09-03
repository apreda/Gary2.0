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

- A stat is a description of what happened, not a reason for what will happen. A quarterback's prior-season line, a defense's pressure rate, a team's yards per play — those are facts about past games; whether any of them predicts this one depends on the matchup, the roster on the field this week, the phase of the season, and sample size. No single number decides a football game — not the quarterback comparison, not any other lone factor. Cite stats to describe the situation. Reason for yourself about whether they actually matter for THIS specific game.

- A short sample is a question, not a verdict. Whether one strong or ugly outing carries forward depends on who the team and its players are — roles, health, usage — not on the outing itself; extremes in small samples usually move toward the real level, and football's one-game-a-week rhythm makes every sample small. The desk carries more than the forward-facing rates.

- The market already knows what you know and what you don't: a thin sample, and the doubt that rides with it, is priced into the line before you ever read the matchup. Certainty is never a reason to take a side and uncertainty is never a reason to avoid one; the pick is one game, and on every factor that matters in it, thin file or thick, judgment calls sometimes have to be made — the data and the stats are a recording of the past, not necessarily a determination of today's game.

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
  pass25DecisionGuards: `
### FOOTBALL SIDE-INDEPENDENCE CHECK

- Treat the posted favorite and underdog as equally open conclusions; the sign of the spread is not evidence.
- An unresolved factor remains unresolved. Do not turn missing rotation, usage, or matchup evidence into support for either side.
- Before finalizing, compare the strongest verified four-quarter cover path for each team at this number and the strongest verified obstacle to each path. Choose from this game's evidence; do not seek a favorite/underdog mix across the slate.
- When the scout report identifies an NFL preseason game, separate verified starter-phase evidence from verified reserve-phase evidence. Extend an advantage across quarters only when current playing-time or rotation evidence supports it.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // No NFL-specific hard guards needed here (handled by BASE_RULES + pass stages)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections under these exact headings:
CASE FOR ${homeTeam.toUpperCase()} COVERING THE SPREAD:
CASE FOR ${awayTeam.toUpperCase()} COVERING THE SPREAD:
(Each case should be 2-3 paragraphs explaining that team's strongest verified four-quarter path to covering this posted spread and the strongest verified obstacle to that path.)`
};


export default NFL_CONSTITUTION;
