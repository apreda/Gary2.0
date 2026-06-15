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
export function countRealStats(statsData, tokenToIosKey = {}) {
  if (!Array.isArray(statsData)) return 0;
  const isReal = (v) => v != null && String(v).trim() !== '' && String(v).trim().toUpperCase() !== 'N/A';
  return statsData.filter((s) => {
    const key = (tokenToIosKey && tokenToIosKey[s.token]) || String(s.token || '').toLowerCase();
    return isReal(s.home?.[key]) || isReal(s.away?.[key]);
  }).length;
}

export default { countRealStats };
