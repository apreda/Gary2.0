/**
 * NFL Constitution - NFL-Specific Context for Gary
 *
 * Emptied by decision Oct 11 2026 (founder GO, evening: "take out every single prompt we currently give
 * Gary that isn't what is the best bet and why ... no awareness no steering what so ever"). The NFL
 * AWARENESS bullets, THE SPOTS and the NFL INJURIES legend went; the injury legend's two sentences live
 * on the desk as the INJURY REPORT header (scoutReport/sports/nfl.js).
 *
 * THE SPREAD (founder GO, Oct 12 2026 night) is the first awareness statement back: the spread carries
 * the reaction to how each team just looked (recency bias), so the side of the team that looked bad can
 * be the cheaper one (buy low, sell high); whether that is happening in this game is Gary's read. The
 * words are the founder's approved text, verbatim. No line history goes with it: the desk still shows
 * the posted price only. It rides pass1Context, which orchestratorMain appends after the desk in the
 * first message as <sport_pass1_context>. College keeps its own constitution.
 *
 * THE TEAMS and READING THE NUMBERS (founder GO, Oct 12 2026 night, "Yes I agree with all of that GO
 * ahead"), with a third SPREAD bullet: the founder's four (quarterback, home field, favorites and popular
 * teams, small early samples) and six counterintuitive ones (injuries overweighted, a team without its star,
 * reputation lag, stats that follow winning, passing over defense and the run game, motivation stories),
 * written as plain facts with the read left to Gary. Home field carries no point value: a value for a
 * factor was ruled out and invites margin math toward a number of his own.
 * Same night (founder: "have it match how MLB, we don't need to over steer with headers"; "can't he just
 * have awareness without being told what to do"): one NFL AWARENESS heading as MLB has, and no closing
 * "Which of these matters in this game is your read." line, and no "is your read" bullet after recency bias.
 */

export const NFL_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `
### NFL AWARENESS

- A spread is a price. It carries the football and the reaction to how each team just looked. When one team just looked great and the other just looked terrible, the money goes to the hot team and the number is set toward it. That is recency bias, and it can make the side of the team that looked bad the cheaper side: buy low, sell high.

- Bettors favor favorites, well-known teams and prime-time games, and the number is set with that in mind.

- The starting quarterback is the absence that changes a game most. Most other single absences change it less than they seem to, and a missing lineman or cornerback can matter more than a famous receiver or running back.

- When a star is out, the number moves as if the team is worse. Sometimes a team plays better without him: others step up and the scheme simplifies.

- The crowd overreacts to one game and is slow to accept a real change, like a new quarterback, a new coach or a rebuilt line. A strong reputation can outlast a decline, and a team that has improved can stay underrated.

- Home field is worth far less than it used to be.

- Early in the season the sample is small. Last season's team and this season's few games both say something about who a team is.

- Some stats follow winning rather than cause it. Rushing attempts and time of possession rise when a team is already ahead and running out the clock.

- Passing efficiency carries from week to week more than defense or the run game does.

- "Must-win," "revenge" and "want it more" are the stories the crowd bets on. NFL teams play hard every week.
`,
  pass25DecisionGuards: ``,
  guardrails: ``,
};


export default NFL_CONSTITUTION;
