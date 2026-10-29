import { describe, expect, it } from 'vitest';
import { legCount, trackedLeg } from '../../scripts/lib/parlayLegLive.js';

const nbaRow = (id, first, last, s) => ({ player: { id, first_name: first, last_name: last }, ...s });

describe('parlay leg live counts', () => {
  it('counts a dart leg by its player id, combo stats summed', () => {
    const leg = { key: 'dart:878', league: 'NBA', game_id: 21717978, grade: { snapshot: { player: 'Tyrese Maxey', prop: 'points_rebounds_assists 33.5', bet: 'over' } } };
    const t = trackedLeg(leg, { kind: 'pra', player: 'Tyrese Maxey', player_id: '3547254', prop: 'points_rebounds_assists 33.5', bet: 'over' });
    expect(t).toMatchObject({ stat: 'points_rebounds_assists', line: 33.5, bet: 'over', playerId: '3547254' });
    const rows = [nbaRow(3547254, 'Tyrese', 'Maxey', { pts: 16, reb: 5, ast: 4 }), nbaRow(1, 'Tyrese', 'Maxey', { pts: 40, reb: 0, ast: 0 })];
    expect(legCount(t, rows)).toBe(25);
  });

  it('counts a prop leg by name and reads threes as threes, not points', () => {
    const t = trackedLeg({ key: 'prop:1', league: 'NBA', game_id: 5, grade: { snapshot: { player: 'Stephen Curry', prop: 'player_threes 4.5', bet: 'under' } } });
    expect(legCount(t, [nbaRow(9, 'Stephen', 'Curry', { pts: 21, fg3m: 3 })])).toBe(3);
  });

  it('gives no count it cannot read exactly', () => {
    expect(trackedLeg({ key: 'dart:1', league: 'MLB', game_id: 1 }, { kind: 'first_inning', prop: 'runs 0.5', bet: 'under' })).toBeNull();
    expect(trackedLeg({ key: 'p', league: 'MLB', game_id: 1, grade: { snapshot: { player: 'A B', prop: 'hits 1.5 + runs_scored 0.5', bet: 'over' } } })).toBeNull();
    expect(trackedLeg({ key: 'g', league: 'NBA', game_id: 1, grade: { snapshot: { prop: 'spread -3.5' } } })).toBeNull();
    const t = trackedLeg({ key: 'p', league: 'NBA', game_id: 1, grade: { snapshot: { player: 'Zion Williamson', prop: 'double_double 0.5', bet: 'over' } } });
    expect(legCount(t, [nbaRow(666969, 'Zion', 'Williamson', { pts: 20, reb: 4 })])).toBeNull();
    expect(legCount({ ...t, stat: 'rebounds' }, [])).toBeNull();
  });
});
