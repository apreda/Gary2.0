/**
 * NBA Constitution - NBA-Specific Context for Gary
 *
 * Three sections for phase-aligned delivery:
 * - domainKnowledge: NBA-specific sport truths + spread awareness
 * - guardrails: H2H zero tolerance (prevents training-data fabrication of H2H records)
 *
 * Everything else is covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Team vs player stats → system prompt <identity> + <core_principles>
 * - Stat definitions (On-Off, TS%, eFG%, Four Factors) → model knowledge + scout report labels
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Ranking gap examples → anchors Gary on specific stats (subtle L3)
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NBA_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NBA-specific sport truths + spread awareness
  // Pure awareness statements. No predictions. No methodology.
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
## NBA ANALYSIS

### THE SPORT
- The 82-game regular season creates fatigue accumulation — back-to-back games, road trips, and schedule density are real factors that compound over weeks
- Star player availability drives outcomes — a single player can represent a disproportionate share of a team's offensive creation and defensive identity
- The trade deadline and buyout market reshape rosters mid-season — team chemistry, rotations, and role clarity can shift overnight
- Load management and strategic rest are routine parts of the regular season — a team's best lineup may not be available on any given night
- Pace and tempo are driven by personnel and coaching philosophy — tempo mismatches create advantages for the team that controls pace

### THE SPREAD
- NBA lines are sharp — heavy betting volume and sophisticated models mean the market is efficient
- Injury news and lineup confirmations move NBA lines quickly and significantly
- Public betting in the NBA tends to favor big-name teams and overs, especially for nationally televised games
- Back-to-back and rest situations are already factored into NBA spreads by oddsmakers
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NBA')}
`
};


export default NBA_CONSTITUTION;
