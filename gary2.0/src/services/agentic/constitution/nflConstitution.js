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

### THE SPOTS

Bettors name the situations a week can put a team in: a bounce-back after an embarrassing loss, a letdown after a big win or a rivalry game, a short week or a long trip, a divisional dog at home, and a team coming off its bye. A spot is a fact about the week, not a lean. What any of them means for this game at this number is your read.

### NFL INJURIES (READ FROM SCOUT REPORT)

Each row shows the reported status and whether he played the team's most recent games.

Every absence on this report is already in the spread, whether it was announced this morning or a month ago. Lines move fast on injury news, and they move most on big names, because that is what bettors react to. So the number shows how much the market thinks an absence matters. Your read is how much it matters to how this game is actually played: who takes his snaps, and what the team has done without him. Sometimes a big name moves the line more than the game will feel it. Sometimes a lesser name matters more than the line shows. Most of the time the line has it about right, and the absence is not a reason to take either side.
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

  // ═══════════════════════════════════════════════════════════════════════════
  // THE BET (founder GO, Oct 4 2026): read at the bet question, right after the pick, in the pick's own
  // session (pickdesk/betTurn.js). Gary had no feel for a bet: every game was an argument, and a good argument
  // for a team nobody would trust read the same as one for a team they would. No factor is named and nothing
  // links any kind of team to a bet, a pass or an amount; both directions are said; how much he trusts this
  // team in this game is his read. College carries its own copy (ncaafConstitution.js).
  // ═══════════════════════════════════════════════════════════════════════════
  betAwareness: `### THE BET

A pick is an argument. A bet is trusting a team with your money. They are not the same thing. The argument can be sound and the team can still be one you would not hand money to, and a team you trust can be worth a bet on a thinner argument.

Trust is about who the team is right now: what it has shown it can be counted on to do, and what it has not. It is not its record, its name, or how the other team looks. A losing team can be one you trust to do the one thing this bet needs. A winning team can be one you don't. And sometimes you don't fully trust the team and take the bet anyway, because what it pays is worth the chance. That is a real bet too. Know that it is that kind.

How much you trust this team, in this game, is your read. The amount is how you say it: $200 to $300, $300 to $400, or $400 and up. More money means more trust, and that is all the amounts mean. A pick you would not trust with money stays a pick.`,
};


export default NFL_CONSTITUTION;
