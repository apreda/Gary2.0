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

**The game itself:**
- Tournament games are played on neutral courts — home court advantage is removed from the equation
- Single elimination changes everything — variance is at its peak
- Upsets are a regular part of tournament play — any team can make a run, and the tournament is a brand new season
- Cinderella runs happen every tournament — and they come from low seeds in major conferences just as often as mid-majors
- Coaching experience in tournament settings — preparation, in-game adjustments, and managing pressure all carry more weight in a one-and-done format

**Guard play drives tournament outcomes:**
- Tournament games are played against unfamiliar opponents with limited preparation time — set plays and system offense break down against defenses a team has never seen
- When games get tight in the final 5 minutes, it becomes an isolation and pick-and-roll game — guards who can create their own shot and break down a defender one-on-one decide tournament outcomes
- Ball security under pressure is critical — tournament games see more trapping, full-court pressure, and late-game fouling situations that expose teams without reliable ball-handlers
- Guard-driven teams pull upsets because elite perimeter play translates regardless of opponent — a team with two guards who can score in isolation can hang with anyone for 40 minutes regardless of overall talent gap
- Big-heavy teams and system-dependent offenses that dominate in conference play are more vulnerable in tournament settings where their schemes get disrupted by unfamiliar defensive looks
- Late-game free throw shooting correlates heavily with guard play — and late-game free throws decide tight tournament games

**What the market already prices:**
- Season stats, efficiency ratings, records, and rankings are already baked into the seeding and the spread — citing them confirms what the market already knows
- Rest differentials (double-byes, back-to-backs) are the most visible scheduling factor in college basketball — the market prices them aggressively and the line already reflects any rest advantage. Rest explains why the spread is set where it is. The market treats rest as a positive — but rest can also mean rust. When evaluating rest: is there evidence the market has mispriced it in this specific game?
- The public actively tries to pick upsets during the tournament — this moves lines, sometimes putting so much action on a lower seed that the "underdog" becomes the public side
- Conference tournament favorites laying 10+ points have a historically poor ATS record — the single-elimination format, neutral sites, and heightened intensity compress margins
- Tournament games are tighter by nature — spreads adjust for this, but the adjustment can be too much or too little in either direction

### INJURIES IN TOURNAMENT PLAY
- Only FRESH injuries (new since the last game) represent information the market may not have fully absorbed
- Any absence longer than a few games is already in the team's current stats and in the line — it is the team's baseline, not new information. This applies to all injuries — including ones you discover through your own research. If a player has been out for multiple games, their absence is already reflected in the team's current stats AND in the spread. The team you are evaluating IS the team without that player.
- Injuries and lineup changes move college lines more dramatically because roster depth is thinner

### NCAAB INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NCAAB scout-report pipeline and are sport-specific.

- **FRESH** — New absence window
- **SHORT-TERM / LONG-TERM / SEASON-LONG** — Established absence windows increasingly reflected in current team baseline

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
