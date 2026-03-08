/**
 * Scout Report Builder — Slim Dispatcher
 *
 * Routes to per-sport builders and re-exports shared functions
 * for backwards compatibility with all 12 existing importers.
 *
 * Previously 11,422 lines — now a thin orchestrator.
 */

import { buildNbaScoutReport } from './sports/nba.js';
import { buildNhlScoutReport } from './sports/nhl.js';
import { buildNflScoutReport } from './sports/nfl.js';
import { buildNcaabScoutReport } from './sports/ncaab.js';
import { buildNcaafScoutReport } from './sports/ncaaf.js';
import { buildMlbScoutReport } from './sports/mlb.js';

// Re-export shared utilities for external consumers
// (orchestrator/, flashAdvisor, statRouters/, propsAgenticRunner, dfsToolDefinitions, etc.)
export { geminiGroundingSearch, getGroundedWeather } from './shared/grounding.js';
export { fetchPropLineMovement, getPlayerPropMovement, fetchComprehensivePropsNarrative } from './shared/propsUtilities.js';
export { buildVerifiedTaleOfTape } from './shared/taleOfTape.js';
export { fetchCurrentState } from './shared/dataFetchers.js';

import { normalizeSport } from './shared/utilities.js';
import { assembleFlashReport } from './shared/flashReportAssembler.js';

const SPORT_BUILDERS = {
  'NBA': buildNbaScoutReport,
  'NHL': buildNhlScoutReport,
  'NFL': buildNflScoutReport,
  'NCAAB': buildNcaabScoutReport,
  'NCAAF': buildNcaafScoutReport,
  'MLB': buildMlbScoutReport,
  'WBC': buildMlbScoutReport,
};

/**
 * Build a scout report for a game.
 * Dispatches to the appropriate per-sport builder.
 *
 * @param {Object} game - Game object with home_team, away_team, etc.
 * @param {string} sport - Sport key (e.g., 'basketball_nba', 'NBA', 'icehockey_nhl')
 * @param {Object} options - Optional overrides (sportsbookOdds, etc.)
 * @returns {Object} { garyText, flashText, text, injuries, verifiedTaleOfTape, venue, ... }
 */
export async function buildScoutReport(game, sport, options = {}) {
  const sportKey = normalizeSport(sport);
  const builder = SPORT_BUILDERS[sportKey];
  if (!builder) {
    throw new Error(`[Scout Report] No builder for sport: ${sport} (normalized: ${sportKey})`);
  }
  const result = await builder(game, options);
  return {
    ...result,
    // Gary's report: pure data (no token menu, no tale of tape)
    garyText: result.text,
    // Flash's report: data + Tale of Tape + token menu (investigation-ready)
    flashText: assembleFlashReport(result.text, result.verifiedTaleOfTape, result.tokenMenu),
  };
}

