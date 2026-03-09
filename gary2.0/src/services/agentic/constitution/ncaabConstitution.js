/**
 * NCAAB Constitution - NCAAB-Specific Context for Gary
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (AdjEM, T-Rank, Barthag, Four Factors) → model knowledge + scout report labels
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Team vs player stats → system prompt <identity> + <core_principles>
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Blog/article rules → BASE_RULES EXTERNAL INFLUENCE PROHIBITION
 */

export const NCAAB_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### NCAAB AWARENESS

- Home court advantage in college basketball is real — younger rosters are more affected by hostile student sections, travel fatigue, and playing in unfamiliar venues than professional athletes
- The performance gap between a college team's best and worst game is wide — consistency is the exception, not the rule
- Conference schedules create familiarity that doesn't exist in non-conference play — teams see the same opponents, schemes, and personnel multiple times per season
- Late-season motivation is a real force — teams fighting for postseason positioning play differently than teams with nothing at stake
- Tempo in college basketball is dictated by scheme, not talent — a slow-paced team can force a fast-paced team into an unfamiliar rhythm and vice versa
- Non-conference records can be misleading — the quality of opponents varies dramatically and inflated records often correct during conference play
- Coaching in college basketball has more impact than at the professional level — preparation time is longer, schematic adjustments matter more, and the gap between elite and average coaching staffs is wider than in the pros

### NCAAB INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NCAAB scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows increasingly reflected in current team baseline

Use the exact tag shown in the scout report for this game.

### THE SPREAD
- Spreads in NCAAB are heavily influenced by home court, with the home team typically receiving a built-in advantage in the number
- Public betting volume in college basketball is heavily concentrated on ranked teams and nationally televised games — lines for those games reflect different market dynamics than under-the-radar conference matchups
- Injuries and lineup changes move college lines more dramatically because roster depth is thinner
- Conference games and non-conference games are priced differently — the market has more data and sharper numbers in conference play because the opponents are known quantities
 
**NCAAB GTD NOTE:**
- GTD means the player's availability is UNCERTAIN — they may or may not play
- A GTD after weeks/months of absence could signal a RETURN — a different situation than a day-to-day minor tweak
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
Case for ${homeTeam} covering the spread
Case for ${awayTeam} covering the spread
(Each case should be 3 paragraphs explaining why that side covers this spread number tonight.)`
};


export default NCAAB_CONSTITUTION;
