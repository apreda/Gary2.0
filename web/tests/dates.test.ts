import { describe, it, expect } from 'vitest';
import { todayEST, hubGradedDateEST, estDateStr, daysAgoEST } from '@/lib/gary/dates';

describe('todayEST', () => {
  it('returns previous day until the shared 6am Eastern rollover', () => {
    expect(todayEST(new Date('2026-06-04T09:59:00Z'))).toBe('2026-06-03');
  });
  it('returns same day at 6am Eastern', () => {
    expect(todayEST(new Date('2026-06-04T10:00:00Z'))).toBe('2026-06-04');
  });
  // Midday UTC = morning EST
  it('handles midday', () => {
    expect(todayEST(new Date('2026-06-04T16:00:00Z'))).toBe('2026-06-04');
  });
  // Winter (EST, UTC-5): 2026-01-15T07:30:00Z = 02:30 EST — before rollover
  it('respects EST (winter) offset', () => {
    expect(todayEST(new Date('2026-01-15T07:30:00Z'))).toBe('2026-01-14');
    expect(todayEST(new Date('2026-01-15T11:00:00Z'))).toBe('2026-01-15');
  });
  it('keeps the previous calendar day after spring forward, not two days ago', () => {
    expect(todayEST(new Date('2026-03-09T04:30:00Z'))).toBe('2026-03-08');
    expect(hubGradedDateEST(new Date('2026-03-09T04:30:00Z'))).toBe('2026-03-07');
  });
  it('keeps both repeated fall-back hours on the prior slate', () => {
    expect(todayEST(new Date('2026-11-01T05:30:00Z'))).toBe('2026-10-31');
    expect(todayEST(new Date('2026-11-01T06:30:00Z'))).toBe('2026-10-31');
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
    ['2026-09-04T05:30:00Z', 0, '2026-09-04'], // Calendar today, even before 6am.
  ])('subtracts %s by %s Eastern calendar days', (now, days, expected) => {
    expect(daysAgoEST(days, new Date(now))).toBe(expected);
  });
});
