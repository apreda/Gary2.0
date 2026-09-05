// These college lanes resume from a per-game ledger. A successful partial
// pass replaces only games it actually rebuilt, never the whole day's lane.
export function insightRefreshOldIds({ league, category, existing = [], fresh = [] }) {
  const incremental = String(league).toUpperCase() === 'NCAAF'
    && ['quarterback', 'injury'].includes(category);
  const freshGames = new Set(fresh.map(row => row.game_id).filter(id => id != null && String(id) !== '').map(String));
  return existing.filter(row => !incremental || (row.game_id != null && freshGames.has(String(row.game_id))))
    .map(row => row.id).filter(id => id != null);
}
