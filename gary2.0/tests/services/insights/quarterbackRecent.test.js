import { describe, it, expect } from 'vitest';
import { quarterbackRecent } from '../../../src/services/content/insights/quarterbackRecent.js';

const g = (date, att, extra = {}) => ({ date, att, comp: att - 5, yds: att * 7, td: 1, ints: 0, rushAtt: 2, rushYds: 10, rushTd: 0, opp: 'OPP', oppId: 5, home: true, ...extra });

describe('quarterbackRecent', () => {
  it('reads his last game, last three and days since, newest first, skipping games he did not throw', () => {
    const r = quarterbackRecent([g('2026-10-12T17:00:00Z', 30), g('2026-11-02T18:00:00Z', 20), g('2026-10-26T17:00:00Z', 0), g('2026-10-19T17:00:00Z', 25), g('2026-10-05T17:00:00Z', 10)],
      { kickoff: '2026-11-09T18:00:00Z', opponentId: 9 });
    expect(r.last).toMatchObject({ date: '2026-11-02', att: 20 });
    expect(r.last3).toMatchObject({ games: 3, att: 75 });
    expect(r.days_since_last).toBe(7);
    expect(r.vs_opp).toBeNull();
  });
  it('counts days by Eastern date and finds games against this opponent', () => {
    const r = quarterbackRecent([g('2026-11-03T01:15:00Z', 30, { oppId: 9 })], { kickoff: '2026-11-07T01:15:00Z', opponentId: 9 });
    expect(r.last.date).toBe('2026-11-02');
    expect(r.days_since_last).toBe(4);
    expect(r.last3).toBeNull();
    expect(r.vs_opp).toHaveLength(1);
  });
  it('is null before he has thrown a pass', () => {
    expect(quarterbackRecent([g('2026-11-02T18:00:00Z', 0)], {})).toBeNull();
  });
});
