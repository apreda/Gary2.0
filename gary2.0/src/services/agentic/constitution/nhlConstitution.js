/**
 * NHL Constitution - NHL-Specific Context for Gary (founder, Oct 3 2026)
 *
 * A port, not a new design: the awareness bullets are the MLB constitution's
 * (a stat describes, a short sample is a question, inconsistency is yours to
 * judge) and the NBA constitution's schedule line, with hockey's nouns. The
 * starter in net is read the way MLB reads a starting pitcher.
 *
 * Phase-aligned delivery (matches the MLB and NBA pattern):
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Awareness only. Nothing here says what a factor means for the pick.
 */
import { nhlCaseHeadings } from '../orchestrator/nhlPrompts.js';

export const NHL_CONSTITUTION = {
  domainKnowledge: ``,

  pass1Context: `
### NHL AWARENESS

- A stat is a description of what happened, not a reason for what will happen. A goalie's save percentage is a fact about past games; whether it describes tonight depends on the opponent, the shots he faces, his workload and the sample behind it. Cite stats to describe the situation. Reason for yourself about whether they actually matter for THIS specific game.

- A short sample is a question, not a verdict. Whether a hot or cold stretch continues depends on who the player or the club is, not on the stretch itself; extremes in small samples usually move toward the real level. The desk prints the season and the number of games behind every figure, and carries last season's line beside this season's.

- When the data shows a goalie or a team is inconsistent, that is the data telling you either version could show up tonight — what it cannot tell you is which one. Which one is a judgment call, yours to make, on nothing more than what you think happens tonight.

- The starting goalie plays the whole game. The league does not confirm starters ahead of time: the desk shows who has been starting and carries dated reporting when it exists. A starter the reporting does not name is unconfirmed.

- Back-to-backs, travel burden, and schedule density are widely known and often priced quickly.

- The moneyline settles on the final result, overtime and shootout included.

### NHL INJURY LIST (READ FROM SCOUT REPORT)

Each listed player carries the date his listing was last updated and, where the club's recent lineups show it, the last game he dressed for and how many games the club has played without him.

- A player who has missed several games: the club's recent results and numbers already come from the lineup without him.
- A new absence, or a goalie change: the recent results do not yet show it.
- A player listed day-to-day may or may not dress; the reporting section is where a decision would appear.
`,

  pass25DecisionGuards: ``,

  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam, game = null) => {
    const h = nhlCaseHeadings(homeTeam, awayTeam, game);
    return `Before outputting INVESTIGATION COMPLETE, end your Pass 1 synthesis with both sections, using these EXACT headings on their own lines (the system stores each case under its heading):
${h.first}
${h.second}
(Each case: 2-3 paragraphs, the case for taking that side tonight.)`;
  },
};

export default NHL_CONSTITUTION;
