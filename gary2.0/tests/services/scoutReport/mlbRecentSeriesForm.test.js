/**
 * SERIES-SHAPED RECENT FORM pins (founder, Aug 10 2026). Windows cut at
 * series boundaries with opponents named — never a flat L7 silently
 * spanning three different clubs.
 */
import { describe, it, expect } from 'vitest';
import { computeMlbRecentSeriesForm } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

const g = (homeName, homeScore, awayName, awayScore) => ({
  teams: {
    home: { team: { name: homeName }, score: homeScore },
    away: { team: { name: awayName }, score: awayScore },
  },
});

// Phillies: 3 vs Nationals at home (2-1), 2 @ Braves (0-2), then 2 home vs Blue Jays (0-2, tonight = game 3)
const PHI_RECENT = [
  g('Philadelphia Phillies', 5, 'Washington Nationals', 2),
  g('Philadelphia Phillies', 1, 'Washington Nationals', 4),
  g('Philadelphia Phillies', 7, 'Washington Nationals', 3),
  g('Atlanta Braves', 6, 'Philadelphia Phillies', 2),
  g('Atlanta Braves', 3, 'Philadelphia Phillies', 1),
  g('Philadelphia Phillies', 4, 'Toronto Blue Jays', 5),
  g('Philadelphia Phillies', 5, 'Toronto Blue Jays', 7),
];

describe('computeMlbRecentSeriesForm', () => {
  it('groups by series with opponents named, ongoing tag only for tonight’s matchup', () => {
    expect(computeMlbRecentSeriesForm(PHI_RECENT, 'Phillies', 4, 'Blue Jays'))
      .toBe('vs Nationals 2-1 · @ Braves 0-2 · vs Blue Jays 0-2 (ongoing)');
  });

  it('a finished set never wears the ongoing tag', () => {
    expect(computeMlbRecentSeriesForm(PHI_RECENT, 'Phillies', 4, 'Marlins'))
      .toBe('vs Nationals 2-1 · @ Braves 0-2 · vs Blue Jays 0-2');
  });

  it('caps at maxSeries, keeping the most recent runs', () => {
    expect(computeMlbRecentSeriesForm(PHI_RECENT, 'Phillies', 2, 'Blue Jays'))
      .toBe('@ Braves 0-2 · vs Blue Jays 0-2 (ongoing)');
  });

  it('is null-safe on empty input', () => {
    expect(computeMlbRecentSeriesForm([], 'Phillies')).toBeNull();
    expect(computeMlbRecentSeriesForm(null, 'Phillies')).toBeNull();
  });
});

import { situationalSeriesLine, computeMlbSeasonSeriesGroups } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('situationalSeriesLine', () => {
  it('prints per-game RISP/LOB/one-run with pen arms named', () => {
    const rows = [
      { date: 'Aug 8', risp: '4-for-12', lob: 9, oneRun: false, penEvents: [{ name: 'Alvarado', note: '(BS, 2)', er: 2 }] },
      { date: 'Aug 9', risp: '5-for-15', lob: 27, oneRun: true, penEvents: [{ name: 'Kerkering', note: '(BS, 3)', er: 3 }, { name: 'Shugart', note: null, er: 1 }] },
    ];
    expect(situationalSeriesLine('Phillies, this series', rows)).toBe(
      'Phillies, this series: Aug 8: RISP 4-for-12, 9 LOB, pen: Alvarado (BS, 2) 2 ER · Aug 9: RISP 5-for-15, 27 LOB, one-run game, pen: Kerkering (BS, 3) 3 ER, Shugart 1 ER'
    );
  });
  it('silently drops empty rows and returns null with nothing to say', () => {
    expect(situationalSeriesLine('X', [{ date: 'Aug 8' }])).toBeNull();
    expect(situationalSeriesLine('X', [])).toBeNull();
  });
});

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
