/**
 * NCAAF Constitution - NCAAF-Specific Context for Gary
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (SP+, FPI, EPA, Havoc Rate) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES (NCAAF addendum kept in guardrails)
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Opt-outs / portal / motivation / conference strength → Flash investigation prompts + scout report
 */

export const NCAAF_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### NCAAF AWARENESS

- A stat is a description of what happened, not a reason for what will happen. A quarterback's prior-season line, a defense's pressure rate, a team's yards per play — those are facts about past games; whether any of them predicts this one depends on the matchup, the roster on the field this week, the phase of the season, and sample size. No single number decides a football game — not the quarterback comparison, not any other lone factor. Cite stats to describe the situation. Reason for yourself about whether they actually matter for THIS specific game.

- Current reporting introduces this season's players: returning starters, transfers, freshmen, injuries, role changes and the coaches' plans. Do not rely on training-memory roster knowledge. Separate what a source reports from your own opinion about it.

- Understand who these teams are becoming: quarterback play and development, protection and defensive matchups, coaching/play calling, program changes, pressure, stakes, confidence and the setting of THIS game. You may make a logical football judgment when no statistic can prove a prediction. Explain that judgment as yours, not as an established fact.

- A short sample is a question, not a verdict. Whether a hot or cold stretch continues depends on who the player or the team is — his track, his role, the roster and staff around him — not on the stretch itself; extremes in small samples usually move toward the real level. A college season is a short sample all year: the desk prints every game with its date, site and opponent.

- When the data shows a player or a team is inconsistent, that is the data telling you either version could show up today — what it cannot tell you is which one. Which one is a judgment call, yours to make, on nothing more than what you think happens today.

- Consider both teams on their merits at the posted price. A favorite can separate, and an underdog can compete; neither story is automatically more valuable. Distinguish raw early-season results from opponent-adjusted ratings and a neutral-field rating from a prediction for this venue.

### THE SPOTS

Bettors name the situations a college week can put a team in: a ranked team's first real road test, a conference underdog at home, a letdown after a big win or a look-ahead before a bigger game, a bounce-back after an embarrassing loss, a long trip or a short week, and a team coming off its bye. A spot is a fact about the week, not a lean. What any of them means for this game is your read.

### NCAAF INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NCAAF scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current team baseline

Use the exact tag shown in the scout report for this game.
 
**NCAAF SAMPLE SIZE:** The regular-season sample is short. Consider opponent quality, how points were scored and which personnel produced them. Investigate how transfers are fitting this team rather than assuming immediate success or a slow start.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY, matching NFL, MLB and NBA (founder, Sep 18 2026). These rendered
  // AFTER the synthesis question — "What's your bet, and what are the reasons
  // why?" — so the last thing read before deciding was further conditions on
  // the decision. Gary considers both sides in Pass 1; no formatting checker approves his opinion.
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: null
};


export default NCAAF_CONSTITUTION;
