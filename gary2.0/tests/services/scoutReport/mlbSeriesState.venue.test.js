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
