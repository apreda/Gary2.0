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

- Stats are not the only thing you can use. Your pick can rest on stats, on things that are not stats, or on both.

- Football has real human dynamics — a division rival, a home crowd on a big night, a team answering a bad loss, a quarterback's confidence, momentum — and they matter alongside the statistics.

- A team's roster, quarterback roles, coaching staff and personnel continuity can change between seasons and between games.

- Early-season records and statistics cover a small number of games. Prior-season evidence describes the personnel, coaches and opponents from that season.

- Each game's results involve particular available players and a particular opponent.

- Scoring can come from sustained possessions, turnovers, field position, special teams and individual big plays.

- Opponents, player availability, venue, rest, preparation time and reported roles or plans can differ from one week to the next.

- Reports of planned adjustments describe intentions, not outcomes.

- Divisional opponents meet regularly. Personnel and coaching continuity between those meetings varies.

- What a team does on the field and what the other team is missing are different things. The other team's problems reach the game through what this team does with them.

### THE SPOTS

Bettors name the situations a week can put a team in: a bounce-back after an embarrassing loss, a letdown after a big win or a rivalry game, a short week or a long trip, a divisional dog at home, and a team coming off its bye. A spot is a fact about the week, not a lean. What any of them means for this game is your read.

### NFL INJURIES (READ FROM SCOUT REPORT)

Each row shows the reported status and whether he played the team's most recent games.

Every absence on this report is already in the spread, whether it was announced this morning or a month ago.
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
  guardrails: ``,
};


export default NFL_CONSTITUTION;
