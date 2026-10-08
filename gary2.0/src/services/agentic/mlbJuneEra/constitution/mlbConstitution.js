/**
 * MLB Constitution - MLB-Specific Context for Gary
 *
 * Phase-aligned delivery (matches NBA pattern):
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Everything else is covered elsewhere (do NOT duplicate here):
 * - Stat categories / pitcher analysis → Flash investigation prompts + scout report
 * - Betting theory / market dynamics → model knowledge (Gary already knows MLB betting)
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (ML/RL) → system prompt <output_format>
 * - Transitive property → BASE_RULES
 * - Anti-hallucination / current season → BASE_RULES
 * - Detailed situational awareness (streaks, tough spots, pitcher situations) → Flash investigation prompts
 */

export const MLB_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### MLB AWARENESS

- **Each game is its own event.** A team's 162-game aggregate stats change by less than 1% from one day to the next, but the games themselves swing wildly — the best team in baseball loses 4 of every 10 games. If you find yourself reaching for the same team across multiple games in a series, ask yourself honestly: am I evaluating tonight's specific matchup (this starter, this bullpen state, this lineup vs this handedness, this park tonight) — or am I anchoring on season aggregates that haven't actually moved? Yesterday's pick has no bearing on tonight's analysis. Investigate what is DIFFERENT about tonight, not what's the same.
- A stat is a description of what happened, not a reason for what will happen. A pitcher's bad ERA is a fact about past games; whether it predicts tonight depends on opponent, ballpark, recent form, bullpen support, and sample size. Cite stats to describe the situation. Reason for yourself about whether they actually matter for THIS specific game.
- Starting pitcher matchup is one of the first things to investigate — both starters' recent outings, pitch count trends, and performance against this specific lineup — but it is one factor among many, not the whole story. A starter covers about two-thirds of the innings; the offense, bullpen, defense, and game-to-game variance decide games too. Weigh it honestly against everything else rather than letting it dominate the read
- A pitcher's recent form (last 3-5 starts) can diverge significantly from full-season numbers — investigate the trajectory
- Bullpen availability changes every day — who pitched last night, who pitched the night before, who is available tonight. This is not a static stat; it is a daily investigation
- Left/right splits matter in baseball — investigate how each team's lineup is constructed relative to the opposing starter's handedness
- Lineup construction, rest days, platoon matchups, and injuries to key bats all change how the offense profiles tonight
- Park factors and weather (wind direction, temperature, humidity) are context — investigate the specific venue and conditions and reason about whether tonight's matchup actually interacts with them
- Baseball is a 162-game season with real human dynamics — momentum, streaks, series context, pitcher confidence, team energy, and the grind of the schedule all matter alongside the statistics
- What a team is playing for is a fact about the calendar; what it changes on the field shows up in the game itself
- MLB games are priced two ways, the moneyline and the run line. Four tickets are on the board: each team's moneyline, the favorite at -1.5 and the underdog at +1.5. A moneyline wins when that team wins. -1.5 wins when that team wins by two or more. +1.5 wins when that team wins, or loses by one. Pick the ticket you want.

### MLB INJURY LABELS (READ FROM SCOUT REPORT)

MLB injuries use a simplified 3-tier system. The key question in baseball is: did this absence change who is pitching tonight?

- **NEW** — Placed on IL or scratched within the last 3 days. This is the only tier that may not be fully reflected in the line. A starting pitcher scratch day-of is the single highest-impact roster change in baseball.
- **KNOWN** — On IL for 4+ days. The line, the team's recent stats, and the opponent's game plan already account for this absence.
- **SP SCRATCH** — Special flag: the scheduled starting pitcher was scratched or replaced. This changes the entire game projection and may not be in the posted line yet.

Use the exact tag shown in the scout report for this game.

**MLB GTD/IL NOTE:**
- A starting pitcher placed on the IL or scratched day-of changes the entire game projection
- Position player IL stints matter less individually but accumulate
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: BILATERAL CASE PROMPT — injected at end of Pass 1
  // ═══════════════════════════════════════════════════════════════════════════
  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam} winning
Case for ${awayTeam} winning
(Each case should be 2-3 paragraphs explaining why that team wins tonight based on the matchup evidence you investigated.)`
};

// ADAPTED (founder GO, Oct 4 2026): POSTSEASON GAMES ONLY. Gary took Cleveland in ALDS Game 1 and Milwaukee in
// Game 2 on matchup and full-season numbers ("Gary seems to struggle to believe in underdogs"; "I don't want
// Gary to think stats are the only thing he can use"; "the season was too long ago now. We want Gary to stay
// current"). The approved list: two lines in, two regular-season lines out, June's human-dynamics line moved
// up beside the first so "things that are not stats" has its examples, and the two cases rest on everything
// he investigated. The regular season reads as June wrote it, except for the ticket menu (founder, Oct 4 2026):
// June said "decide who wins, then choose ML or run line based on your conviction", which turned "they win" into
// -1.5. Gary may take either moneyline or either side of the run line; the menu names all four and how each
// settles, and says nothing about conviction. (I first made MLB moneyline-only the same evening; he corrected it.)
// The record line: founder's approved wording, Oct 7 2026 ("I approve that record line ... I think that's perfect").
const POSTSEASON_IN = `- Stats are not the only thing you can use. Your pick can rest on stats, on things that are not stats, or on both.
- Baseball has real human dynamics — momentum, streaks, series context, pitcher confidence, team energy, and the grind of the schedule all matter alongside the statistics.
- The regular season was a long time ago. Stay current.
- A won-lost record is a count of results, not a statistic: it says how many games a team won, not how it hits, pitches or fields.
`;
const POSTSEASON_OUT = [
  // The bullet's last two sentences (Oct 4). Founder, Oct 7 2026 afternoon: the whole bullet went; that night, after
  // White Sox -130 and Yankees -168 lost: "I agree add that back in" — it reads as it did when Gary took the Guardians.
  ` Yesterday's pick has no bearing on tonight's analysis. Investigate what is DIFFERENT about tonight, not what's the same.`,
  `- What a team is playing for is a fact about the calendar; what it changes on the field shows up in the game itself\n`,
  // June's human-dynamics line moves up under the founder's line (above), without "a 162-game season".
  `- Baseball is a 162-game season with real human dynamics — momentum, streaks, series context, pitcher confidence, team energy, and the grind of the schedule all matter alongside the statistics\n`,
];
const AWARENESS_HEAD = '### MLB AWARENESS\n\n';
const june = MLB_CONSTITUTION.pass1Context;
if (!june.includes(AWARENESS_HEAD) || POSTSEASON_OUT.some((line) => !june.includes(line))) {
  throw new Error('MLB postseason instructions: a June line they edit is no longer in pass1Context');
}
// The injury labels without their claims about the line (founder GO, Oct 4 2026: no market reading).
const POSTSEASON_REWORDED = [
  [' This is the only tier that may not be fully reflected in the line.', ''],
  // Founder GO, Oct 7 2026 night: no claim that an absence is already accounted for. In October the season numbers on
  // the desk were built mostly with the player (Aaron Judge, out for the ALDS, went unmentioned in the Yankees pick).
  [' The line, the team\'s recent stats, and the opponent\'s game plan already account for this absence.', ''],
  ['This changes the entire game projection and may not be in the posted line yet.', 'This changes the entire game projection.'],
];
if (POSTSEASON_REWORDED.some(([from]) => !june.includes(from))) {
  throw new Error('MLB postseason instructions: an injury-label line they edit is no longer in pass1Context');
}
MLB_CONSTITUTION.postseasonPass1Context = POSTSEASON_REWORDED.reduce((text, [from, to]) => text.replace(from, to),
  POSTSEASON_OUT.reduce((text, line) => text.replace(line, ''), june))
  .replace(AWARENESS_HEAD, AWARENESS_HEAD + POSTSEASON_IN);
MLB_CONSTITUTION.postseasonBilateralCasePrompt = (homeTeam, awayTeam) =>
  MLB_CONSTITUTION.bilateralCasePrompt(homeTeam, awayTeam).replace('based on the matchup evidence you investigated', 'based on everything you investigated');

export default MLB_CONSTITUTION;
