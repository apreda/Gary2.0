// The flow line gives the score at the half, from the official quarters (Nov 10 2026 data round, pass 2: 20 of 40 recaps
// gave it, "it was down to 58-54 at halftime", and the row left it to adding two quarters).
import { describe, expect, it } from 'vitest';
import { flowFacts } from '../../src/services/sports/nba/nbaGameRecordText.js';

const rec = (home, away) => ({ home: { id: 1, short: 'Knicks' }, away: { id: 2, short: '76ers' }, teams: { home: { possessions: 104 }, away: { possessions: 104 } },
  quarters: { home, away }, afterThree: { home: 76, away: 83 }, flow: null, players: [] });

describe('NBA flow line: the score at the half', () => {
  it("says it from each team's side before the score after three, and leaves it off when a quarter is missing", () => {
    expect(flowFacts(rec([25, 33, 18, 24], [23, 31, 29, 23]), 1)).toContain('about 104 possessions each; at the half 58-54; after three 76-83');
    expect(flowFacts(rec([25, 33, 18, 24], [23, 31, 29, 23]), 2)).toContain('at the half 54-58; after three 83-76');
    expect(flowFacts(rec([25, null, 18, 24], [23, 31, 29, 23]), 1)).not.toContain('at the half');
  });
});
