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

- A team's roster, quarterback roles, coaching staff and personnel continuity can change between seasons and between games.

- Early-season records and statistics cover a small number of games. Prior-season evidence describes the personnel, coaches and opponents from that season.

- Each game's results involve particular available players and a particular opponent.

- Scoring can come from sustained possessions, turnovers, field position, special teams and individual big plays.

- Opponents, player availability, venue, rest, preparation time and reported roles or plans can differ from one week to the next.

- Reports of planned adjustments describe intentions, not outcomes.

- Divisional opponents meet regularly. Personnel and coaching continuity between those meetings varies.

### THE BET AT THIS NUMBER

- NFL results can look very different from one week to the next. A conspicuously good game for one team and a poor game for its next opponent can shape expectations beyond what either single game establishes.
- Recent blowouts, streaks, reputation and public attention can influence how a spread is set. A number can reflect an overreaction, an underreaction or a reasonable adjustment to what changed.
- Familiar information can be present in the price without being priced accurately. An established strong team can also be viewed differently after a disappointing week; a real change in quarterback, personnel or performance can warrant a different assessment.
- The question is which available bet is best at this number and price. The better team, the more likely winner and the preferred side of a spread are distinct judgments.
- An assessment of possible market overreaction or underreaction can come from qualitative clues alongside the matchup, stats and data. It does not require a predicted score, a calculated fair spread, betting percentages or certainty about why the line was set. Actual claims about money wagered or line movement still require supplied evidence.

### NFL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NFL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current team baseline

Use the exact tag shown in the scout report for this game.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  // NFL has one decision question, without post-question reasoning directions.
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // No NFL-specific hard guards needed here (handled by BASE_RULES + pass stages)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``
};


export default NFL_CONSTITUTION;
