import { describe, expect, it, vi } from 'vitest';
import { loadMlbRecentBoxScores } from '../../src/services/mlbRecentBoxScores.js';

const mlb = (gamePk, home, away, gameDate = '2026-09-15T23:45:00Z') => ({
  gamePk, gameDate, officialDate: '2026-09-15',
  teams: { home: { team: { name: home } }, away: { team: { name: away } } },
});
const bdl = (id, home, away, date = '2026-09-15T23:45:00Z') => ({
  id, date, home_team: { display_name: home }, away_team: { display_name: away },
});
const row = (game_id, teamId, playerId) => ({ game_id, team: { id: teamId }, player: { id: playerId } });
const service = (games, stats) => ({ getGames: vi.fn(async () => games), getMlbGameStats: vi.fn(async () => stats) });

describe('MLB recent box-score transport', () => {
  it('requests supported UTC date buckets and keeps different games on the same day separate', async () => {
    const clubs = [
      { teamId: 26, games: [mlb(101, 'St. Louis Cardinals', 'Chicago White Sox')] },
      { teamId: 24, games: [mlb(102, 'San Francisco Giants', 'San Diego Padres', '2026-09-16T02:15:00Z')] },
    ];
    const s = service([
      bdl(501, 'St. Louis Cardinals', 'Chicago White Sox'),
      bdl(502, 'San Francisco Giants', 'San Diego Padres', '2026-09-16T02:15:00Z'),
    ], [row(501, 26, 1), row(502, 24, 2)]);
    const result = await loadMlbRecentBoxScores(clubs, s);
    expect(s.getGames).toHaveBeenCalledWith('baseball_mlb', {
      dates: ['2026-09-15', '2026-09-16'], team_ids: [26, 24], per_page: 100, paginateAll: true,
    });
    expect(result.byGame.get('101')).toEqual([row(501, 26, 1)]);
    expect(result.byGame.get('102')).toEqual([row(502, 24, 2)]);
  });
  it('distinguishes both games of a doubleheader and never combines their players', async () => {
    const early = '2026-09-15T17:00:00Z', late = '2026-09-15T23:00:00Z';
    const clubs = [{ teamId: 26, games: [mlb(1, 'Cardinals', 'Giants', early), mlb(2, 'Cardinals', 'Giants', late)] }];
    const s = service([bdl(51, 'Cardinals', 'Giants', late), bdl(52, 'Cardinals', 'Giants', early)],
      [row(51, 26, 5), row(52, 26, 6)]);
    const result = await loadMlbRecentBoxScores(clubs, s);
    expect(result.byGame.get('1')[0].player.id).toBe(6);
    expect(result.byGame.get('2')[0].player.id).toBe(5);
  });
  it.each(['outdated games', 'ambiguous game', 'missing club', 'provider error'])('fails visibly on %s', async kind => {
    const g = bdl(51, 'Cardinals', 'Giants');
    const s = service([g], [row(51, 26, 5)]);
    if (kind === 'outdated games') s.getGames.mockResolvedValue([{ ...g, date: '2000-03-03T18:05:00Z' }]);
    if (kind === 'ambiguous game') s.getGames.mockResolvedValue([g, { ...g, id: 52 }]);
    if (kind === 'missing club') s.getMlbGameStats.mockResolvedValue([row(51, 24, 7)]);
    if (kind === 'provider error') s.getMlbGameStats.mockRejectedValue(new Error('HTTP 503'));
    await expect(loadMlbRecentBoxScores([{ teamId: 26, games: [mlb(1, 'Cardinals', 'Giants')] }], s))
      .rejects.toMatchObject({ code: 'required_data_unavailable', retryModel: false });
  });
});
