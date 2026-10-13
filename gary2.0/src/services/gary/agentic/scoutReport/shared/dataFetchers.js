/**
 * shared/dataFetchers.js
 * Core data fetching functions used by ALL sports in scout report generation. Split by area on Oct 13 2026: each
 * file under dataFetchers/ holds one area, and this index keeps every export the desks import.
 */
export { hasSubstantiveNflSeasonStats } from '../../../../sports/nfl/nflTeamBaseline.js';
export { etGameDateLong, namesRefer, hasSubstantiveNcaafSeasonStats, fetchTeamProfile, createEmptyProfile } from './dataFetchers/teamProfile.js';
export { fetchRecentGames, calculateRestSituation, formatRestSituation, formatRecentForm, fetchNbaBoxScoresForGames, formatRecentFormWithBoxScores } from './dataFetchers/recentGames.js';
export { fetchH2HData, formatH2HSection } from './dataFetchers/headToHead.js';
export { fetchInjuries } from './dataFetchers/injuries.js';
export { fetchCurrentState, scrubNarrative } from './dataFetchers/currentState.js';
export { fetchGroundingInjuries } from './dataFetchers/groundingInjuries.js';
export { formatInjuryReport, formatStartingLineups } from './dataFetchers/injuryReport.js';
export { formatOdds } from './dataFetchers/odds.js';
export { detectReturningPlayers } from './dataFetchers/returningPlayers.js';
