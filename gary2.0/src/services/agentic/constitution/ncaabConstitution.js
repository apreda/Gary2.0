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
  // SECTION A: DOMAIN KNOWLEDGE — empty for NCAAB
  // All NCAAB context covered by BASE_RULES, system prompt, and scout report.
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

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
