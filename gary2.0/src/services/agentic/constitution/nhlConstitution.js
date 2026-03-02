/**
 * NHL Constitution - NHL-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: NHL-specific reference (home ice last change, moneyline only)
 * - guardrails: H2H zero tolerance, IR/LTIR roster note
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

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NHL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NHL-specific reference material
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
### BET TYPE
For NHL game picks, you pick WHO WINS (Moneyline). No puck lines.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance, IR/LTIR roster note
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NHL')}

**NHL ROSTER NOTE:** When a player is on IR/LTIR and later traded or released, the team's performance since the absence is the baseline — that player's departure is context for how the current roster formed, not a fresh loss to evaluate.
`
};


export default NHL_CONSTITUTION;
