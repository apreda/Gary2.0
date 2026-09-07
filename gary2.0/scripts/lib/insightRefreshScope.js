// These college lanes resume from a per-game ledger. A successful partial
// pass replaces only games it actually rebuilt, never the whole day's lane.
export function insightRefreshOldIds({ league, category, existing = [], fresh = [] }) {
  const incremental = String(league).toUpperCase() === 'NCAAF'
    && ['quarterback', 'injury'].includes(category);
  const freshGames = new Set(fresh.map(row => row.game_id).filter(id => id != null && String(id) !== '').map(String));
  return existing.filter(row => !incremental || (row.game_id != null && freshGames.has(String(row.game_id))))
    .map(row => row.id).filter(id => id != null);
}

/** General insight resets cannot rebuild the independent Fantasy writer's
 * projection. Preserve either provenance marker; explicit NULL branches keep
 * the reset's existing behavior for older rows without those fields. */
export function insightResetScopeParams({ date, league }) {
  return {
    date: `eq.${date}`,
    league: `eq.${league}`,
    and: '(or(generated_by.is.null,generated_by.neq.fantasy_briefing_v1),or(meta->>source.is.null,meta->>source.neq.fantasy_briefing_v1))',
  };
}
