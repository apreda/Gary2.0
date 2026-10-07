import { buildBullpenSnapshot } from '../../../bullpen/snapshot.js';
import { MlbRequiredDataError } from '../../../mlbDataReadiness.js';
import { searchBullpenReporting as bullpenSearch } from '../../../bullpen/reporting.js';
import { mlbPressAsWritten } from '../../scoutReport/sports/mlbPressAsWritten.js'; // ADAPTED (founder, Oct 7 2026): the pens as written
import { mlbPenPlayoffLines } from '../../scoutReport/sports/mlbPenPlayoffLines.js'; // ADAPTED (founder GO, Oct 7 2026)
/**
 * Scout Report Builder — Slim Dispatcher
 *
 * Routes to per-sport builders and re-exports shared functions
 * for backwards compatibility with all 12 existing importers.
 *
 * Previously 11,422 lines — now a thin orchestrator.
 */

// ADAPTED (other sports + import paths): this lane builds the MLB scout
// report only; the other builders are not loaded. Shared helpers that are
// pure plumbing (sport-key normalizing, props line movement, current-state
// fetch) come from today's tree; the report assembler and the tale of the
// tape are June's, in this folder.
import { buildMlbScoutReport } from './sports/mlb.js';
const buildNbaScoutReport = null, buildNhlScoutReport = null, buildNflScoutReport = null,
  buildNcaabScoutReport = null, buildNcaafScoutReport = null, buildSoccerScoutReport = null;

// Re-export shared utilities for external consumers
// (orchestrator/, flashAdvisor, statRouters/, dfsToolDefinitions, etc.)
export { geminiGroundingSearch, getGroundedWeather } from './shared/grounding.js';
export { fetchPropLineMovement, getPlayerPropMovement, fetchComprehensivePropsNarrative } from '../../scoutReport/shared/propsUtilities.js';
export { buildVerifiedTaleOfTape } from './shared/taleOfTape.js';
export { fetchCurrentState } from '../../scoutReport/shared/dataFetchers.js';

import { normalizeSport } from '../../scoutReport/shared/utilities.js';
import { assembleFlashReport } from './shared/flashReportAssembler.js';

const SPORT_BUILDERS = {
  'NBA': buildNbaScoutReport,
  'NHL': buildNhlScoutReport,
  'NFL': buildNflScoutReport,
  'NCAAB': buildNcaabScoutReport,
  'NCAAF': buildNcaafScoutReport,
  'MLB': buildMlbScoutReport,
  'WC': buildSoccerScoutReport,
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
// ADAPTED (founder GO, Oct 7 2026, cutting the noise): in a postseason game the desk's pen leaves out each reliever's
// per-pitch-type rows (velocity, whiffs and hard contact on a handful of pitches), his 14-day platoon counts and his
// stolen-base line, which made most of an 84K-character section. Workload, rest, last outings, lines, usage and his
// matchups against this opponent stay, and the tools still read the full snapshot.
const PLAYOFF_PEN_LINES_OUT = [/^ {2}Pitches, newest outings/, /^ {2}Pitches, prior outings/, /^ {2}Platoon \(14d\):/, /^ {2}Runners:/];
function playoffPenText(text) {
  return String(text).split('\n').filter((line) => !PLAYOFF_PEN_LINES_OUT.some((re) => re.test(line)))
    .join('\n').replace(' Pitch rows read: type, pitches, usage share, velocity, strikes/pitches, whiffs/swings, hard-hit share of tracked contact. Platoon lines are observed pitches/plate appearances in the previous 14 days, not season splits.', '');
}

// ADAPTED (founder, Oct 7 2026: "go from a summary to the full article, so Gary can read the full context and not
// have it be summarized by a lesser model"): in a postseason game the pen's searched paragraphs ("THE PEN, AS
// REPORTED") are not requested; THE PENS, AS WRITTEN carries each club's bullpen reporting complete
// (mlbPressAsWritten.js, kind 'pen'), skipping any story the desk already prints.
export async function playoffPens(game, result, snapshot) {
  const text = playoffPenText(snapshot.text).replace(/\n\nTHE PEN, AS REPORTED — [^\n]* \(not requested\)\nReported availability, restrictions and warm-ups UNKNOWN; no reporting read requested\./g, '');
  const [, round, gameNumber] = String(result.postseasonRound || '').match(/^(.+?), Game (\d+)$/) || [];
  const asOf = Math.min(Date.now(), Date.parse(game.commence_time || game.start_time) || Date.now());
  const pens = await mlbPressAsWritten({
    homeTeam: game.home_team_data?.full_name || game.home_team, awayTeam: game.away_team_data?.full_name || game.away_team,
    round: round || 'Postseason', gameNumber: Number(gameNumber) || null, asOf, kind: 'pen',
    skipUrls: String(result.text).match(/https:\/\/[^\s)|<>"]+/g) || [],
  }).catch((e) => `No reporting on either bullpen could be read for this game (${e.message}). This is a retrieval failure, not a finding that nothing was written; reported availability, restrictions and warm-ups are UNKNOWN.`);
  // Each relief arm's postseason game by game, his regular season by hand, his last three outings batter by
  // batter (founder GO, Oct 7 2026). A failed read leaves the pen as it was.
  const dateEt = new Date(asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const arms = await mlbPenPlayoffLines(snapshot, { season: Number(dateEt.slice(0, 4)), beforeDate: dateEt }).catch(() => '');
  return `${text}${arms ? `\n\n${arms}` : ''}\n\nTHE PENS, AS WRITTEN\n${pens}`;
}

export async function buildScoutReport(game, sport, options = {}) {
  const sportKey = normalizeSport(sport);
  const builder = SPORT_BUILDERS[sportKey];
  if (!builder) {
    throw new Error(`[Scout Report] No builder for sport: ${sport} (normalized: ${sportKey})`);
  }
  const result = await builder(game, options);
  // September 16: the active June engine receives the same complete pen as its tools.
  let bullpenSnapshot;
  const playoff = result.postseason === true;
  try { bullpenSnapshot = await buildBullpenSnapshot({ ...game, gamePk: result.gamePk || game.gamePk }, { ...options, search: playoff ? null : bullpenSearch }); }
  catch (error) { options.signal?.throwIfAborted(); throw new MlbRequiredDataError(`Bullpen: ${error.message}`); }
  result.text += `\n\n${playoff ? await playoffPens(game, result, bullpenSnapshot) : bullpenSnapshot.text}`;
  result.bullpenSnapshot = bullpenSnapshot;
  return {
    ...result,
    // Gary's report: pure data (no token menu, no tale of tape)
    garyText: result.text,
    // Flash's report: data + Tale of Tape + token menu (investigation-ready)
    flashText: assembleFlashReport(result.text, result.verifiedTaleOfTape, result.tokenMenu),
  };
}
