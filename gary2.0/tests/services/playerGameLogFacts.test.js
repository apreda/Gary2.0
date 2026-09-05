import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ get }), get } }));
import { ballDontLieService, summarizeNflPlayerGameLogs } from '../../src/services/ballDontLieService.js';
import { summarizeNbaPlayerGameLogs } from '../../src/services/playerGameLogFacts.js';
import { nbaSeason } from '../../src/utils/dateUtils.js';

const asOf = new Date('2026-09-05T16:00:00Z');
const nbaRow = (id, date, fields = {}) => ({
  player: { id: 7 }, team: { id: '2' }, min: '32:30',
  game: { id, date, season: 2025, status: 'Final', home_team_id: 2, visitor_team_id: 3 },
  pts: 20, reb: 8, ast: 4, stl: 0, blk: 1, fg3m: 0, ...fields,
});
const summarize = (rows, options = {}) => summarizeNbaPlayerGameLogs(rows, { playerId: 7, season: 2025, asOf, ...options });
beforeEach(() => { get.mockReset(); ballDontLieService.clearCache(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('NBA player game evidence', () => {
  it('retains flat team identity, numeric zero, and a real sub-minute appearance', () => {
    const result = summarize([nbaRow(1, '2026-06-01', { min: '0:48', pts: '0', reb: '0', ast: '0' })]);
    expect(result.games[0]).toMatchObject({ gameId: 1, season: 2025, teamId: '2', isHome: true, opponentId: 3, pts: 0, pra: 0, min: 0.8 });
    expect(result.splits.home).toMatchObject({ games: 1, pts: '0.0' });
    expect(result.splits.away).toBeNull();
  });

  it('does not turn unknown stats into points, hit-rate losses, or an away game', () => {
    const result = summarize([
      nbaRow(1, '2026-06-01', { pts: null, reb: '', ast: false, team: null }),
      nbaRow(2, '2026-06-03', { pts: '25' }),
    ], { propLines: { points: 24.5 } });
    expect(result.games[1]).toMatchObject({ pts: null, reb: null, ast: null, pra: null, isHome: null, opponentId: null });
    expect(result.averages.pts).toBeNull();
    expect(result.stdDevs.pts).toBeNull();
    expect(result.consistency.pts).toBeNull();
    expect(result.hitRates.points).toEqual({ line: 24.5, hits: 1, total: 1, unknown: 1, rate: '100%' });
    expect(result.splits.home.games).toBe(1);
    expect(result.splits.away).toBeNull();
  });

  it('removes wrong-player, wrong-season, unfinished, future and ambiguous duplicate rows before selecting recent games', () => {
    const valid = nbaRow(1, '2026-06-01');
    const result = summarize([
      valid, { ...valid }, nbaRow(2, '2026-06-02', { player: { id: 8 } }),
      nbaRow(3, '2026-06-03', { game: { ...valid.game, id: 3, season: 2024 } }),
      nbaRow(4, '2026-06-04', { game: { ...valid.game, id: 4, status: 'Not Final' } }),
      nbaRow(5, '2026-09-06'), nbaRow(6, '2026-06-06'), nbaRow(6, '2026-06-06', { pts: 99 }),
      nbaRow(7, '2026-06-07', { min: '0:00' }),
    ], { numGames: 1 });
    expect(result.games.map(row => row.gameId)).toEqual([1]);
    expect(result.diagnostics).toEqual({ ineligible: 5, duplicates: 1, conflicts: 1 });
  });

  it('respects the provider season for the delayed 2020 finals', () => {
    const row = nbaRow(1, '2020-10-11', { game: { ...nbaRow(1).game, date: '2020-10-11', season: 2019 } });
    expect(summarize([row], { season: 2019 }).gamesAnalyzed).toBe(1);
  });

  it('paginates a requested season and recomputes line-specific results from cached rows', async () => {
    const old = nbaRow(1, '2026-03-01', { pts: 10 });
    const recent = nbaRow(2, '2026-06-01', { pts: 30 });
    get.mockResolvedValueOnce({ data: { data: [old], meta: { next_cursor: 99 } } })
      .mockResolvedValueOnce({ data: { data: [recent], meta: { next_cursor: null } } });
    const first = await ballDontLieService.getNbaPlayerGameLogs(7, 1, { points: 20 }, { season: 2025, asOf });
    expect(first.games.map(row => row.gameId)).toEqual([2]);
    expect(first.hitRates.points.hits).toBe(1);
    expect(get.mock.calls[0][0]).toContain('seasons[]=2025');
    expect(get.mock.calls[0][0]).not.toContain('start_date');
    expect(get.mock.calls[1][0]).toContain('cursor=99');
    const second = await ballDontLieService.getNbaPlayerGameLogs(7, 2, { points: 35 }, { season: 2025, asOf });
    expect(second.hitRates.points).toMatchObject({ hits: 0, total: 2, line: 35 });
    expect(get).toHaveBeenCalledTimes(2);
    get.mockResolvedValueOnce({ data: { data: [], meta: { next_cursor: null } } });
    expect(await ballDontLieService.getNbaPlayerGameLogs(7, 1, {}, { season: 2024, asOf })).toBeNull();
    expect(get.mock.calls[2][0]).toContain('seasons[]=2024');
  });

  it('does not cache repeated-cursor or malformed responses as partial or empty evidence', async () => {
    get.mockResolvedValue({ data: { data: [nbaRow(1, '2026-06-01')], meta: { next_cursor: 4 } } });
    expect(await ballDontLieService.getNbaPlayerGameLogs(7, 2, {}, { season: 2025, asOf })).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
    get.mockResolvedValueOnce({ data: { error: 'unavailable' } });
    expect(await ballDontLieService.getNbaPlayerGameLogs(7, 2, {}, { season: 2025, asOf })).toBeNull();
    get.mockResolvedValueOnce({ data: { data: [nbaRow(2, '2026-06-02')] } });
    expect((await ballDontLieService.getNbaPlayerGameLogs(7, 2, {}, { season: 2025, asOf })).games[0].gameId).toBe(2);
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('surfaces NBA access errors to research without retrying or caching them as an empty season', async () => {
    const error = Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } });
    get.mockRejectedValueOnce(error);
    await expect(ballDontLieService.getNbaPlayerGameLogs(7, 2, {}, { season: 2025, asOf, throwOnError: true })).rejects.toBe(error);
    expect(get).toHaveBeenCalledOnce();
    get.mockResolvedValueOnce({ data: { data: [nbaRow(1, '2026-06-01')] } });
    expect((await ballDontLieService.getNbaPlayerGameLogs(7, 2, {}, { season: 2025, asOf, throwOnError: true })).gamesAnalyzed).toBe(1);
  });

  it('applies each cutoff even when requests reuse the same day of cached rows', async () => {
    get.mockResolvedValue({ data: { data: [nbaRow(1, '2026-06-01T15:00:00Z'), nbaRow(2, '2026-06-01T22:00:00Z')] } });
    const late = await ballDontLieService.getNbaPlayerGameLogs(7, 1, {}, { season: 2025, asOf: '2026-06-01T23:00:00Z' });
    const early = await ballDontLieService.getNbaPlayerGameLogs(7, 1, {}, { season: 2025, asOf: '2026-06-01T20:00:00Z' });
    expect(late.games[0].gameId).toBe(2); expect(early.games[0].gameId).toBe(1);
    expect(get).toHaveBeenCalledOnce();
  });

  it('resolves the NBA season at Eastern midnight and for historical dates', () => {
    expect(nbaSeason(new Date('2026-10-01T03:59:00Z'))).toBe(2025);
    expect(nbaSeason(new Date('2026-10-01T04:00:00Z'))).toBe(2026);
    expect(nbaSeason(new Date('2025-01-01T15:00:00Z'))).toBe(2024);
  });
});

describe('NFL measured versus missing player stats', () => {
  const nflRow = (date, stats) => ({ player: { id: 1 }, team: { id: '11' },
    game: { id: date, date, status: 'Final', home_team: { id: 11 }, visitor_team: { id: 22, abbreviation: 'AWY' } }, ...stats });

  it('preserves unknown fields and numeric strings without fabricating trends or perfect consistency', () => {
    const result = summarizeNflPlayerGameLogs([
      nflRow('2026-09-01', { passing_yards: '0', rushing_yards: null, receptions: 0, receiving_targets: 3 }),
      nflRow('2026-09-02', { passing_yards: '200', rushing_yards: 50, receptions: '0', receiving_targets: null }),
    ]);
    expect(result.averages.pass_yds).toBe('100.0');
    expect(result.averages.receptions).toBe('0.0');
    expect(result.averages.rush_yds).toBeNull();
    expect(result.games[1].rush_yds).toBeNull();
    expect(result.consistency.rush_yds).toBeNull();
    expect(result.targetTrend).toBeNull(); expect(result.usageTrend).toBeNull();
    expect(result.splits.home).toMatchObject({ games: 2, rush_yds: 'N/A' });
    expect(result.games[0]).toMatchObject({ isHome: true, opponent: 'AWY', opponentId: 22 });
  });

  it('leaves unverified venues unknown and excludes unfinished or invalid-date games', () => {
    const unknown = nflRow('2026-09-01', { team: null, passing_yards: 0 });
    const result = summarizeNflPlayerGameLogs([unknown,
      { ...unknown, game: { date: '2026-09-02', status: 'Not Final' } },
      { ...unknown, game: { date: 'invalid', status: 'Final' } },
    ]);
    expect(result.gamesAnalyzed).toBe(1);
    expect(result.games[0]).toMatchObject({ isHome: null, opponent: null });
    expect(result.splits.home.games + result.splits.away.games).toBe(0);
  });
});
