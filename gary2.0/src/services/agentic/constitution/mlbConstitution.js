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

- Starting pitcher matchup is the foundation of any MLB game analysis — investigate both starters' recent outings, pitch count trends, and performance against this specific lineup
- A pitcher's recent form (last 3-5 starts) can diverge significantly from full-season numbers — investigate the trajectory
- Bullpen availability changes every day — who pitched last night, who pitched the night before, who is available tonight. This is not a static stat; it is a daily investigation
- Left/right splits matter in baseball — investigate how each team's lineup is constructed relative to the opposing starter's handedness
- Lineup construction, rest days, platoon matchups, and injuries to key bats all change how the offense profiles tonight
- Park factors and weather (wind direction, temperature, humidity) directly affect scoring — investigate the specific venue and conditions
- MLB outcomes are volatile game-to-game — a team's season averages can look very different from how they play on a given night with a given pitcher in a given park. The best team in baseball loses 4 out of every 10 games.
- Baseball is a 162-game season with real human dynamics — momentum, streaks, series context, pitcher confidence, team energy, and the grind of the schedule all matter alongside the statistics
- The moneyline is how MLB games are priced — there is no real spread. Investigate the matchup, decide who wins, then choose ML or run line based on your conviction

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

export default MLB_CONSTITUTION;
