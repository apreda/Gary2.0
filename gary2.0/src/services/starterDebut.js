/**
 * Debut-starter context (founder GO, Aug 17 2026 — the Kent Emanuel blank
 * plate): a probable with zero MLB data renders an HONEST empty state plus his
 * labeled minor-league season line when MLB StatsAPI has one.
 *
 * Never fake zeros — a 0.00 ERA is a real stat and absence must read as
 * absence. The MiLB line is real data from a source we already use
 * (statsapi.mlb.com serves minor-league seasons via sportId), labeled by the
 * level it came from so it can never pass as an MLB number.
 */

const MILB_LEVELS = ['AAA', 'AA'];

/**
 * An MLB probable whose official MLB log is CONFIRMED empty — nothing the
 * starter plate could truthfully show. Mere absence of data is NOT enough:
 * a resolver or lookup failure must never masquerade as "No MLB starts", so
 * the flag requires the positive `mlb_log_confirmed_empty` stamp that only
 * the person_id-exact official-log read sets (finding-5 guard, Aug 18 2026).
 * @param {{ league?: string, era?: number|null, last_outing?: object|null, l3?: object|null, mlb_log_confirmed_empty?: boolean } | null | undefined} st
 */
export function isDebutStarter(st) {
  if (!st || st.league !== 'MLB') return false;
  if (st.mlb_log_confirmed_empty !== true) return false;
  return st.era == null && st.last_outing == null && st.l3 == null;
}

/**
 * Parse one StatsAPI season-pitching reply into a labeled line, or null when
 * the level has nothing — never an invented line.
 * @param {any} reply  raw /people/{id}/stats JSON
 * @param {string} level  'AAA' | 'AA' — the level that was queried
 */
export function milbLineFromStatsReply(reply, level) {
  const stat = reply?.stats?.[0]?.splits?.[0]?.stat;
  const era = Number.parseFloat(stat?.era);
  const ip = String(stat?.inningsPitched ?? '').trim();
  if (!Number.isFinite(era) || !ip) return null;
  const k = Number(stat?.strikeOuts);
  return { level, era, ip, ...(Number.isFinite(k) ? { k } : {}) };
}

/**
 * Flag every debut starter IN PLACE and attach the first minor-league level
 * with a real season line. Honest-empty on any fetch failure — the flag
 * stands alone rather than blocking the board.
 * @param {Array<object>} starters
 * @param {{ fetchLevel: (personId: number, level: string) => Promise<object|null> }} deps
 */
export async function attachDebutContext(starters, { fetchLevel }) {
  for (const st of Array.isArray(starters) ? starters : []) {
    if (!isDebutStarter(st)) continue;
    st.no_mlb_starts = true;
    if (st.person_id == null) continue;
    for (const level of MILB_LEVELS) {
      try {
        const line = await fetchLevel(st.person_id, level);
        if (line) { st.milb = line; break; }
      } catch (e) {
        console.warn(`[TomorrowBoard] MiLB ${level} line failed for ${st.full_name || st.name}: ${e.message}`);
        break;
      }
    }
  }
}
