import { describe, expect, it } from 'vitest';
import {
  classifyNcaafFbsGames,
  ncaafSlateDateForInstant,
  ncaafSlateDateForKickoff,
  ncaafTeamConferenceId,
  resolveNcaafKickoff,
} from '../../src/services/ncaafGamePolicy.js';

const team = (id, conference) => ({ id, conference });
const game = (id, home, away, date = '2026-09-05') => ({
  id,
  home_team: home,
  visitor_team: away,
  date,
});

describe('NCAAF provider identity policy', () => {
  it('accepts only games with two provider-verified FBS teams', () => {
    const rows = [
      game(1, team(10, 10), team(20, 4)),
      game(2, team(10, 10), team(30, 20)),
      game(3, { id: 40 }, team(20, 4)),
    ];
    const result = classifyNcaafFbsGames(rows, [
      team(10, 10), team(20, 4), team(30, 20),
    ]);
    expect(result.accepted.map((row) => row.id)).toEqual([1]);
    expect(result.rejected.map((row) => row.id)).toEqual([2]);
    expect(result.unresolved.map((row) => row.id)).toEqual([3]);
  });

  it('prefers exact team-directory identity when game conference ids use another namespace', () => {
    const rows = [
      game(1, team(27, 151), team(23, 151)),
      // 12 is an internal Big Sky id but an ESPN-style CUSA id. Team identity
      // from the provider directory disambiguates it without guessing.
      game(2, team(31, 12), team(32, 12)),
      game(3, team(40, 20), team(41, 20)),
    ];
    const catalog = [
      team(27, 2), team(23, 2),
      team(31, 5), team(32, 5),
      team(40, 20), team(41, 20),
    ];

    const result = classifyNcaafFbsGames(rows, catalog);

    expect(result.accepted.map((row) => row.id)).toEqual([1, 2]);
    expect(result.rejected.map((row) => row.id)).toEqual([3]);
    expect(result.unresolved).toHaveLength(0);
  });

  it('keeps an ambiguous non-FBS-looking game conference unresolved without a team catalog', () => {
    const result = classifyNcaafFbsGames([game(1, team(27, 151), team(23, 151))]);
    expect(result.rejected).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
  });

  it('resolves missing embedded conferences from the provider team catalog', () => {
    const rows = [game(1, { id: 10 }, { id: 20 })];
    const result = classifyNcaafFbsGames(rows, [team(10, 10), team(20, 4)]);
    expect(result.accepted).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
  });

  it('classifies flattened pick-runner rows through exact provider ids', () => {
    const rows = [
      {
        id: 1,
        home_team: 'Georgia Bulldogs',
        away_team: 'Clemson Tigers',
        home_team_id: 10,
        away_team_id: 20,
      },
      {
        id: 2,
        home_team: 'Georgia Bulldogs',
        away_team: 'Montana Grizzlies',
        home_team_id: 10,
        away_team_id: 30,
      },
    ];
    const catalog = [
      { id: 10, conference_id: 10 },
      { id: 20, conference: { id: 1 } },
      { id: 30, conference: 20 },
    ];

    const result = classifyNcaafFbsGames(rows, catalog);
    expect(result.accepted.map((row) => row.id)).toEqual([1]);
    expect(result.rejected.map((row) => row.id)).toEqual([2]);
    expect(result.unresolved).toHaveLength(0);
  });

  it('understands every BDL conference-id shape and fails closed on no identity', () => {
    expect(ncaafTeamConferenceId({ conference_id: 10 })).toBe(10);
    expect(ncaafTeamConferenceId({ conference: { id: 4 } })).toBe(4);
    expect(ncaafTeamConferenceId({ conference: 3 })).toBe(3);
    expect(ncaafTeamConferenceId({ id: 1 })).toBeNull();
  });

  it('does not trust an ungrounded caller-supplied verified flag', () => {
    const result = classifyNcaafFbsGames([{
      id: 9,
      home_team: 'Home College',
      away_team: 'Away College',
      ncaaf_fbs_verified: true,
    }]);
    expect(result.accepted).toHaveLength(0);
    expect(result.unresolved.map((game) => game.id)).toEqual([9]);
  });
});

describe('NCAAF date-only kickoff policy', () => {
  it('keeps a provider calendar date date-only without manufacturing an instant', () => {
    expect(resolveNcaafKickoff('2026-09-05')).toEqual({
      iso: null,
      scheduledDate: '2026-09-05',
      status: 'date_only',
      estimated: true,
    });
    expect(resolveNcaafKickoff('2026-11-14')).toEqual({
      iso: null,
      scheduledDate: '2026-11-14',
      status: 'date_only',
      estimated: true,
    });
  });

  it('preserves a posted instant and rejects malformed values', () => {
    expect(resolveNcaafKickoff('2026-09-06T00:30:00Z')).toEqual({
      iso: '2026-09-06T00:30:00.000Z',
      scheduledDate: '2026-09-05',
      status: 'confirmed',
      estimated: false,
    });
    expect(resolveNcaafKickoff('TBD')).toEqual({
      iso: null,
      scheduledDate: null,
      status: 'unknown',
      estimated: false,
    });
  });

  it('uses a 6:00 AM ET slate boundary only for confirmed kickoff instants', () => {
    expect(ncaafSlateDateForInstant('2026-09-06T09:59:59Z')).toBe('2026-09-05');
    expect(ncaafSlateDateForInstant('2026-09-06T10:00:00Z')).toBe('2026-09-06');
    expect(ncaafSlateDateForKickoff('2026-09-06T05:30:00Z')).toBe('2026-09-05');
    expect(ncaafSlateDateForKickoff('2026-09-06')).toBe('2026-09-06');
  });

  it('does not let date-only or invalid values masquerade as exact instants', () => {
    expect(ncaafSlateDateForInstant(null)).toBeNull();
    expect(ncaafSlateDateForInstant('')).toBeNull();
    expect(ncaafSlateDateForInstant('2026-09-06')).toBeNull();
    expect(ncaafSlateDateForInstant('TBD')).toBeNull();
    expect(ncaafSlateDateForKickoff('TBD')).toBeNull();
  });
});
