import { describe, it, expect, vi } from 'vitest';
import { buildMlbBullpen } from '../../src/services/insights/leaguePulse.js';

describe('League Pulse bullpen query window', () => {
  it('fetches only the exact three completed games before the slate and refuses unrelated returned rows', async () => {
    const game = (date, more = {}) => ({ date, status: 'STATUS_FINAL', seasonType: 'regular', homeId: 1, awayId: 2, ...more });
    const index = new Map([
      [1, game('2026-04-01')], [2, game('2026-09-04T20:00:00Z')],
      [3, game('2026-09-05T20:00:00Z')], [4, game('2026-09-06T20:00:00Z')],
      [5, game('2026-09-07T20:00:00Z')], // historical run must not see a later final
      [6, game('2026-09-06T21:00:00Z', { status: 'STATUS_IN_PROGRESS' })],
      [7, game('2026-09-06T21:00:00Z', { homeId: 3, awayId: 4 })],
      [8, game('2026-09-06T21:00:00Z', { seasonType: 'spring_training' })],
    ]);
    const bdl = {
      getMlbSeasonGameIndex: vi.fn().mockResolvedValue(index),
      getMlbGameStats: vi.fn().mockResolvedValue([2, 3, 4, 5, 1].flatMap(game_id => [
        { game_id, team: { id: 1 }, ip: '6.0', games_started: 1 }, { game_id, team: { id: 1 }, ip: '3.0', games_started: 0 },
      ])),
    };
    const pack = await buildMlbBullpen({ date: '2026-09-07', season: 2026, bdl, teamMeta: new Map([['1', { abbr: 'A' }]]) });
    expect(bdl.getMlbGameStats).toHaveBeenCalledExactlyOnceWith({ gameIds: ['4', '3', '2'] });
    expect(pack.rows[0]).toMatchObject({ team: 'A', ip3d: '9.0', gms: '3' });
  });

  it.each(['1.0', '0.0'])('counts a long reliever after a %s-IP start and omits unknown starter flags', async starterIp => {
    const index = new Map([[1, { date: '2026-09-06', status: 'STATUS_FINAL', seasonType: 'regular', homeId: 1, awayId: 2 }]]);
    const bdl = {
      getMlbSeasonGameIndex: vi.fn().mockResolvedValue(index),
      getMlbGameStats: vi.fn().mockResolvedValue([
        { game_id: 1, team: { id: 1 }, ip: starterIp, p_k: 0, games_started: 1 },
        { game_id: 1, team: { id: 1 }, ip: '5.0', games_started: 0 },
        { game_id: 1, team: { id: 1 }, ip: '3.0', games_started: 0 },
        { game_id: 1, team: { id: 2 }, ip: '9.0' },
      ]),
    };
    const pack = await buildMlbBullpen({ date: '2026-09-07', season: 2026, bdl,
      teamMeta: new Map([['1', { abbr: 'A' }], ['2', { abbr: 'B' }]]) });
    expect(pack.rows).toEqual([{ team: 'A', ip3d: '8.0', flag: '', gms: '1' }]);
  });

  it('does not fetch a season of boxes when there are no eligible slate-team games', async () => {
    const bdl = { getMlbSeasonGameIndex: vi.fn().mockResolvedValue(new Map()), getMlbGameStats: vi.fn() };
    expect(await buildMlbBullpen({ date: '2026-09-07', season: 2026, bdl, teamMeta: new Map() })).toBeNull();
    expect(bdl.getMlbGameStats).not.toHaveBeenCalled();
  });
});
