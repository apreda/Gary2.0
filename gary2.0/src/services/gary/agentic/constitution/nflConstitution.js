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
 *
 * VERSION E (founder GO, Oct 14 2026 night: "whichever system went 12-3-1 is the one we should implement. We'll go
 * from D to E"): the recency bullet unchanged; D's two absence bullets become the injury bullet (news moves the
 * spread when it breaks, further or not as far; every known injury is already in the spread and in the public's read,
 * the bigger the news the surer; the Ewing Theory, both ways) and the quarterback bullet (how much depends on who the
 * backup is), the founder's approved words. Replays on the Oct 5-12 games: 10-5-1 and 12-3-1.
 * Same night (founder GO, "Let's do 1 2 and 3"): the price bullet (a price follows results and story and can sit
 * above or below how good the team really is) and the closing line that all of it holds for favorites and underdogs
 * alike. Not replayed yet; the founder calls the next test.
 * The price bullet came out the same night (founder, "Remove the price line"): in the replay Gary read it as the
 * Lions' "brand" and faded them in both runs.
 *
 * VERSION K (founder GO, Oct 14 2026 late night: "let make K the current version"): "he subtracts instead of
 * comparing". The injury bullet becomes "A game is played by the players who suit up..." (every known injury already
 * in the price, the public overreacts to a big name or a long list, a team missing players can still be the better
 * team on the field); an anchor bullet ties each concept to who is better on the field now; a closing line keeps last
 * season's beat-writer stories as background. The Ewing Theory sentence went with the old injury bullet. With it the
 * story leads with both lineups side by side and lists only this week's new injuries (nflQuestion.js). Replays on
 * the Oct 5-12 games: 11-4-1 and 11-4-1.
 * BACK TO J the same night (founder: "we need to go back to a version that took the eagles for sure"): K's rerun went
 * 6-9-1 and 10-5-1 and took the Jaguars -7.5 in both runs ("the Eagles who take the field Sunday are a different
 * team"), asking who is better rather than better by more than the spread. The awareness is J's again (E's three
 * bullets and the favored-or-underdog line) and the story reads as J's did; K's lineups stay behind
 * NFL_STORY_LINEUPS_FIRST=1.
 *
 * VERSION M (founder GO, Oct 14 2026 late night: "Settle on M (the best record tonight) ... M it is until we figure
 * out more solutions"): K with its anchor bullet replaced by the spread bullet, the founder's signed-off words: the
 * spread is the market's gap between the two teams, injuries, storylines and recent results can stretch it past the
 * real gap or leave it short, so a good team can be the value against a better one and a better team can be the
 * value laying points. With it the story leads with both lineups and lists only this week's new injuries. Replays on
 * the Oct 5-12 games: 13-2-1 and 10-5-1, the Eagles in both ("better today, but not by more than a touchdown").
 *
 * VERSION X (Oct 15 2026, the founder's handoff: test through Z, then the best record with the data fixes kept): M's
 * injury and quarterback bullets; the recency bullet says how the reaction moves the spread (the team that looked bad
 * gets more points, or lays fewer); the spread bullet becomes "Everything about a game counts only against the
 * spread..." (the same team can be the right side at one number and the wrong side at another, favored or getting
 * points); the favored-or-getting-points line and the background line go. Gary reads the game in three questions
 * (nflQuestion.js). Replays on the Oct 5-12 games: 12-3-1 and 11-4-1.
 */

export const NFL_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `
### NFL AWARENESS

- When one team has looked good lately and the other has looked bad, the reaction to that moves the spread toward the team that looked good: the team that looked bad gets more points, or lays fewer, and can be the better side to be on. That's recency bias: buy low, sell high. Good teams that have looked bad usually come back toward who they have been.

- A game is played by the players who suit up. Every known injury is already in the price, and the public overreacts to injuries, most of all to a big name or a long list. A team missing players can still be the better team on the field.

- The starting quarterback is the absence that changes a game most, and how much depends on who the backup is.

- Everything about a game counts only against the spread. The same team can be the right side at one number and the wrong side at another, whether it's favored or getting points.
`,
  pass25DecisionGuards: ``,
  guardrails: ``,
};


export default NFL_CONSTITUTION;
