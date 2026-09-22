import { ncaafFetchers } from './agentic/tools/statRouters/ncaafFetchers.js';
import { nflGameEvidence } from './nflGameEvidence.js';

/** A small guaranteed baseline; optional tool use can investigate beyond it. */
export async function footballEvidenceBundle({ league, home, away, season, loaders }) {
  const college = league === 'NCAAF';
  const keys = college
    ? ['NCAAF_DEFENSE', 'NCAAF_PRESSURE_RATE', 'NCAAF_SUCCESS_RATE', 'NCAAF_EXPLOSIVE_PLAYS', 'NCAAF_REDZONE', 'NCAAF_TURNOVER_MARGIN']
    : ['NFL_GAME_EVIDENCE'];
  const fetchers = loaders || (college ? ncaafFetchers : {
    NFL_GAME_EVIDENCE: (_sport, home, away, season) => nflGameEvidence({ home, away, season }),
  });
  const sport = college ? 'americanfootball_ncaaf' : 'americanfootball_nfl';
  const results = await Promise.allSettled(keys.map(async key => fetchers[key](sport, home, away, season)));
  return Object.fromEntries(results.map((result, index) => [keys[index], result.status === 'fulfilled'
    ? result.value : { unavailable: true, reason: result.reason?.message || 'Source unavailable' }]));
}

/** Rows, not JSON: a reader gets "key: value" lines and indented blocks, never braces and quoted keys. */
export function evidenceRows(value, depth = 0) {
  const pad = '  '.repeat(depth);
  if (value == null) return `${pad}not available`;
  if (Array.isArray(value)) {
    if (value.every(v => v == null || typeof v !== 'object')) return `${pad}${value.map(v => v == null ? 'not available' : String(v)).join(', ') || 'none'}`;
    return value.map((v, i) => `${pad}- item ${i + 1}\n${evidenceRows(v, depth + 1)}`).join('\n');
  }
  if (typeof value !== 'object') return `${pad}${String(value)}`;
  return Object.entries(value).map(([k, v]) => {
    const key = k;
    if (v == null) return `${pad}${key}: not available`;
    if (typeof v !== 'object') return `${pad}${key}: ${v}`;
    if (Array.isArray(v) && v.every(x => x == null || typeof x !== 'object')) return `${pad}${key}: ${v.map(x => x == null ? 'not available' : String(x)).join(', ') || 'none'}`;
    return `${pad}${key}:\n${evidenceRows(v, depth + 1)}`;
  }).join('\n');
}

export function formatFootballEvidence(bundle) {
  const heading = Object.hasOwn(bundle, 'NFL_GAME_EVIDENCE') ? 'OFFENSE AND DEFENSE — SOURCE EVIDENCE' : 'DEFENSIVE MATCHUP — SOURCE EVIDENCE';
  return `${heading}\nKeep the reported season, sample and units with each measure. Totals are not per-game rates. Missing charting is not zero.\n${Object.entries(bundle).map(([key, value]) => `${key}\n${evidenceRows(value)}`).join('\n\n')}`;
}
