import { describe, it, expect } from 'vitest';
import { todayEST, hubGradedDateEST, estDateStr, daysAgoEST } from '@/lib/gary/dates';

describe('todayEST', () => {
  // 2026-06-04T06:59:00Z = 2026-06-04 02:59 EDT (UTC-4) — before 3am rollover
  it('returns previous day before 3am EST', () => {
    expect(todayEST(new Date('2026-06-04T06:59:00Z'))).toBe('2026-06-03');
  });
  // 2026-06-04T07:01:00Z = 03:01 EDT — after rollover
  it('returns same day after 3am EST', () => {
    expect(todayEST(new Date('2026-06-04T07:01:00Z'))).toBe('2026-06-04');
  });
  // Midday UTC = morning EST
  it('handles midday', () => {
    expect(todayEST(new Date('2026-06-04T16:00:00Z'))).toBe('2026-06-04');
  });
  // Winter (EST, UTC-5): 2026-01-15T07:30:00Z = 02:30 EST — before rollover
  it('respects EST (winter) offset', () => {
    expect(todayEST(new Date('2026-01-15T07:30:00Z'))).toBe('2026-01-14');
  });
});

describe('hubGradedDateEST', () => {
  it('is one day before todayEST', () => {
    expect(hubGradedDateEST(new Date('2026-06-04T16:00:00Z'))).toBe('2026-06-03');
  });
});

describe('estDateStr', () => {
  it('formats a Date in America/New_York as yyyy-MM-dd', () => {
    expect(estDateStr(new Date('2026-06-05T01:00:00Z'))).toBe('2026-06-04'); // 9pm EDT prev day
  });
});

describe('daysAgoEST', () => {
  it.each([
    ['2026-03-09T04:30:00Z', 1, '2026-03-08'], // 00:30 EDT after spring forward.
    ['2026-03-14T04:30:00Z', 6, '2026-03-08'],
    ['2026-11-02T04:30:00Z', 1, '2026-10-31'], // 23:30 EST on the fall-back day.
    ['2026-01-01T05:30:00Z', 1, '2025-12-31'],
    ['2026-09-04T05:30:00Z', 0, '2026-09-04'], // Calendar today, even before 3am.
  ])('subtracts %s by %s Eastern calendar days', (now, days, expected) => {
    expect(daysAgoEST(days, new Date(now))).toBe(expected);
  });
});
