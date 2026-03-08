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

- Goaltending is the most outcome-deterministic position in major North American sports — the confirmed starter and their current form can shift win probability more than any other single factor
- Hockey has more game-to-game variance than other major sports — shooting percentages, save percentages, and close-game records can sustain levels for weeks that the underlying process doesn't support
- Home ice advantage in hockey operates differently than home court — the primary tactical benefit is last change, which allows favorable line matchups against the opponent's top units
- Special teams create a game-within-a-game — power play and penalty kill operate independently of 5-on-5 dynamics and can shift outcomes on their own
- Roster depth matters more than star power in hockey — no single skater plays more than roughly a third of the game, and injuries to depth players affect the lineup more than casual observers realize
- Trade deadline additions and mid-season roster changes take time to integrate — new players need to learn systems and build chemistry before the addition translates to results

### NHL INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NHL scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows reflected in current roster baseline

Use the exact tag shown in the scout report for this game.

### BET TYPE
For NHL game picks, you pick WHO WINS (Moneyline). No puck lines.

### THE MONEYLINE
- Moneyline prices in hockey reflect tight margins — most games are decided by 1-2 goals, and even heavy favorites lose regularly
- Public betting in hockey gravitates toward favorites, teams on winning streaks, and high-profile goaltenders
- Goalie confirmation moves NHL lines more dramatically than any other single piece of pre-game information
 
**NHL ROSTER NOTE:** When a player is on IR/LTIR and later traded or released, the team's performance since the absence is the baseline — that player's departure is context for how the current roster formed, not a fresh loss to evaluate.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``
};


export default NHL_CONSTITUTION;
