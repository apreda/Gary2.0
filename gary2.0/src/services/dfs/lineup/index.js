// Re-export everything from sub-modules
export * from './dfsConstants.js';
export * from './dfsValidation.js';
export * from './dfsLineupBuilder.js';

// Named re-exports for position helpers
export { isPositionEligible, getPlayerEligibleSlots, getEligibleSlots } from './dfsValidation.js';

// Default export matching original
import { generateDFSLineup, optimizeLineup, findPivotAlternatives, addPivotsToLineup, applyNFLStackingRules, calculateProjectedPoints } from './dfsLineupBuilder.js';
import { identifyBuildType, reflectOnBuild, generateReflectionNotes, calculateValueScore, calculateCeilingScore, calculateFloorScore, calculateDFSMetrics, isSmashSpot, calculateOpportunityScore, selfReviewLineup, validatePuntCount, checkAntiCorrelation, applyChalkFadeStrategy, validateLineup } from './dfsValidation.js';
import { PLATFORM_CONSTRAINTS, GARY_SHARP_KNOWLEDGE, LINEUP_ARCHETYPES, GPP_VALUE_TARGETS } from './dfsConstants.js';

export default {
  generateDFSLineup,
  optimizeLineup,
  findPivotAlternatives,
  addPivotsToLineup,
  applyNFLStackingRules,
  calculateProjectedPoints,
  identifyBuildType,
  reflectOnBuild,
  generateReflectionNotes,
  calculateValueScore,
  calculateCeilingScore,
  calculateFloorScore,
  calculateDFSMetrics,
  isSmashSpot,
  calculateOpportunityScore,
  selfReviewLineup,
  validatePuntCount,
  checkAntiCorrelation,
  applyChalkFadeStrategy,
  validateLineup,
  PLATFORM_CONSTRAINTS,
  GARY_SHARP_KNOWLEDGE,
  LINEUP_ARCHETYPES,
  GPP_VALUE_TARGETS,
};
