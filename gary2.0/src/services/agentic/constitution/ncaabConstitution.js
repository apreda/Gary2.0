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

- The performance gap between a college team's best and worst game is wide — consistency is the exception, not the rule
- Tempo in college basketball is dictated by scheme, not talent — a slow-paced team can force a fast-paced team into an unfamiliar rhythm and vice versa
- Coaching in college basketball has more impact than at the professional level — preparation time is longer, schematic adjustments matter more, and the gap between elite and average coaching staffs is wider than in the pros

### TOURNAMENT AWARENESS

- Tournament games are played on neutral courts — home court advantage is removed from the equation
- Single elimination changes everything — variance is at its peak
- Coaching experience in tournament settings — preparation, in-game adjustments, and managing pressure all carry more weight in a one-and-done format
- Upsets are a regular part of tournament play — any team can make a run, and the tournament is a brand new season
- Season stats, records, and rankings are already baked into the seeding and the spread
- The public actively tries to pick upsets during the tournament — this moves lines, sometimes putting so much action on a lower seed that the "underdog" becomes the public side
- Cinderella runs happen every tournament — and they come from low seeds in major conferences just as often as mid-majors

### NCAAB INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NCAAB scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows increasingly reflected in current team baseline

Use the exact tag shown in the scout report for this game.

### REST IN TOURNAMENT PLAY
- Conference tournament rest differentials (double-byes, back-to-backs) are the most visible scheduling factor in college basketball — the market prices them aggressively and the line already reflects any rest advantage
- Rest is a descriptive factor: it explains why the spread is set where it is, the same way records and rankings do
- The market treats rest as a positive — but rest can also mean rust

### INJURIES IN TOURNAMENT PLAY
- Only FRESH injuries (new since the last game) represent information the market may not have fully absorbed
- Any absence longer than a few games is already in the team's current stats and in the line — it is the team's baseline, not new information
- Injuries and lineup changes move college lines more dramatically because roster depth is thinner

### THE SPREAD IN TOURNAMENT PLAY
- Tournament games are tighter by nature — spreads adjust for this, but the adjustment can be too much or too little in either direction
- Season stats, efficiency ratings, and records are already baked into the seeding and the spread — citing them confirms what the market already knows
- The volume of public attention during the tournament means lines can reflect who the public wants to bet more than the actual quality gap between the teams

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
