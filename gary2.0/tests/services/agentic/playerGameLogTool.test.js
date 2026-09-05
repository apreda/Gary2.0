import { describe, expect, it, vi } from 'vitest';
import { fetchPlayerGameLogEvidence } from '../../../src/services/agentic/tools/playerGameLogTool.js';

const player = { id: 7, first_name: 'Arch', last_name: 'Manning', team: { id: 9, full_name: 'Texas Longhorns' } };
const collegeRow = (id, date, fields = {}) => ({
  player, team: player.team, season: 2026, game: { id, date, season: 2026 }, passing_yards: 250, ...fields,
});
const setup = (overrides = {}) => ({
  getPlayersGeneric: vi.fn().mockResolvedValue([player]),
  getNcaafPlayerGameStats: vi.fn().mockResolvedValue([]),
  getNflPlayerGameLogsBatch: vi.fn().mockResolvedValue({}),
  getMlbPlayerGameRowsChrono: vi.fn().mockResolvedValue([]),
  getNbaPlayerGameLogs: vi.fn().mockResolvedValue(null), ...overrides,
});
const args = { sport: 'americanfootball_ncaaf', player: 'Arch Manning', homeTeam: 'Texas Longhorns', awayTeam: 'Ohio State Buckeyes', asOf: new Date('2026-09-05T13:30:00Z') };

describe('shared league-bound player game logs', () => {
  it('fetches real college rows, rejecting relabeled, future, live, duplicate and wrong-player evidence', async () => {
    const valid = collegeRow(1, '2026-08-29T18:00:00Z', { passing_touchdowns: 0 });
    const service = setup({ getNcaafPlayerGameStats: vi.fn().mockResolvedValue([
      valid, { ...valid }, collegeRow(2, '2025-09-01'), collegeRow(3, '2026-09-06'),
      collegeRow(4, '2026-09-04', { player: { id: 8 } }),
      collegeRow(5, '2026-09-05T12:00:00Z', { game: { id: 5, date: '2026-09-05T12:00:00Z', season: 2026, status: 'in progress' } }),
    ]) });
    const result = await fetchPlayerGameLogEvidence({ ...args, service });
    expect(service.getPlayersGeneric).toHaveBeenCalledWith('americanfootball_ncaaf', expect.any(Object));
    expect(service.getNcaafPlayerGameStats).toHaveBeenCalledWith({ playerId: 7, season: 2026 });
    expect(service.getNflPlayerGameLogsBatch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sport: 'NCAAF', quality: 'available', games_used: 1, games: [valid] });
    expect(JSON.parse(result.content).games[0].passing_touchdowns).toBe(0);
  });

  it('keeps NFL football fields and the requested baseline season without inventing basketball averages', async () => {
    const service = setup({ getNflPlayerGameLogsBatch: vi.fn().mockResolvedValue({ 7: { games: [{ gameId: 1, date: '2025-12-01', pass_yds: 301, rush_yds: 0 }] } }) });
    const result = await fetchPlayerGameLogEvidence({ ...args, service, sport: 'NFL', season: 2025, dataWindow: '2025 completed regular season', numGames: 99 });
    expect(service.getNflPlayerGameLogsBatch).toHaveBeenCalledWith([7], 2025, 15);
    expect(result).toMatchObject({ games_requested: 15, games_used: 1, data_window: '2025 completed regular season' });
    expect(result.content).toContain('"pass_yds":301');
    expect(result.content).not.toContain('PTS');
  });

  it('never substitutes a different first name from a last-name search', async () => {
    const service = setup({ getPlayersGeneric: vi.fn().mockResolvedValue([{ ...player, first_name: 'Peyton' }]) });
    const result = await fetchPlayerGameLogEvidence({ ...args, service });
    expect(result).toMatchObject({ quality: 'unavailable', games_used: 0 });
    expect(service.getNcaafPlayerGameStats).not.toHaveBeenCalled();
  });

  it('does not resolve duplicate names using shared city prefixes', async () => {
    const service = setup({ getPlayersGeneric: vi.fn().mockResolvedValue([
      { ...player, team: { full_name: 'New York Giants' } },
      { ...player, id: 8, team: { full_name: 'New Orleans Saints' } },
    ]) });
    const result = await fetchPlayerGameLogEvidence({ ...args, sport: 'NFL', homeTeam: 'New York Jets', awayTeam: 'Buffalo Bills', service });
    expect(result.error).toContain('Ambiguous');
    expect(service.getNflPlayerGameLogsBatch).not.toHaveBeenCalled();
  });

  it('keeps MLB relief and walk-only appearances, selecting the requested number of distinct games chronologically', async () => {
    const service = setup({ getMlbPlayerGameRowsChrono: vi.fn().mockResolvedValue([
      { _game: { id: 1, date: '2026-09-01' }, ip: '0.2', er: 0, games_started: 0 },
      { _game: { id: 3, date: '2026-09-03' }, at_bats: 0, bb: 2 },
      { _game: { id: 3, date: '2026-09-03' }, ip: '1.0', er: 0, games_started: 0 },
      { _game: { id: 2, date: '2026-09-02' }, ip: '0.1', er: null, games_started: 0 },
    ]) });
    const result = await fetchPlayerGameLogEvidence({ ...args, sport: 'MLB', service, numGames: 2 });
    expect(result.games_used).toBe(2);
    expect(result.games.map(row => row._game.id)).toEqual([3, 3, 2]);
    expect(result.games[2].er).toBeNull();
    expect(result.content).not.toContain('No 2026 starts');
  });

  it('retains NBA dates and zero values and marks empty evidence unavailable', async () => {
    const service = setup({ getNbaPlayerGameLogs: vi.fn().mockResolvedValueOnce({ games: [{ date: '2026-09-01', pts: 0, reb: 3, ast: 1 }] }) });
    const result = await fetchPlayerGameLogEvidence({ ...args, sport: 'NBA', service });
    expect(result.games).toEqual([{ date: '2026-09-01', pts: 0, reb: 3, ast: 1 }]);
    expect((await fetchPlayerGameLogEvidence({ ...args, sport: 'NBA', service })).quality).toBe('unavailable');
  });

  it('keeps each provider call inside the research cancellation wrapper', async () => {
    const service = setup();
    const request = vi.fn(operation => operation());
    await fetchPlayerGameLogEvidence({ ...args, service, request });
    expect(request).toHaveBeenCalledTimes(2);
    const cancelled = vi.fn().mockRejectedValue(new Error('Research budget expired'));
    await expect(fetchPlayerGameLogEvidence({ ...args, service, request: cancelled })).rejects.toThrow('Research budget expired');
  });
});
