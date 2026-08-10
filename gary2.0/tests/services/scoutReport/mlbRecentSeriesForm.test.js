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
