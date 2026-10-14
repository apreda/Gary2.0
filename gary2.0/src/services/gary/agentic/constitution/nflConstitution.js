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
 * "Which of these matters in this game is your read." line; the bullet after recency bias states its point without "is your read".
 *
 * VERSION D (founder GO, Oct 14 2026: "let's make this the real version ... Thursday and the rest of the week will
 * be on what just went 11-4"): three bullets, the replay that went 11-4-1 and 10-5-1 on the Oct 5-12 games. The
 * recency bullet gains "Good teams that have looked bad usually come back toward who they have been."; the
 * quarterback bullet loses the lineman/cornerback clause and "single"; the star-out bullet stays; the other seven go
 * (the reputation-lag bullet argued the opposite of buy-low for good teams). Gary reads it as his instructions in
 * the NFL question (orchestrator/nflQuestion.js).
 */

export const NFL_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `
### NFL AWARENESS

- When one team has looked good lately and the other has looked bad, the reaction to that can inflate the spread toward the team that looked good, and the team that looked bad can be the better side to be on. That's recency bias: buy low, sell high. Good teams that have looked bad usually come back toward who they have been.

- The starting quarterback is the absence that changes a game most. Most other absences change it less than they seem to.

- When a star is out, the number moves as if the team is worse. Sometimes a team plays better without him: others step up and the scheme simplifies.
`,
  pass25DecisionGuards: ``,
  guardrails: ``,
};


export default NFL_CONSTITUTION;
