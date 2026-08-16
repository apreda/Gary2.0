/**
 * Stats-substance gate.
 *
 * The Tale of the Tape is structurally never empty — missing stats render as the
 * literal string "N/A", so a game with no real data still produces a full 15-row
 * tape. That made it impossible to detect a no-stats pick, which let World Cup
 * picks ship on zero real data with a hallucinated rationale.
 *
 * `countRealStats` counts the rows that carry at least one real (non-"N/A") value.
 * Zero means the stats pipeline returned nothing for this game — Gary cannot have
 * analyzed it, so the pick is ungrounded and must be hard-failed before storage.
 */
// Metadata tokens that are ALWAYS populated (futures-implied strength + group
// standings), NOT match performance. Counting them as "real" let a WC pick with
// zero performance data pass the no-stats gate on the market's own pricing
// (circular). Excluded everywhere — other sports carry plenty of real performance
// rows, so this never drops them toward the === 0 gate.
const META_TOKENS = new Set(['GROUP_POS', 'ADVANCE', 'TITLE_ODDS', 'POINTS', 'RECORD']);

function isRealStatValue(value) {
  return value != null && String(value).trim() !== '' && String(value).trim().toUpperCase() !== 'N/A';
}

export function countRealStats(statsData, tokenToIosKey = {}) {
  if (!Array.isArray(statsData)) return 0;
  return statsData.filter((s) => {
    if (META_TOKENS.has(String(s.token || '').toUpperCase())) return false;
    const key = (tokenToIosKey && tokenToIosKey[s.token]) || String(s.token || '').toLowerCase();
    return isRealStatValue(s.home?.[key]) || isRealStatValue(s.away?.[key]);
  }).length;
}

/**
 * Count substantive rows in the raw verified Tale of the Tape shape stored in
 * the scout cache. This is intentionally separate from `countRealStats`, whose
 * input is the iOS-shaped payload produced later by run-agentic-picks.
 */
export function countRealVerifiedTaleRows(verifiedTaleOfTape) {
  const rows = verifiedTaleOfTape?.rows;
  if (!Array.isArray(rows)) return 0;

  return rows.filter((row) => {
    const token = String(row?.token || '').toUpperCase();
    if (META_TOKENS.has(token) || token === 'KEY_INJURIES') return false;
    const homeValue = row?.home && typeof row.home === 'object' && 'value' in row.home
      ? row.home.value
      : row?.home;
    const awayValue = row?.away && typeof row.away === 'object' && 'value' in row.away
      ? row.away.value
      : row?.away;
    return isRealStatValue(homeValue) || isRealStatValue(awayValue);
  }).length;
}

function hasPlayedGameEvidence(verifiedTaleOfTape) {
  const rows = verifiedTaleOfTape?.rows;
  if (!Array.isArray(rows)) return false;

  return rows.some((row) => {
    const token = String(row?.token || '').toUpperCase();
    if (META_TOKENS.has(token) || token === 'KEY_INJURIES') return false;
    return ['home', 'away'].some((side) => {
      const raw = row?.[side] && typeof row[side] === 'object' && 'value' in row[side]
        ? row[side].value
        : row?.[side];
      if (!isRealStatValue(raw)) return false;
      const numeric = Number(raw);
      // NCAAF's opener placeholder is numeric and all-zero. Keep a legitimate
      // zero only when another performance value (or a played-game form such
      // as `1-0`) proves this is not that placeholder.
      return Number.isFinite(numeric) ? numeric > 0 : true;
    });
  });
}

/**
 * An all-N/A football scout must be rebuilt rather than reused for three
 * hours. This matters at both the NFL preseason and the NCAAF season opener,
 * where a transient failure of the labeled prior-season baseline would
 * otherwise poison every later scheduler tier.
 */
export function shouldReuseScoutReport(scoutReport, sport) {
  const normalized = String(sport || '').toUpperCase();
  const isNfl = normalized === 'NFL' || normalized === 'AMERICANFOOTBALL_NFL';
  const isNcaaf = normalized === 'NCAAF' || normalized === 'AMERICANFOOTBALL_NCAAF';
  if (!isNfl && !isNcaaf) return true;
  if (countRealVerifiedTaleRows(scoutReport?.verifiedTaleOfTape) === 0) return false;
  return !isNcaaf || hasPlayedGameEvidence(scoutReport?.verifiedTaleOfTape);
}

export default { countRealStats, countRealVerifiedTaleRows, shouldReuseScoutReport };
