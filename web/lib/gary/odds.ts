/** Pure odds parser shared by server records and browser ticket cards. */
const ODDS_TAIL = /[+-]\d{3,}\s*$/;

/**
 * Port of iOS GameResult.effectiveOdds (Models.swift:1154).
 * game_results/nfl_results have NO odds column — the line lives at the tail
 * of pick_text ("Knicks ML +154"). Prefer an explicit odds value if present.
 */
export function effectiveOdds(pickText: string | null | undefined, odds?: string | null): string | null {
  if (odds && odds.trim().length > 0) return odds.trim();
  if (!pickText) return null;
  const m = pickText.match(ODDS_TAIL);
  return m ? m[0].trim() : null;
}
