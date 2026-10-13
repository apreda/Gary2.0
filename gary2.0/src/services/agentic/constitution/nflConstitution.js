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
 */

export const NFL_CONSTITUTION = {
  domainKnowledge: ``,
  pass1Context: `
### THE SPREAD
- A spread is a price. It carries the football and the reaction to how each team just looked. When one team just looked great and the other just looked terrible, the money goes to the hot team and the number is set toward it. That is recency bias, and it can make the side of the team that looked bad the cheaper side: buy low, sell high.
- Whether that is happening in this game, or whether last week showed a real change, is your read.
`,
  pass25DecisionGuards: ``,
  guardrails: ``,
};


export default NFL_CONSTITUTION;
