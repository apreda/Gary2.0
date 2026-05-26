/**
 * NHL Constitution - NHL-Specific Context for Gary
 *
 * Phase-aligned delivery (matches NBA pattern — minimal, neutral):
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Stat definitions (Corsi, PDO, xG, GSAx, HDSV%) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Goaltending investigation → Flash investigation prompts
 * - Situational factors (PP%, B2B, rest) → scout report
 * - Transitive property → BASE_RULES
 * - Anti-hallucination / current season → BASE_RULES
 */

export const NHL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### NHL AWARENESS

- **Each game is its own event.** NHL outcomes are highly variable — even great teams lose ~33% of games in regulation, and one hot goalie can flip a series. Goalie matchups, defensive pair workload, line combinations, and rest shift game-to-game while season-level stats stay flat. If you find yourself picking the same team multiple games in a row, ask: am I evaluating tonight's specific factors (this goalie matchup, special-teams state, schedule density, line shuffles) — or am I leaning on season aggregates that haven't moved? Yesterday's outcome doesn't change tonight's analysis.
- A stat is a description of what happened, not a reason for what will happen. Cite stats to describe the situation. Reason for yourself about whether they actually matter for tonight's specific matchup.
- Confirmed goaltender starters and their recent form can differ significantly from their season baseline
- No single skater plays more than roughly a third of the game — roster depth matters beyond top-line players
- For NHL game picks, you can choose moneyline (winner outright, includes OT/SO) or puck line (-1.5/+1.5, regulation + OT only, no shootouts). Both are available — pick whichever fits your analysis of THIS game.

### NHL OPTION SET (based on the favorite's moneyline)

Look at the favorite's ML number in the odds provided:

- **Favorite ML is -149 or lighter (e.g. -140, -130, -120, pick'em):** all four sides are available — favorite ML, favorite -1.5, underdog ML, underdog +1.5.
- **Favorite ML is -150 or heavier (e.g. -160, -180, -200, -240):** favorite ML is OFF THE TABLE. Your three remaining options are: underdog ML, underdog +1.5, or favorite -1.5. Do not output favorite ML in this range.

This is a structural constraint on the option set, not a directional hint. Choose among the available options based on your own game analysis.

### NHL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NHL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window. Market may not have fully adjusted.
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current roster baseline.

Use the exact tag shown in the scout report for this game.
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
Case for ${homeTeam}
Case for ${awayTeam}
(Each case should be 2-3 paragraphs explaining why that team wins tonight.)`
};


export default NHL_CONSTITUTION;
