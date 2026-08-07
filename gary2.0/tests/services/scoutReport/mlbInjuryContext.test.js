import { describe, expect, it } from 'vitest';

import {
  MLB_FRESH_MAX_GAMES,
  MLB_LONG_TERM_MIN_GAMES,
  classifyMlbInjuryContext,
  completedMlbTeamGames,
  isMeaningfulMlbAbsence,
  isMlbPitcherPosition,
  mlbGamesMissedLabel,
  resolveMlbGamesMissed,
} from '../../../src/services/agentic/scoutReport/sports/mlbInjuryContext.js';

const final = (overrides = {}) => ({
  homeId: 10,
  awayId: 20,
  status: 'STATUS_FINAL',
  seasonType: 'regular',
  date: '2026-08-01T23:05:00Z',
  ...overrides,
});

describe('completedMlbTeamGames', () => {
  it('keeps only completed non-spring games for the requested team in chronological order', () => {
    const index = new Map([
      [4, final({ date: '2026-08-04T23:05:00Z' })],
      [1, final({ homeId: 30, awayId: 40, date: '2026-08-01T18:00:00Z' })],
      [2, final({ status: 'STATUS_SCHEDULED', date: '2026-08-02T18:00:00Z' })],
      [3, final({ seasonType: 'spring_training', date: '2026-08-03T18:00:00Z' })],
      [5, final({ homeId: 50, awayId: 10, date: '2026-08-01T18:00:00Z' })],
    ]);

    expect(completedMlbTeamGames(index, '10').map((game) => game.id)).toEqual([5, 4]);
  });
});

describe('resolveMlbGamesMissed', () => {
  const teamGames = [
    { id: 100, date: '2026-08-01T17:00:00Z', timestamp: Date.parse('2026-08-01T17:00:00Z') },
    { id: 101, date: '2026-08-01T23:00:00Z', timestamp: Date.parse('2026-08-01T23:00:00Z') },
    { id: 102, date: '2026-08-02T23:00:00Z', timestamp: Date.parse('2026-08-02T23:00:00Z') },
  ];

  it('uses exact game ids so a same-day doubleheader counts correctly', () => {
    expect(resolveMlbGamesMissed(teamGames, { gameId: 100, date: '2026-08-01' }))
      .toEqual({ gamesMissed: 2, isMinimum: false });
    expect(resolveMlbGamesMissed(teamGames, { gameId: '101', date: '2026-08-01' }))
      .toEqual({ gamesMissed: 1, isMinimum: false });
  });

  it('marks an all-season absence as a minimum and leaves failed clocks unresolved', () => {
    expect(resolveMlbGamesMissed(teamGames, null)).toEqual({ gamesMissed: 3, isMinimum: true });
    expect(resolveMlbGamesMissed(teamGames, undefined)).toEqual({ gamesMissed: null, isMinimum: false });
  });
});

describe('isMeaningfulMlbAbsence', () => {
  const injury = (id, position) => ({ player: { id, position } });

  it('uses playing-time thresholds for hitters, rotation arms, and relievers', () => {
    expect(isMeaningfulMlbAbsence(injury(1, '1B'), [{ player: { id: 1 }, batting_gp: 46 }], 100)).toBe(true);
    expect(isMeaningfulMlbAbsence(injury(2, 'OF'), [{ player: { id: 2 }, batting_gp: 20, batting_pa: 70 }], 100)).toBe(false);
    expect(isMeaningfulMlbAbsence(injury(3, 'RHP'), [{ player: { id: 3 }, pitching_gs: null, games_started: 6 }], 100)).toBe(true);
    expect(isMeaningfulMlbAbsence(injury(4, 'RP'), [{ player: { id: 4 }, pitching_gp: 25 }], 100)).toBe(true);
  });

  it('does not mistake missing season stats for a meaningful role', () => {
    expect(isMeaningfulMlbAbsence(injury(99, 'SS'), [], 100)).toBe(false);
  });
});

describe('classifyMlbInjuryContext', () => {
  it('shows every fresh absence for the first 0-2 completed team games', () => {
    for (let gamesMissed = 0; gamesMissed <= MLB_FRESH_MAX_GAMES; gamesMissed += 1) {
      expect(classifyMlbInjuryContext({ gamesMissed })).toMatchObject({ include: true, tag: 'FRESH' });
    }
  });

  it('shows only meaningful regulars from games 3-9', () => {
    expect(classifyMlbInjuryContext({ gamesMissed: 3, isMeaningful: true }))
      .toMatchObject({ include: true, tag: 'ESTABLISHED' });
    expect(classifyMlbInjuryContext({ gamesMissed: 9, isMeaningful: false }))
      .toMatchObject({ include: false, tag: 'DEPTH' });
  });

  it('omits long-term absences even when the player is meaningful', () => {
    expect(classifyMlbInjuryContext({ gamesMissed: MLB_LONG_TERM_MIN_GAMES, isMeaningful: true }))
      .toMatchObject({ include: false, tag: 'LONG-TERM' });
    expect(classifyMlbInjuryContext({ gamesMissed: 4, gamesMissedIsMinimum: true, isMeaningful: true }))
      .toMatchObject({ include: false, tag: 'LONG-TERM' });
  });

  it('keeps an explicit starting-pitcher scratch visible and fails closed on an unresolved clock', () => {
    expect(classifyMlbInjuryContext({ gamesMissed: 25, isPitcher: true, isScratch: true }))
      .toMatchObject({ include: true, tag: 'SP SCRATCH' });
    expect(classifyMlbInjuryContext({ gamesMissed: null, isMeaningful: true }))
      .toMatchObject({ include: false, tag: 'UNRESOLVED' });
  });
});

describe('MLB injury display helpers', () => {
  it('recognizes MLB pitcher position variants and formats the routing clock', () => {
    expect(['P', 'SP', 'RP', 'RHP', 'LHP', 'Pitcher'].every(isMlbPitcherPosition)).toBe(true);
    expect(isMlbPitcherPosition('1B')).toBe(false);
    expect(mlbGamesMissedLabel(1)).toBe('1 team game missed');
    expect(mlbGamesMissedLabel(10, true)).toBe('10+ team games missed');
  });
});
