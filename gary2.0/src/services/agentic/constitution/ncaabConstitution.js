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
- Coaching in college basketball has more impact than at the professional level — preparation time is longer, schematic adjustments matter more
- College rosters are thin (7-8 man rotations) — a single key absence changes a team more than in pro sports

### TOURNAMENT AWARENESS

- Tournament games are played on neutral courts — home court advantage is removed. Home/away records and splits are irrelevant for tournament games.
- In the NCAA Tournament, all teams in the same round play on the same schedule — rest is NOT a differentiator between opponents in the same round. A team that played overtime or a close game in the previous round is not meaningfully fatigued compared to a team that won in a blowout — they had the same amount of time between games and are conditioned athletes in a tournament setting. Do not use previous round game flow as a rest or fatigue argument.
- College basketball has massive talent gaps between conferences — a mid-major's season stats were built against different competition than a power conference team's stats. Adjusted efficiency metrics (T-Rank, AdjEM) account for this.
- Guard play and tournament experience are factors in NCAA Tournament performance

### INJURIES IN TOURNAMENT PLAY
- Only FRESH injuries represent information the market may not have fully absorbed
- Any absence longer than a few games is already in the team's current stats and in the line — the team you are evaluating IS the team without that player
- Injuries and lineup changes move college lines more dramatically because roster depth is thinner

### NCAAB INJURY LABELS (READ FROM SCOUT REPORT)

- **FRESH** — New absence. Market may not have fully adjusted.
- **SHORT-TERM** — Recent absence. Line is beginning to reflect it.
- **LONG-TERM / SEASON-LONG** — Fully reflected in the team's stats and the spread.

Use the exact tag shown in the scout report for this game.

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
Case for ${homeTeam}
Case for ${awayTeam}
(Each case should be 2-3 paragraphs explaining why that side is the right bet at this spread number tonight. Even for lopsided matchups, there is always a case at this number.)`
};


export default NCAAB_CONSTITUTION;
