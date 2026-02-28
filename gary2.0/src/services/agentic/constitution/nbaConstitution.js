/**
 * NBA Constitution - NBA-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: Empty — all NBA context covered by BASE_RULES, system prompt, scout report
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
  // SECTION A: DOMAIN KNOWLEDGE — empty for NBA
  // All NBA context covered by BASE_RULES, system prompt, and scout report.
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

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
