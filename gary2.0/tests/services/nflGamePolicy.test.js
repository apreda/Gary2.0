import { describe, expect, it } from 'vitest';
import {
  nflSlateDateForKickoff,
  resolveNflKickoff,
} from '../../src/services/nflGamePolicy.js';

describe('NFL date-only kickoff policy', () => {
  it('keeps a provider calendar date date-only without manufacturing an instant', () => {
    expect(resolveNflKickoff('2026-09-13')).toEqual({
      iso: null,
      scheduledDate: '2026-09-13',
      status: 'date_only',
      estimated: true,
    });
    expect(nflSlateDateForKickoff('2026-09-13')).toBe('2026-09-13');
  });

  it('preserves exact provider instants on the ordinary ET calendar slate', () => {
    expect(resolveNflKickoff('2026-09-14T00:20:00Z')).toEqual({
      iso: '2026-09-14T00:20:00.000Z',
      scheduledDate: '2026-09-13',
      status: 'confirmed',
      estimated: false,
    });
  });

  it('prefers an exact provider datetime over a date-only calendar field', () => {
    expect(resolveNflKickoff({
      date: '2026-09-13',
      datetime: '2026-09-13T17:00:00Z',
    })).toMatchObject({
      iso: '2026-09-13T17:00:00.000Z',
      scheduledDate: '2026-09-13',
      status: 'confirmed',
    });
  });

  it('fails closed on absent or malformed provider values', () => {
    expect(resolveNflKickoff(null)).toMatchObject({ iso: null, scheduledDate: null, status: 'unknown' });
    expect(resolveNflKickoff('TBD')).toMatchObject({ iso: null, scheduledDate: null, status: 'unknown' });
  });
});
