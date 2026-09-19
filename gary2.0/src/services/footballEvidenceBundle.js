import { footballAdvancedTokens } from './agentic/tools/statRouters/footballAdvancedTokens.js';
import { ncaafFetchers } from './agentic/tools/statRouters/ncaafFetchers.js';

/** A small guaranteed baseline; optional tool use can investigate beyond it. */
export async function footballEvidenceBundle({ league, home, away, season, loaders }) {
  const college = league === 'NCAAF';
  const keys = college
    ? ['NCAAF_DEFENSE', 'NCAAF_PRESSURE_RATE', 'NCAAF_SUCCESS_RATE', 'NCAAF_EXPLOSIVE_PLAYS', 'NCAAF_REDZONE', 'NCAAF_TURNOVER_MARGIN']
    : ['DEFENSIVE_EPA', 'PRESSURE_RATE', 'RED_ZONE_DEFENSE'];
  const fetchers = loaders || (college ? ncaafFetchers : footballAdvancedTokens);
  const sport = college ? 'americanfootball_ncaaf' : 'americanfootball_nfl';
  const results = await Promise.allSettled(keys.map(key => fetchers[key](sport, home, away, season)));
  return Object.fromEntries(results.map((result, index) => [keys[index], result.status === 'fulfilled'
    ? result.value : { unavailable: true, reason: result.reason?.message || 'Source unavailable' }]));
}

export function formatFootballEvidence(bundle) {
  return `DEFENSIVE MATCHUP — SOURCE EVIDENCE\nKeep the reported season, sample and units with each measure. Totals are not per-game rates. Missing charting is not zero.\n${Object.entries(bundle).map(([key, value]) => `${key}\n${JSON.stringify(value, null, 2)}`).join('\n\n')}`;
}
