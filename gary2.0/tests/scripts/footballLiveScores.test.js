import { describe, expect, it } from 'vitest';
import {
  addUtcDateDays,
  footballBdlRequest,
  footballDetail,
  footballEtDate,
  normalizeFootballGame,
  normalizeFootballGames,
  normalizeFootballStatus,
} from '../../supabase/functions/_shared/liveScoreFootball.js';

const NOW = Date.parse('2026-08-15T14:00:00Z');

function nflGame(overrides = {}) {
  return {
    id: 1393550,
    date: '2026-08-16T00:00:00.000Z', // Aug 15, 8:00 PM ET
    status: 'Scheduled',
    visitor_team: { abbreviation: 'NE' },
    home_team: { abbreviation: 'WAS' },
    home_team_score: null,
    visitor_team_score: null,
    ...overrides,
  };
}

function ncaafGame(overrides = {}) {
  return {
    id: 457157,
    date: '2026-08-29T16:00:00.000Z',
    status: null,
    visitor_team: { abbreviation: 'KU' },
    home_team: { abbreviation: 'TCU' },
    home_score: 0,
    away_score: 0,
    ...overrides,
  };
}

describe('football live-score date handling', () => {
  it('adds calendar days without host-time-zone drift', () => {
    expect(addUtcDateDays('2026-08-31')).toBe('2026-09-01');
    expect(addUtcDateDays('2028-02-28')).toBe('2028-02-29');
  });

  it('requests both possible UTC dates and includes NFL preseason', () => {
    expect(footballBdlRequest('NFL', '2026-08-15')).toEqual({
      path: '/nfl/v1/games',
      sportKey: 'americanfootball_nfl',
      params: {
        dates: ['2026-08-15', '2026-08-16'],
        per_page: '100',
        season_type: ['1', '2', '3'],
      },
    });
    expect(footballBdlRequest('NCAAF', '2026-08-15').params).not.toHaveProperty('season_type');
  });

  it('assigns late-evening games to their true ET slate date', () => {
    expect(footballEtDate('2026-09-11T00:20:00.000Z')).toBe('2026-09-10');
    const normalized = normalizeFootballGame(nflGame({ date: '2026-09-11T00:20:00.000Z' }), {
      league: 'NFL', targetDate: '2026-09-10', nowMs: NOW,
    });
    expect(normalized.row._etDate).toBe('2026-09-10');
  });

  it('does not leak a next-ET-day game into the requested slate', () => {
    const normalized = normalizeFootballGame(nflGame({ date: '2026-09-11T04:20:00.000Z' }), {
      league: 'NFL', targetDate: '2026-09-10', nowMs: NOW,
    });
    expect(normalized).toBeNull();
  });

  it('keeps a date-only NCAAF game on its ET slate using the canonical estimate', () => {
    const normalized = normalizeFootballGame(ncaafGame({ date: '2026-09-05' }), {
      league: 'NCAAF', targetDate: '2026-09-05', nowMs: NOW,
    });
    expect(normalized.startAt).toBe('2026-09-05T19:00:00.000Z');
    expect(normalized.row._etDate).toBe('2026-09-05');
    expect(normalized.row.status).toBe('scheduled');
  });
});

describe('football live-score status and detail', () => {
  it('normalizes a live NCAAF game with quarter and clock', () => {
    const normalized = normalizeFootballGame(ncaafGame({
      status: 'in', period: 4, time: '1:23', home_score: 24, away_score: 17,
    }), { league: 'NCAAF', targetDate: '2026-08-29', nowMs: NOW });
    expect(normalized.row).toMatchObject({
      league: 'NCAAF', status: 'live', detail: 'Q4 1:23',
      away_abbr: 'KU', home_abbr: 'TCU', away_score: 17, home_score: 24,
    });
  });

  it('normalizes the NCAAF post state as final', () => {
    const normalized = normalizeFootballGame(ncaafGame({ status: 'post', home_score: 31, away_score: 28 }), {
      league: 'NCAAF', targetDate: '2026-08-29', nowMs: NOW,
    });
    expect(normalized.row.status).toBe('final');
    expect(normalized.row.detail).toBe('FINAL');
  });

  it('normalizes NFL final score fields and visitor-team identity', () => {
    const normalized = normalizeFootballGame(nflGame({
      status: 'Final', home_team_score: 27, visitor_team_score: 20,
    }), { league: 'NFL', targetDate: '2026-08-15', nowMs: NOW });
    expect(normalized.row).toMatchObject({
      status: 'final', detail: 'FINAL', away_abbr: 'NE', home_abbr: 'WAS',
      away_score: 20, home_score: 27,
    });
  });

  it('infers an NFL quarter from populated quarter scores when the game has no clock', () => {
    const game = nflGame({
      status: 'in progress',
      home_team_q1: 7, visitor_team_q1: 3,
      home_team_q2: 0, visitor_team_q2: 7,
      home_team_q3: 0, visitor_team_q3: 0,
      home_team_q4: null, visitor_team_q4: null,
    });
    expect(footballDetail(game, 'live')).toBe('Q3');
  });

  it('renders halftime and overtime without inventing a clock', () => {
    expect(footballDetail({ status: 'Halftime', period: 2, time: '0:00' }, 'live')).toBe('HALF');
    expect(footballDetail({ status: 'in', period: 6 }, 'live')).toBe('2OT');
  });

  it('keeps explicit delays scheduled and uses a future start for unknown pregame text', () => {
    expect(normalizeFootballStatus('Delayed', { startAt: '2026-08-15T12:00:00Z', nowMs: NOW })).toBe('scheduled');
    expect(normalizeFootballStatus('TBA', { startAt: '2026-08-16T00:00:00Z', nowMs: NOW })).toBe('scheduled');
  });

  it('fails closed on an unknown status after kickoff', () => {
    expect(() => normalizeFootballStatus('mystery', {
      startAt: '2026-08-15T12:00:00Z', nowMs: NOW,
    })).toThrow('Unsupported football game status');
    expect(() => normalizeFootballStatus(null, {
      startAt: '2026-08-15T12:00:00Z', nowMs: NOW,
    })).toThrow('status is missing after kickoff');
  });
});

describe('football live-score batch normalization', () => {
  it('deduplicates provider game ids and reports malformed rows', () => {
    const duplicate = nflGame();
    const result = normalizeFootballGames([
      duplicate,
      { ...duplicate },
      nflGame({ id: 2, date: 'not-a-date' }),
    ], { league: 'NFL', targetDate: '2026-08-15', nowMs: NOW });
    expect(result.rows).toHaveLength(1);
    expect(result.issues).toEqual([
      { gameId: '2', message: 'NFL game 2 has an invalid date' },
    ]);
  });

  it('preserves null scores for a scheduled NFL game', () => {
    const result = normalizeFootballGames([nflGame()], {
      league: 'NFL', targetDate: '2026-08-15', nowMs: NOW,
    });
    expect(result.rows[0].row.away_score).toBeNull();
    expect(result.rows[0].row.home_score).toBeNull();
  });
});
