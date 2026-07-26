import { describe, it, expect } from 'vitest';
import { computeMlbSeasonSeries } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

// The at-venue aggregate (spec 2026-07-26): the season-series line must carry
// how the matchup has gone at TONIGHT'S venue, computed from the same meetings.
describe('computeMlbSeasonSeries at-venue aggregate', () => {
  const HOME_ID = 1; // Cardinals host tonight
  const AWAY_ID = 2; // Reds visit

  const game = (homeId, awayId, homeRuns, awayRuns, date) =>
    ({ homeId, awayId, homeRuns, awayRuns, status: 'Final', date });

  it('appends the hosted-meetings record to the line', () => {
    const idx = new Map([
      // Two meetings hosted by tonight's home team: Cardinals won one, lost one
      ['a', game(HOME_ID, AWAY_ID, 5, 2, '2026-04-10')],
      ['b', game(HOME_ID, AWAY_ID, 1, 3, '2026-04-11')],
      // Two meetings at the away team's park
      ['c', game(AWAY_ID, HOME_ID, 2, 6, '2026-05-01')],
      ['d', game(AWAY_ID, HOME_ID, 7, 1, '2026-05-02')],
    ]);
    const out = computeMlbSeasonSeries(idx, HOME_ID, AWAY_ID, 'Cardinals', 'Reds');
    expect(out.line).toContain("At tonight's venue: Cardinals 1-1 vs Reds.");
  });

  it('omits the venue sentence when no meetings were hosted at tonight\'s venue', () => {
    const idx = new Map([
      ['c', game(AWAY_ID, HOME_ID, 2, 6, '2026-05-01')],
    ]);
    const out = computeMlbSeasonSeries(idx, HOME_ID, AWAY_ID, 'Cardinals', 'Reds');
    expect(out.line).not.toContain("At tonight's venue");
  });
});

import { computeMlbSituationalRecords } from '../../../src/services/agentic/scoutReport/sports/mlbSeriesState.js';

describe('computeMlbSituationalRecords', () => {
  const T = 1, OPP = 2, OPP2 = 3;
  const g = (date, homeId, awayId, homeRuns, awayRuns) =>
    [date, { homeId, awayId, homeRuns, awayRuns, status: 'Final', date }];

  it('computes after-loss, blowout, finale, and off-day records from the index', () => {
    // 12 games: alternating series vs OPP (3 games) and OPP2 (3 games) x2
    const entries = [
      g('2026-06-01T17:00:00Z', T, OPP, 2, 8),   // L by 6 (blowout)
      g('2026-06-02T17:00:00Z', T, OPP, 5, 3),   // W (after blowout loss)
      g('2026-06-03T17:00:00Z', T, OPP, 1, 4),   // L (finale of 3-game set)
      g('2026-06-05T17:00:00Z', OPP2, T, 1, 6),  // W (off day before: Jun 4)
      g('2026-06-06T17:00:00Z', OPP2, T, 7, 2),  // L
      g('2026-06-07T17:00:00Z', OPP2, T, 0, 3),  // W (finale)
      g('2026-06-08T17:00:00Z', T, OPP, 4, 2),   // W
      g('2026-06-09T17:00:00Z', T, OPP, 3, 9),   // L by 6 (blowout)
      g('2026-06-10T17:00:00Z', T, OPP, 6, 5),   // W (finale, after blowout)
      g('2026-06-12T17:00:00Z', OPP2, T, 2, 1),  // L (off day before)
      g('2026-06-13T17:00:00Z', OPP2, T, 4, 6),  // W
      g('2026-06-14T17:00:00Z', OPP2, T, 8, 1),  // L (finale)
    ];
    const idx = new Map(entries);
    const out = computeMlbSituationalRecords(idx, T, 'Rays');
    // Blowout losses (5+ margin): Jun 1 (2-8), Jun 6 (2-7), Jun 9 (3-9) — the
    // team won the game after each one.
    expect(out.records.afterBlowoutLoss).toEqual({ w: 3, l: 0 });
    expect(out.records.afterOffDay).toEqual({ w: 1, l: 1 });
    expect(out.records.seriesFinales).toEqual({ w: 2, l: 2 });
    expect(out.line).toContain('Rays this season: after a loss');
  });

  it('returns null under 10 games', () => {
    const idx = new Map([g('2026-06-01T17:00:00Z', T, OPP, 2, 8)]);
    expect(computeMlbSituationalRecords(idx, T, 'Rays')).toBeNull();
  });
});
