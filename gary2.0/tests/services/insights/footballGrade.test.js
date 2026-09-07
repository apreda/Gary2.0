import { readFileSync } from 'node:fs';
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

  it('never grades a future NCAAF slate preview', () => {
    expect(gradeFootballInsightRow({
      category: 'next_slate',
      meta: { kind: 'next_slate', grade: 'context' },
    }, null)).toEqual({
      result: null,
      note: 'Future schedule preview; context only',
    });
  });

  it.each(['fantasy_usage', 'fantasy_red_zone', 'fantasy_matchup', 'fantasy_trend'])('keeps %s as context regardless of the player\'s team result or the call', category => {
    for (const team_id of [10, 20]) {
      for (const value of ['START', 'SIT', 'HOLD', 'WATCH', 'CONSIDER ADD']) {
        expect(gradeFootballInsightRow({ category, value, player_id: '123', team_id, game_id: '456' }, game)).toEqual({
          result: null, note: 'Fantasy roster/lineup decision; context only',
        });
      }
    }
  });

  it.each([
    { generated_by: 'fantasy_briefing_v1' },
    { fantasy_source: 'fantasy_briefing_v1' },
    { meta: { source: 'fantasy_briefing_v1' } },
  ])('preserves Fantasy provenance as context if a category changes: %j', source => {
    expect(gradeFootballInsightRow({ ...source, category: 'new_fantasy_projection', team_id: 20 }, game).result).toBeNull();
    expect(gradeFootballInsightRow({ ...source, category: 'new_fantasy_projection', team_id: 10 }, null).result).toBeNull();
  });

  it('loads only the required provenance fields in the scheduled grader', () => {
    const source = readFileSync(new URL('../../../run-grade-insights.js', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('async function fetchRows'), source.indexOf('async function writeGrade'));
    expect(block).toContain('graded_at,generated_by,fantasy_source:meta->>source');
  });
});
