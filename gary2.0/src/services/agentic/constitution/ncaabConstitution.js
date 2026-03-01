/**
 * NCAAB Constitution - NCAAB-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: Empty — all NCAAB context covered by BASE_RULES, system prompt, scout report
 * - guardrails: H2H zero tolerance, GTD note
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
 * - Ranking gap examples → anchors Gary on specific stats (subtle L3)
 * - Blog/article rules → BASE_RULES EXTERNAL INFLUENCE PROHIBITION
 * - The Spot and the Price → Flash investigation prompts + system prompt
 * - AdjEM vs spread → L3 violation (tells Gary what's priced in)
 * - Records and the Line → system prompt <analysis_framework> USING STATS
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NCAAB_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NCAAB awareness context for Gary
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
- Home court advantage in college basketball is amplified by younger rosters, hostile student sections, travel fatigue, and unfamiliar venues
- The performance gap between a college team's best and worst game is wide — consistency is the exception, not the rule
- Conference schedules create familiarity that doesn't exist in non-conference play — teams see the same opponents, schemes, and personnel multiple times per season
- Late-season motivation is a real force — teams fighting for postseason positioning play differently than teams with nothing at stake
- Tempo in college basketball is dictated by scheme, not talent — a slow-paced team can force a fast-paced team into an unfamiliar rhythm and vice versa
- Non-conference records can be misleading — the quality of opponents varies dramatically and inflated records often correct during conference play

### THE SPREAD
- Spreads in NCAAB are heavily influenced by home court, with the home team typically receiving a built-in advantage in the number
- Public betting volume in college basketball is heavily concentrated on ranked teams and nationally televised games — lines for those games reflect different market dynamics than under-the-radar conference matchups
- Injuries and lineup changes move college lines more dramatically because roster depth is thinner
- Conference games and non-conference games are priced differently — the market has more data and sharper numbers in conference play because the opponents are known quantities
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance, GTD note
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NCAAB')}

**NCAAB GTD NOTE:**
- GTD means the player's availability is UNCERTAIN — they may or may not play
- A GTD after weeks/months of absence could signal a RETURN — a different situation than a day-to-day minor tweak
`
};


export default NCAAB_CONSTITUTION;
