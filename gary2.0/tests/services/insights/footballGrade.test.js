import { describe, expect, it } from 'vitest';
import { gradeFootballInsightRow } from '../../../src/services/insights/footballGrade.js';

const game = {
  home_team: { id: 10 },
  visitor_team: { id: 20 },
  home_team_score: 27,
  visitor_team_score: 17,
};

describe('football insight grading', () => {
  it('grades a verified team edge by whether that side won', () => {
    expect(gradeFootballInsightRow({ team_id: 10, category: 'trenches' }, game).result).toBe('hit');
    expect(gradeFootballInsightRow({ team_id: 20, category: 'quarterback' }, game).result).toBe('miss');
  });

  it('grades a high-total market edge against the exact posted total', () => {
    const verdict = gradeFootballInsightRow({
      line_val: 41.5,
      meta: { metric: 'market_total_vs_slate_median', total: 41.5, slate_median: 37.5 },
    }, game);
    expect(verdict).toMatchObject({ result: 'hit' });
  });

  it('leaves an unresolvable evidence row as context', () => {
    expect(gradeFootballInsightRow({ category: 'trenches' }, game)).toMatchObject({ result: null });
  });

  it('never grades AFTER GARY as a team prediction', () => {
    expect(gradeFootballInsightRow({
      category: 'after_gary',
      team_id: 10,
      meta: { kind: 'after_gary', grade: 'context' },
    }, game)).toEqual({
      result: null,
      note: 'Same-book market receipt; context only',
    });
  });
});
