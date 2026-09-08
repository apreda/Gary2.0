import { loadFootballSlate } from '../../src/services/insights/footballData.js';

const exactTimestamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));

/** Strict schedule read: a failed provider is not a successful empty slate.
 * The generic adapter follows cursors and propagates transport failures. */
export async function loadHubJudgmentSlate({ bdl, date, league, signal }) {
  const key = String(league).toLowerCase();
  signal?.throwIfAborted();
  if (key === 'nfl' || key === 'ncaaf') {
    return loadFootballSlate({ bdl: { ...bdl,
      getGames: (sport, params) => bdl.getGames(sport, params, 0, { signal }),
    }, league: key, date });
  }
  const sport = { mlb: 'baseball_mlb', nba: 'basketball_nba' }[key];
  if (!sport || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Unsupported Hub slate');
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const games = await bdl.getGames(sport, {
    dates: [date, next.toISOString().slice(0, 10)], per_page: 100,
    paginateAll: true, paginationMaxPages: 5,
  }, 0, { signal });
  if (!Array.isArray(games)) throw new Error('Malformed Hub schedule');
  const result = new Map();
  for (const game of games) {
    const start = [game?.datetime, game?.date].find(exactTimestamp);
    if (!game?.id || !start) throw new Error('Hub schedule lacks an exact game time or ID');
    if (new Date(start).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) !== date) continue;
    const id = String(game.id);
    if (result.has(id) && JSON.stringify(result.get(id)) !== JSON.stringify(game)) throw new Error('Conflicting duplicate Hub game ID');
    result.set(id, game);
  }
  return [...result.values()];
}
