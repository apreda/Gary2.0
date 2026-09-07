import { describe, expect, it, vi } from 'vitest';
import { buildNflNextSlateRow, computeNflNextSlate } from '../../../src/services/insights/computers/nflNextSlate.js';
import { buildNcaafNextSlateRow } from '../../../src/services/insights/computers/ncaafNextSlate.js';

const checkedAt = '2026-09-07T22:00:00Z';
const team = (id, abbreviation, full_name) => ({ id, abbreviation, full_name });
const away = team(1, 'NE', 'New England Patriots');
const home = team(2, 'SEA', 'Seattle Seahawks');
const game = (id, date, overrides = {}) => ({ id, date, home_team: home, visitor_team: away, status: 'Not Started', ...overrides });

describe('next-slate authoritative matchup context', () => {
  it('adds exact teams and clocks from the same single NFL discovery response', async () => {
    const bdl = { getGames: vi.fn().mockResolvedValue([
      game(901, '2026-09-10T00:20:00Z'),
      game(902, '2026-09-13T17:00:00Z'),
    ]) };
    const [row] = await computeNflNextSlate({ league: 'nfl', date: '2026-09-07', games: [], bdl, as_of: checkedAt });
    expect(bdl.getGames).toHaveBeenCalledTimes(1);
    expect(row.meta.next_slate_checked_at).toBe('2026-09-07T22:00:00.000Z');
    expect(row.meta.next_slate_games).toEqual([{
      game_id: '901', away_team_id: '1', home_team_id: '2',
      away_team: 'New England Patriots', home_team: 'Seattle Seahawks',
      away_abbr: 'NE', home_abbr: 'SEA', scheduled_date: '2026-09-09',
      kickoff_status: 'confirmed', commence_time: '2026-09-10T00:20:00.000Z', game_status: 'Not Started',
    }]);
    expect(row.meta.game_count).toBe(row.meta.next_slate_games.length);
  });

  it('keeps every matchup, orders exact clocks first and does not manufacture date-only times', () => {
    const row = buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-13', checkedAt,
      games: [game(904, '2026-09-13'), game(903, '2026-09-14T00:20:00Z'), game(901, '2026-09-13T17:00:00Z'), game(902, '2026-09-13T20:25:00Z')],
    });
    expect(row.meta.next_slate_games.map(x => x.game_id)).toEqual(['901', '902', '903', '904']);
    expect(row.meta.next_slate_games.at(-1)).toMatchObject({ kickoff_status: 'date_only', commence_time: null });
    expect(row.meta).toMatchObject({ game_count: 4, confirmed_count: 3, time_tbd_count: 1 });
    expect(row.meta.next_slate_games).toHaveLength(4);
  });

  it('retains college post-midnight kickoff identity and the provider team labels', () => {
    const row = buildNcaafNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-12', checkedAt,
      games: [game(1001, '2026-09-13T05:30:00Z', {
        away_team: team(3, 'ORST', 'Oregon State Beavers'), visitor_team: undefined,
        home_team: team(4, 'HOU', 'Houston Cougars'),
      })],
    });
    expect(row.meta.next_slate_games[0]).toMatchObject({
      game_id: '1001', away_abbr: 'ORST', home_abbr: 'HOU',
      away_team: 'Oregon State Beavers', home_team: 'Houston Cougars',
      scheduled_date: '2026-09-12', commence_time: '2026-09-13T05:30:00.000Z',
    });
  });

  it('carries interruption status and leaves unavailable names blank instead of guessing them', () => {
    const row = buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-13', checkedAt,
      games: [game(905, '2026-09-13T17:00:00Z', { status: 'Postponed', visitor_team: { id: 1, abbreviation: 'NE' } })],
    });
    expect(row.meta.next_slate_games[0]).toMatchObject({ away_team: null, away_abbr: 'NE', game_status: 'Postponed' });
    expect(row.meta.next_slate_games[0]).not.toHaveProperty('forecast');
  });

  it('rejects mismatched dates, duplicate provider IDs and invalid check times', () => {
    expect(buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-12', checkedAt,
      games: [game(901, '2026-09-13T17:00:00Z')],
    })).toBeNull();
    expect(() => buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-13', checkedAt,
      games: [game(901, '2026-09-13T17:00:00Z'), game(901, '2026-09-13T20:00:00Z')],
    })).toThrow(/unique provider game IDs/);
    expect(() => buildNflNextSlateRow({ date: '2026-09-07', scheduledDate: '2026-09-13', checkedAt: 'not-a-date',
      games: [game(901, '2026-09-13T17:00:00Z')],
    })).toThrow(/valid check timestamp/);
  });
});
