/**
 * NHL Constitution - NHL-Specific Context for Gary
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (Corsi, PDO, xG, GSAx, HDSV%) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Goaltending investigation → Flash investigation prompts (factor #2 + deep investigation)
 * - Situational factors (PP%, B2B, rest) → Flash investigation prompts
 * - Goalie-streak connection → Flash investigation prompts
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
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

- Goaltending is a significant factor in hockey outcomes — the confirmed starter and their current form can shift the price and the matchup dynamics
- Hockey has more game-to-game variance than other major sports — shooting percentages, save percentages, and close-game records can sustain levels for weeks that the underlying process doesn't support
- Home ice advantage in hockey operates differently than home court — the primary tactical benefit is last change, which allows favorable line matchups against the opponent's top units
- Special teams create a game-within-a-game — power play and penalty kill operate independently of 5-on-5 dynamics and can shift outcomes on their own
- Roster depth matters more than star power in hockey — no single skater plays more than roughly a third of the game, and injuries to depth players affect the lineup more than casual observers realize
- Trade deadline additions and mid-season roster changes take time to integrate — new players need to learn systems and build chemistry before the addition translates to results

### NHL VARIANCE
Hockey has more single-game variance than any other major North American sport. Roughly half of all NHL games are decided by one goal. Low scoring, goaltender dominance, and deflections/bounces all contribute to this variance.

- Streaks in hockey can be goalie-driven, PDO-driven, or process-driven
- Close-game records (OT wins, shootout wins, one-goal victories) fluctuate significantly season to season

### TRANSITIVE PROPERTY
"Team A beat Team B, Team B beat Team C, therefore Team A beats Team C." Each hockey game has a different goaltender matchup, different special teams context, and different schedule situation.

- H2H records between two teams (even divisional rivals who play 3-4 times) — each meeting had its own conditions
- Results against other opponents happened under their own conditions

### NHL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NHL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current roster baseline

Use the exact tag shown in the scout report for this game.

### BET TYPE AWARENESS
For NHL game picks, you can choose moneyline (winner outright, includes OT/SO) or puck line (standard -1.5/+1.5, regulation + OT only, no shootouts).

Heavy ML favorites return less value per dollar risked — a -200 favorite needs to win 67% of the time just to break even. When the favorite's ML price is steep, consider the puck line on both sides. If you believe the favorite wins but not by 2+ goals, think about what that tells you about the underdog's ability to stay within one goal.

**NHL ROSTER NOTE:** When a player is on IR/LTIR and later traded or released, the team's performance since the absence is the baseline — that player's departure is context for how the current roster formed, not a fresh loss to evaluate.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam} winning
Case for ${awayTeam} winning
(Each case should be 3 paragraphs explaining why that team wins tonight.)`
};


export default NHL_CONSTITUTION;
