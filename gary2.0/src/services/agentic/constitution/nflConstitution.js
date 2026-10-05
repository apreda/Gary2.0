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

### THE NUMBER ALREADY KNOWS

The spread is built from what everyone has seen: last week's result, the injury report, the season's numbers. The obvious case for a side is usually already in the number. One team can be clearly better and the other side can still be the better bet.

A team that just looked bad is priced as that team. Betting them is a bet that they play better than they just did, on who they are (roster, coaching, quarterback) more than on their last game. That bet only exists before they prove it. Once they have, the points are gone. The same holds in reverse for a team that just looked great. Which team shows up is your judgment.

- An assessment of possible market overreaction or underreaction can come from qualitative clues alongside the matchup, stats and data. It does not require a predicted score, a calculated fair spread, betting percentages or certainty about why the line was set. Actual claims about money wagered or line movement still require supplied evidence.

### THE SPOTS

Bettors name the situations a week can put a team in: a bounce-back after an embarrassing loss, a letdown after a big win or a rivalry game, a short week or a long trip, a divisional dog at home, a team coming off its bye, and the side everyone is piling onto. A spot is a fact about the week, not a lean. What any of them means for this game at this number is your read.

### NFL INJURIES (READ FROM SCOUT REPORT)

Each row shows the reported status (QUESTIONABLE, DOUBTFUL, OUT, IR, PUP) and, from the snap counts, whether he played the team's most recent games. A row without that note means the snap counts could not place him.

The number you see is set for the players who are playing. The people who set it read the same injury report you do, whether an absence was announced this morning or a month ago.

Whether he has been playing is about the team's own numbers, not the line. If the team has already played games without him, its recent stats, form and record include those games. If he played in the last game, they do not yet show the team without him.

An absence is a fact about a roster, not a reason to take a side.
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
