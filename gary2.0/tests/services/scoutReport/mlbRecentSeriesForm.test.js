/**
 * Season-series grouping pins. (The series-shaped form line and situational
 * series line were retired Aug 26 — founder duplication audit; their tests
 * went with them.)
 */
import { describe, it, expect } from 'vitest';
import { computeMlbSeasonSeriesGroups } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('computeMlbSeasonSeriesGroups', () => {
  // Index dates are full datetimes (BDL) — a bare date would parse as UTC
  // midnight and shift a day under the ET conversion.
  const idx = new Map([
    [1, { date: '2026-06-08T23:05:00Z', status: 'STATUS_FINAL', homeId: 29, awayId: 22, homeRuns: 2, awayRuns: 5 }],
    [2, { date: '2026-06-09T23:05:00Z', status: 'STATUS_FINAL', homeId: 29, awayId: 22, homeRuns: 3, awayRuns: 2 }],
    [3, { date: '2026-06-10T17:05:00Z', status: 'STATUS_FINAL', homeId: 29, awayId: 22, homeRuns: 4, awayRuns: 7 }],
    [4, { date: '2026-08-07T22:05:00Z', status: 'STATUS_FINAL', homeId: 22, awayId: 29, homeRuns: 4, awayRuns: 5 }],
    [5, { date: '2026-08-08T22:05:00Z', status: 'STATUS_FINAL', homeId: 22, awayId: 29, homeRuns: 5, awayRuns: 7 }],
  ]);
  it('groups meetings into series with dates, venue, and a winner', () => {
    expect(computeMlbSeasonSeriesGroups(idx, 22, 29, 'Phillies', 'Blue Jays')).toEqual([
      'Jun 8–Jun 10 at Blue Jays — Phillies won 2-1',
      'Aug 7–Aug 8 at Phillies — Blue Jays won 2-0',
    ]);
  });
  it('is null-safe', () => {
    expect(computeMlbSeasonSeriesGroups(null, 1, 2, 'A', 'B')).toBeNull();
    expect(computeMlbSeasonSeriesGroups(new Map(), 1, 2, 'A', 'B')).toBeNull();
  });
});
