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

- Team identity includes the current roster, starting quarterback, depth, coaches and relevant body of work. Early-season results add observations to that picture; identify which personnel and coaching relationships carry over from the history and which have changed.

- WHO PRODUCED THE RESULT? Last week's available players and opponent may differ from this week's. A team total, a named player's performance and a result against a particular opponent describe different evidence.

- WHAT PRODUCED IT? Scoring can involve sustained possessions, field position, turnovers, isolated big plays and changes in game state. Reported causes and measured outcomes are distinct. Consider the opposing units and players involved.

- WHAT CHANGES THIS WEEK? Available personnel, the new opponent, preparation, venue and reported adjustments can change the assignment. A coach's intended correction is not a verified future result. Which adjustments work is your judgment about this game.

- WHAT DOES THE BROADER HISTORY SUPPORT? Distinguish established capabilities, attributed assessments and one-game observations. Prior seasons need their own labels and current roster/coaching context. Team quality and realistic potential are assessments you may make from that evidence, without a statistic proving every opinion.

- Consider both teams with the same standard: what supports or challenges each expectation of improvement, deterioration or repeatability? Fair consideration does not require equally strong cases. A possible way to stay competitive and a judgment about which side of this spread you prefer are different claims.

- Division opponents have an ongoing history of preparing for one another. Familiarity, coaching continuity, personnel changes and earlier meetings can be relevant context even when records or reputations look very different. Investigate what carries over to THIS game and what has changed; decide for yourself what, if anything, that means at the posted spread or moneyline.

### NFL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NFL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current team baseline

Use the exact tag shown in the scout report for this game.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  // Decision uses NBA's sequence; no additional post-question decision gate.
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // No NFL-specific hard guards needed here (handled by BASE_RULES + pass stages)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam}
Case for ${awayTeam}
(Each case should be 2-3 paragraphs explaining the strongest honest case for that side at the posted number, including its real obstacles. Both sides receive fair consideration; their cases need not be equally strong. Your eventual side and eligible bet type remain your choice.)`
};


export default NFL_CONSTITUTION;
