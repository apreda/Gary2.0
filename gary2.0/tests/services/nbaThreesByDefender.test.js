import { describe, expect, it } from 'vitest';
import { threesByDefender, threesByDefenderText } from '../../src/services/sports/nba/nbaThreesByDefender.js';

const row = (team_id, range, fg3_m, fg3_a) => ({ team_id, range, stats: { fg3_m, fg3_a, fga: fg3_a + 2 } });

describe('3s by closest defender', () => {
  // Portland at the Lakers, Nov 6 2026 (two players per bucket, summed).
  const rows = [row(25, '6_plus_ft', 5, 11), row(25, '6_plus_ft', 4, 10), row(25, '4_6_ft', 9, 17), row(25, '2_4_ft', 1, 5), row(25, '0_2_ft', 0, 0), row(14, '6_plus_ft', 7, 20)];

  it("sums one team's rows by bucket and leaves the other team's out", () => {
    const t = threesByDefender(rows, 25);
    expect(t).toMatchObject({ wideOpen: [9, 21], open: [9, 17], tight: [1, 5], veryTight: [0, 0], made: 19, att: 43 });
    expect(threesByDefender(rows, 99)).toBeNull();
  });

  it('says the box beside the tracked total only when they differ', () => {
    const t = threesByDefender(rows, 25);
    expect(threesByDefenderText(t, 'Trail Blazers', { fg3m: 19, fg3a: 43 })).toBe('Trail Blazers 9-21 wide open (6+ ft), 9-17 open (4-6 ft), 1-5 tight (2-4 ft)');
    expect(threesByDefenderText(t, null, { fg3m: 20, fg3a: 45 })).toMatch(/\(tracked 19-43 of the box's 20-45\)$/);
    expect(threesByDefenderText(null, 'Lakers')).toBe('Lakers not on file');
  });
});
