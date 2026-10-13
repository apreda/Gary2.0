// Pure formatters for measured Hub context. No model calls, provider lookups,
// parsing numbers out of prose, availability claims or betting conclusions.
export const RESEARCH_FACTS_VERSION = 'observed-stats-v1';

export const observedCount = value => (typeof value === 'number' || typeof value === 'string')
  && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0
  ? Number(value) : null;
const measurement = value => (typeof value === 'number' || typeof value === 'string')
  && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const seasonYear = value => observedCount(value) !== null && /^(19|20)\d{2}$/.test(String(value)) ? Number(value) : null;
const label = value => typeof value === 'string' && value.trim() ? value.trim() : null;

function sampledCount(sequence, count, n) {
  const games = observedCount(n), scored = observedCount(count);
  if (!Array.isArray(sequence) || games === null || games < 1 || games > 10 || scored === null
    || sequence.length !== games || sequence.some(value => value !== 0 && value !== 1)
    || sequence.reduce((total, value) => total + value, 0) !== scored) return null;
  return { games, scored };
}

function firstInningSeasonLine(split) {
  const name = label(split?.name);
  const innings = typeof split?.ip === 'number' || typeof split?.ip === 'string' ? String(split.ip) : '';
  const ip = innings.match(/^(\d+)(?:\.([012]))?$/);
  if (!name || !ip || Number(ip[1]) * 3 + Number(ip[2] || 0) <= 0) return null;
  const era = measurement(split.era), avg = measurement(split.avg), hr = observedCount(split.hr);
  const values = [era !== null ? `${era.toFixed(2)} ERA` : null,
    avg !== null && avg <= 1 ? `${avg.toFixed(3).replace(/^0/, '')} opponent AVG` : null].filter(Boolean);
  if (!values.length) return null;
  return `${name}: ${values.join(', ')} across ${innings} IP${hr === null ? '' : `, ${hr} HR`}`;
}

/** Existing nrfi metadata supplies binary observations. A sequence and its
 * counts must agree before either can be displayed. Historical named pitcher
 * splits are season samples, never a claim that someone is confirmed to start.
 */
export function firstInningResearchDetail(meta, { season = meta?.season } = {}) {
  if (meta?.kind !== 'nrfi') return null;
  let context;
  if (['TEAM_HOT', 'TEAM_QUIET'].includes(meta.side)) {
    const team = label(meta.team_abbr), sample = sampledCount(meta.team_seq, meta.team_scored, meta.team_n);
    if (!team || !sample) return null;
    context = `${team} scored in the first inning in ${sample.scored} of the ${sample.games} sampled games.`;
  } else if (['NRFI', 'YRFI'].includes(meta.side)) {
    const home = label(meta.home_abbr), away = label(meta.away_abbr);
    const h = sampledCount(meta.home_seq, meta.home_any, meta.home_n), a = sampledCount(meta.away_seq, meta.away_any, meta.away_n);
    if (!home || !away || home === away || !h || !a) return null;
    context = `A run was scored by either team in the first inning in ${h.scored} of ${h.games} sampled ${home} games and ${a.scored} of ${a.games} sampled ${away} games.`;
  } else return null;
  const year = seasonYear(season);
  const splits = Array.isArray(meta.sp_first_inning) ? meta.sp_first_inning : [];
  const names = splits.map(split => label(split?.name));
  if (year === null || splits.length > 2 || new Set(names).size !== names.length) return context;
  const lines = splits.map(firstInningSeasonLine).filter(Boolean);
  return lines.length ? `${context} ${year} first-inning pitching samples — ${lines.join('; ')}.` : context;
}

/** One-run records require structured counts from completed season games.
 * Optional other-game records can add a comparison; absent fields stay absent.
 */
export function oneRunResearchDetail(meta) {
  if (meta?.kind !== 'one_run_record') return null;
  const team = label(meta.team_name), season = seasonYear(meta.season);
  const w = observedCount(meta.one_run_wins), l = observedCount(meta.one_run_losses);
  if (!team || season === null || w === null || l === null || w + l === 0) return null;
  const ow = observedCount(meta.other_wins), ol = observedCount(meta.other_losses);
  const first = `${team} are ${w}-${l} in one-run games in the ${season} regular season (${w + l} completed games).`;
  return ow !== null && ol !== null && ow + ol > 0
    ? `${first} They are ${ow}-${ol} in their other ${ow + ol} completed games.` : first;
}
