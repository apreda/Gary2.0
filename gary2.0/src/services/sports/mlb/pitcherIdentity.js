/**
 * Pitcher identity disambiguation (leakage-audit finding 5, founder GO Aug 18
 * 2026). When several BDL players share an exact full name and the team id
 * could not break the tie (missing, or stale after a trade), the resolver
 * used to guess the first hit — the two-Will-Smiths class of leak.
 *
 * We are always resolving a PITCHER here, so position is a real
 * discriminator: exactly one pitcher among the hits is a safe answer.
 * Anything else returns null — same doctrine as the player-by-name resolver
 * in ballDontLieService ("none or ambiguous — never guess").
 */

const PITCHER_POSITIONS = new Set(['P', 'SP', 'RP', 'TWP']);

/**
 * @param {Array<{ id?: number, position?: string|null }> | null | undefined} hits
 *   same-full-name BDL player hits
 * @returns {number|null} the lone pitcher's id, or null when the tie survives
 */
export function disambiguatePitcherHits(hits) {
  const arms = (Array.isArray(hits) ? hits : []).filter((p) =>
    PITCHER_POSITIONS.has(String(p?.position ?? '').trim().toUpperCase()));
  return arms.length === 1 ? (arms[0].id ?? null) : null;
}
