/**
 * DFS Position Utilities
 *
 * Shared position eligibility logic used by multiple DFS phases
 * (Lineup Decider, Audit, etc.)
 */

/**
 * Check if a player is eligible for a given DK/FD roster slot.
 *
 * NBA: PG, SG, SF, PF, C, G (PG/SG), F (SF/PF), UTIL (any)
 * NFL: QB, RB, WR, TE, FLEX (RB/WR/TE), DST/DEF
 */
export function isSlotEligible(slot, playerPositions, sport) {
  if (!slot || !playerPositions || playerPositions.length === 0) return false;
  const s = slot.toUpperCase();
  const poss = playerPositions.map(p => p.toUpperCase());
  const sportUpper = (sport || 'NBA').toUpperCase();

  if (sportUpper === 'NFL') {
    if (s === 'FLEX') return poss.some(p => p === 'RB' || p === 'WR' || p === 'TE');
    if (s === 'DST' || s === 'DEF') return poss.some(p => p === 'DST' || p === 'DEF');
    return poss.includes(s);
  }

  // NBA
  if (s === 'UTIL') return true;
  if (s === 'G') return poss.some(p => p === 'PG' || p === 'SG');
  if (s === 'F') return poss.some(p => p === 'SF' || p === 'PF');
  return poss.includes(s);
}
