/**
 * DFS Investigation Factors — Tool-to-Factor Mapping for Coverage Validation
 *
 * Maps DFS tool calls to investigation factor categories.
 * Used by Phase 2 slate analyzer to check coverage after Flash finishes investigating.
 *
 * Modeled after investigationFactors.js (game picks) but uses DFS tool names
 * instead of stat tokens.
 *
 * Pure data + pure functions. Zero external imports.
 */

export const DFS_INVESTIGATION_FACTORS = {
  NBA: {
    INJURY_LANDSCAPE: ['GET_TEAM_INJURIES'],
    GAME_ENVIRONMENTS: ['GET_GAME_ENVIRONMENT'],
    USAGE_SHIFTS: ['GET_TEAM_USAGE_STATS'],
    PACE_MATCHUPS: ['GET_GAME_ENVIRONMENT'],
    VALUE_SALARY_GAPS: ['GET_PLAYER_SALARY'],
    BLOWOUT_RISK: ['GET_GAME_ENVIRONMENT'],
    BACK_TO_BACK: ['GET_GAME_ENVIRONMENT'],
    STACKING_ENVIRONMENTS: [],  // Synthesis — no direct tool
    BREAKING_NEWS: ['SEARCH_LIVE_NEWS']
  },

  NFL: {
    INJURY_LANDSCAPE: ['GET_TEAM_INJURIES'],
    GAME_ENVIRONMENTS: ['GET_GAME_ENVIRONMENT'],
    USAGE_SHIFTS: ['GET_TEAM_USAGE_STATS'],
    GAME_SCRIPT_PROJECTIONS: ['GET_GAME_ENVIRONMENT'],
    RED_ZONE_OPPORTUNITIES: [],  // Synthesis — no direct tool
    VALUE_SALARY_GAPS: ['GET_PLAYER_SALARY'],
    STACKING_ENVIRONMENTS: [],  // Synthesis — no direct tool
    WEATHER: ['SEARCH_LIVE_NEWS'],
    BREAKING_NEWS: ['SEARCH_LIVE_NEWS']
  }
};

/**
 * Check which DFS investigation factors have been covered by tool calls.
 *
 * @param {Array<{tool: string}>} calledTools - Array of tool calls with `tool` property
 * @param {string} sport - Sport key ('NBA', 'NFL')
 * @returns {{ covered: string[], missing: string[], coverage: number, totalFactors: number }}
 */
export function getDFSInvestigatedFactors(calledTools, sport) {
  const key = (sport || '').toUpperCase();
  const factors = DFS_INVESTIGATION_FACTORS[key];

  if (!factors) {
    return { covered: [], missing: [], coverage: 1.0, totalFactors: 0 };
  }

  const calledToolNames = new Set(calledTools.map(t => t.tool));

  const covered = [];
  const missing = [];

  for (const [factorName, requiredTools] of Object.entries(factors)) {
    // Synthesis factors (empty tool list) are always counted as covered
    if (!requiredTools || requiredTools.length === 0) {
      covered.push(factorName);
      continue;
    }

    const isCovered = requiredTools.some(tool => calledToolNames.has(tool));
    if (isCovered) {
      covered.push(factorName);
    } else {
      missing.push(factorName);
    }
  }

  const totalFactors = Object.keys(factors).length;
  const coverage = totalFactors > 0 ? covered.length / totalFactors : 1.0;

  return { covered, missing, coverage, totalFactors };
}

/**
 * Build a human-readable gap list for missing factors.
 *
 * @param {string[]} missingFactors - Factor names that weren't covered
 * @param {string} sport - Sport key
 * @returns {string} Formatted gap list
 */
export function buildDFSCoverageGapList(missingFactors, sport) {
  const key = (sport || '').toUpperCase();
  const factors = DFS_INVESTIGATION_FACTORS[key];
  if (!factors) return '';

  return missingFactors
    .map(name => {
      const tools = factors[name];
      if (!tools || tools.length === 0) return `- ${name}: synthesis factor (use your existing findings)`;
      return `- ${name}: call ${tools.join(' or ')}`;
    })
    .join('\n');
}
