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
 */

export const NFL_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `
### NFL AWARENESS

- When one team has looked good lately and the other has looked bad, the reaction to that can inflate the spread toward the team that looked good, and the team that looked bad can be the better side to be on. That's recency bias: buy low, sell high. Good teams that have looked bad usually come back toward who they have been.

- A game is played by the players who suit up. Every known injury is already in the price, and the public overreacts to injuries, most of all to a big name or a long list. A team missing players can still be the better team on the field.

- The starting quarterback is the absence that changes a game most, and how much depends on who the backup is.

- The spread is the market's gap between the two teams. Injuries, storylines and recent results can stretch it past the real gap or leave it short of it. The real gap is between the players on the field and how they are playing now, so a good team can be the value against a better one, and a better team can be the value laying points.

All of this holds whether a team is favored or getting points.

What the beat writers say about last season is background, not a reason for this game.
`,
  pass25DecisionGuards: ``,
  guardrails: ``,
};


// READS OF PAST GAMES (founder, Oct 15 2026: "Let's try that ... We don't want to give Gary any rules"; "I'll follow
// your lead fully"). Gary learns a way of reading a game from worked reads, the way the founder taught it in
// conversation, not from rules. Five Week 5 games read the founder's way before kickoff, two of them alike on paper and
// opposite in the read (49ers +3, Texans -7). Test only: they ride Version S2 (NFL_S2=1) and are never in front of the
// Week 5 replay, whose answers they contain.
export const NFL_READS = `
### READS OF PAST GAMES
Five Week 5 games as a sharp fan read them before kickoff.

Raiders at Patriots, Patriots -3.5. The Patriots are the better team. Maye was last season's MVP runner-up, the defense is real, and their two losses came at Seattle and Jacksonville before they went into Buffalo and won. The Raiders are 3-1 behind a 38-year-old Kirk Cousins, and the wins came against Miami, the Chargers and the Saints. They're playing above who they are, and the touchdown count makes Cousins look better than he's played. New England is missing corners this week, and that's in the number. Only 3.5 at home with the better team and the better quarterback: Patriots.

49ers at Seahawks, Seahawks -3. Seattle is still a 3-point favorite at home against an unbeaten team that's playing better than it is. Nobody marked Seattle down for a sloppy month, so there's nothing to buy low on. On the field, Purdy has been as good as any quarterback in the league, and Darnold is a few games back from his injury with an offense that hasn't found its rhythm. It's close either way, but I'm getting 3 with the team playing better and the better quarterback right now: 49ers.

Eagles at Jaguars, Jaguars -7.5. Everything about the Eagles this week is bad news: two straight losses, their top receivers out, Barkley out, a tackle retired and a center traded. That's why it's 7.5. The Jaguars would never lay that against the Eagles otherwise. Jacksonville is good, but Hurts and that defense still play the game, and nobody walks into the huddle and stops trying because of who's missing. Seven and a half is the reaction, not the gap: Eagles.

Ravens at Falcons, Falcons -3.5. Lamar is out, and that's about the biggest absence there is. But the Ravens are still a 3-1 team with a real roster, and they're getting 3.5 from a Falcons team that just got hot in the two games since Penix came back. The number took all of the Lamar news and added Atlanta's last two weeks on top. Baltimore with a backup isn't that much worse than this: Ravens.

Texans at Titans, Texans -7. Both teams are 0-4, so the records say this is close. They aren't the same 0-4. Houston has Stroud and a roster built to win now, and three of its four losses were one-score games. Tennessee is a rebuilding team with a young quarterback. Nobody marked Houston down for the record, since they're still laying 7 on the road, and that's right, because the gap between these teams is bigger than the records: Texans.
`;

export default NFL_CONSTITUTION;
