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
 * Validate injury coverage from pre-populated context data (RapidAPI).
 * Instead of checking if Gemini called GET_TEAM_INJURIES, verify that
 * context.injuries has data for every team on the slate.
 *
 * @param {Object} context - DFS context with injuries and games
 * @returns {{ covered: boolean, missingTeams: string[] }}
 */
export function validateInjuryCoverageFromContext(context) {
  const slateTeams = new Set();
  for (const game of (context.games || [])) {
    if (game.homeTeam) slateTeams.add(game.homeTeam);
    if (game.awayTeam) slateTeams.add(game.awayTeam);
    if (game.home_team) slateTeams.add(game.home_team);
    if (game.away_team) slateTeams.add(game.away_team);
  }
  // Also extract teams from players if games array is sparse
  if (slateTeams.size === 0) {
    for (const p of (context.players || [])) {
      if (p.team) slateTeams.add(p.team);
    }
  }

  const injuries = context.injuries || {};
  const missingTeams = [];
  for (const team of slateTeams) {
    // injuries[team] existing (even as empty array) means we checked that team
    if (!(team in injuries)) {
      missingTeams.push(team);
    }
  }
  return { covered: missingTeams.length === 0, missingTeams };
}

/**
 * Check which DFS investigation factors have been covered by tool calls.
 * For INJURY_LANDSCAPE, uses pre-populated context data instead of tool call validation
 * when context is provided (injuries come from RapidAPI, not Gemini tool calls).
 *
 * @param {Array<{tool: string, entity?: string}>} calledTools - Tool calls with optional entity
 * @param {string} sport - Sport key ('NBA', 'NFL')
 * @param {Object} [context] - DFS context (if provided, validates injury coverage from API data)
 * @returns {{ covered: string[], missing: string[], coverage: number, totalFactors: number }}
 */
export function getDFSInvestigatedFactors(calledTools, sport, context) {
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

    // INJURY_LANDSCAPE: validate from context API data, not Gemini tool calls
    if (factorName === 'INJURY_LANDSCAPE' && context) {
      const injuryCheck = validateInjuryCoverageFromContext(context);
      if (injuryCheck.covered) {
        covered.push(factorName);
      } else {
        missing.push(factorName);
        console.warn(`[Coverage] Injury data missing for teams: ${injuryCheck.missingTeams.join(', ')}`);
      }
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

// ═══════════════════════════════════════════════════════════════════════════════
// PER-GAME RESEARCH FACTORS (Phase 2.5)
// ═══════════════════════════════════════════════════════════════════════════════

export const DFS_GAME_RESEARCH_FACTORS = {
  NBA: {
    INJURY_USAGE_REDISTRIBUTION: ['GET_TEAM_INJURIES', 'GET_TEAM_USAGE_STATS'],
    SALARY_VALUE_LANDSCAPE: ['GET_PLAYER_SALARY', 'GET_PLAYER_SEASON_STATS'],
    PACE_SCORING_ENVIRONMENT: ['GET_GAME_ENVIRONMENT'],
    PLAYER_CEILING_SCENARIOS: ['GET_PLAYER_GAME_LOGS', 'GET_PLAYER_SEASON_STATS'],
    POSITIONAL_MATCHUP_ADVANTAGES: ['GET_MATCHUP_DATA'],
    STACKING_CORRELATION: ['GET_TEAM_USAGE_STATS', 'GET_GAME_ENVIRONMENT'],
    BLOWOUT_RISK_MINUTES: ['GET_GAME_ENVIRONMENT'],
    BREAKING_CONTEXT: ['SEARCH_LIVE_NEWS']
  },
  NFL: {
    INJURY_USAGE_REDISTRIBUTION: ['GET_TEAM_INJURIES', 'GET_TEAM_USAGE_STATS'],
    SALARY_VALUE_LANDSCAPE: ['GET_PLAYER_SALARY', 'GET_PLAYER_SEASON_STATS'],
    GAME_SCRIPT_ENVIRONMENT: ['GET_GAME_ENVIRONMENT'],
    PLAYER_CEILING_SCENARIOS: ['GET_PLAYER_GAME_LOGS', 'GET_PLAYER_SEASON_STATS'],
    TARGET_RUSH_SHARE_MATCHUP: ['GET_MATCHUP_DATA'],
    STACKING_CORRELATION: ['GET_TEAM_USAGE_STATS', 'GET_GAME_ENVIRONMENT'],
    WEATHER_CONDITIONS: ['SEARCH_LIVE_NEWS'],
    BREAKING_CONTEXT: ['SEARCH_LIVE_NEWS']
  }
};

/**
 * Check which per-game DFS research factors have been covered by tool calls.
 * For INJURY_USAGE_REDISTRIBUTION, validates from context API data when available.
 *
 * @param {Array<{tool: string}>} calledTools - Array of tool calls with `tool` property
 * @param {string} sport - Sport key ('NBA', 'NFL')
 * @param {Object} [context] - DFS context (if provided, validates injury coverage from API data)
 * @returns {{ covered: string[], missing: string[], coverage: number, totalFactors: number }}
 */
export function getDFSGameResearchFactors(calledTools, sport, context) {
  const key = (sport || '').toUpperCase();
  const factors = DFS_GAME_RESEARCH_FACTORS[key];

  if (!factors) {
    return { covered: [], missing: [], coverage: 1.0, totalFactors: 0 };
  }

  const calledToolNames = new Set(calledTools.map(t => t.tool));

  const covered = [];
  const missing = [];

  for (const [factorName, requiredTools] of Object.entries(factors)) {
    if (!requiredTools || requiredTools.length === 0) {
      covered.push(factorName);
      continue;
    }

    // INJURY_USAGE_REDISTRIBUTION: validate injury portion from context API data
    if (factorName === 'INJURY_USAGE_REDISTRIBUTION' && context) {
      const injuryCheck = validateInjuryCoverageFromContext(context);
      // Injury data covered from API — still need usage tool call for the "usage" part
      const hasUsageTool = calledToolNames.has('GET_TEAM_USAGE_STATS');
      if (injuryCheck.covered || hasUsageTool) {
        covered.push(factorName);
      } else {
        missing.push(factorName);
      }
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
 * Build a human-readable gap list for missing per-game research factors.
 *
 * @param {string[]} missingFactors - Factor names that weren't covered
 * @param {string} sport - Sport key
 * @returns {string} Formatted gap list
 */
export function buildDFSGameCoverageGapList(missingFactors, sport) {
  const key = (sport || '').toUpperCase();
  const factors = DFS_GAME_RESEARCH_FACTORS[key];
  if (!factors) return '';

  return missingFactors
    .map(name => {
      const tools = factors[name];
      if (!tools || tools.length === 0) return `- ${name}: synthesis factor (use your existing findings)`;
      return `- ${name}: call ${tools.join(' or ')}`;
    })
    .join('\n');
}
