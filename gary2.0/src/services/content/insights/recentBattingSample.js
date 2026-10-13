export const RECENT_BATTING_SAMPLE_VERSION = 'recent-batting-sample-v1';

function observedCount(value) {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string')
      || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/** PA and AB are distinct observations. A missing PA permits an AB sample,
 * while a reported zero/short PA sample cannot be promoted by the fallback. */
export function recentBattingSample(split, { minPA = 25, minAB = 22 } = {}) {
  const pa = observedCount(split?.plate_appearances);
  const ab = observedCount(split?.at_bats);
  if (pa !== null) {
    if (pa < minPA || (ab !== null && ab > pa)) return null;
    return { count: pa, unit: 'PA', field: 'plate_appearances' };
  }
  return ab !== null && ab >= minAB ? { count: ab, unit: 'AB', field: 'at_bats' } : null;
}

export function recentBattingSampleMeta(sample, window) {
  return { recent_sample_version: RECENT_BATTING_SAMPLE_VERSION,
    recent_sample: { ...sample, window, source: 'balldontlie_mlb_player_splits' } };
}
