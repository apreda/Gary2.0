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

### THE SPOTS

Bettors name the situations a week can put a team in: a bounce-back after an embarrassing loss, a letdown after a big win or a rivalry game, a short week or a long trip, a divisional dog at home, a team coming off its bye, and the side everyone is piling onto. A spot is a fact about the week, not a lean. What any of them means for this game at this number is your read.

### NFL INJURY LABELS (READ FROM SCOUT REPORT)

Injury tags are assigned by the NFL scout-report pipeline and are sport-specific. Each row shows the reported status (QUESTIONABLE, DOUBTFUL, OUT, IR, PUP), a report-age tag and the report date. The NFL plays one game a week, so the report date, not a games-missed count, tells you whether the team's last game was played without him.

- **FRESH** — Reported within the last 10 days. Compare the report date with the team's last game: a report from this week is new information the number may not have fully adjusted to; a report from before last week's game describes an absence the team already played through.
- **STALE** — Reported more than 10 days ago. The team's recent stats, form and record already reflect life without this player; the number was set with him out.
- **IR / PUP / season-ending** — Fully baked into every number you see.
- **UNKNOWN** — No report date. Do not infer how long he has been out.

Use the exact tag and report date shown in the scout report for this game.

**ESTABLISHED INJURY RULE:**
If a player has been out since before the team's last game, that absence is not new information — the line was set with that absence already factored in, and the team's recent stats, form and record already reflect life without him. Citing a non-fresh injury as if it were news is citing something the line already knows. The absences that can be new information are FRESH ones, where the market may not have fully adjusted yet.

**ABSENCES AND THE NUMBER:**
An absence is evidence about a roster, not about a side. What it means depends on the posted number: a number can carry a named absence, or a cluster of them, accurately, or treat it as more or less than it is. A team missing players is not automatically the wrong side, and a familiar absence can still be present in the price without being priced accurately. Read the replacement, the role in the recent sample and the matchup at this number; the reported absence alone assigns nothing.
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
