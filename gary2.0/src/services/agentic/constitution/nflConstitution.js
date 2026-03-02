/**
 * NFL Constitution - NFL-Specific Context for Gary
 * - domainKnowledge: empty (Mar 2026 — thinking model doesn't need awareness hints)
 * - guardrails: H2H zero tolerance
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NFL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NFL-specific reference material
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
${getH2HZeroTolerance('NFL')}
`
};


export default NFL_CONSTITUTION;
