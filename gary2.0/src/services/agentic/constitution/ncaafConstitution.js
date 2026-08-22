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

- The market already knows what you know and what you don't: a thin sample, and the doubt that rides with it, is priced into the line before you ever read the matchup. The price is not a message about the game — it is simply what the bet costs. Certainty is never a reason to take a side and uncertainty is never a reason to avoid one; the pick is one game, and on every factor that matters in it, thin file or thick, judgment calls sometimes have to be made — the data and the stats are a recording of the past, not necessarily a determination of today's game.

- When the data shows a player or a team is inconsistent, that is the data telling you either version could show up today — what it cannot tell you is which one. Which one is a judgment call, yours to make, on nothing more than what you think happens today.

### NCAAF INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NCAAF scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current team baseline

Use the exact tag shown in the scout report for this game.
 
**NCAAF SAMPLE SIZE:** Only 12 regular season games — single results are noise. A pick-six or blocked punt can swing 14 points with no bearing on team quality. Transfer portal additions take time to integrate.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: `
### FOOTBALL SIDE-INDEPENDENCE CHECK

- Treat the posted favorite and underdog as equally open conclusions; the sign of the spread is not evidence.
- An unresolved factor remains unresolved. Do not turn missing rotation, usage, or matchup evidence into support for either side.
- Before finalizing, compare the strongest verified four-quarter cover path for each team at this number and the strongest verified obstacle to each path. Choose from this game's evidence; do not seek a favorite/underdog mix across the slate.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections under these exact headings:
CASE FOR ${homeTeam.toUpperCase()} COVERING THE SPREAD:
CASE FOR ${awayTeam.toUpperCase()} COVERING THE SPREAD:
(Each case should be 2-3 paragraphs explaining that team's strongest verified four-quarter path to covering this posted spread and the strongest verified obstacle to that path.)`
};


export default NCAAF_CONSTITUTION;
