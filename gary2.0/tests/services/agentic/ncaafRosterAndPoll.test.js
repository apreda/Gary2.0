import { describe, it, expect } from 'vitest';
import { rosterAndPollLines, ncaafSeasonOf } from '../../../src/services/gary/agentic/orchestrator/ncaafRosterAndPoll.js';

describe('college roster talent and AP poll', () => {
  const talent = [{ team: 'Texas', talent: 985.17 }, { team: 'Texas Tech', talent: 700 }, { team: 'UCLA', talent: 774.5 }, { team: 'Nevada', talent: 550 }];
  const ranks = [{ week: 8, polls: [{ poll: 'AP Top 25', ranks: [{ rank: 9, school: 'UCLA' }] }] },
    { week: 9, polls: [{ poll: 'Coaches Poll', ranks: [] }, { poll: 'AP Top 25', ranks: [{ rank: 7, school: 'UCLA' }, { rank: 12, school: 'Texas' }] }] }];
  it('gives both teams the same facts, from the latest AP poll, matching schools to full names', () => {
    const text = rosterAndPollLines(talent, ranks, { awayTeam: 'Nevada Wolf Pack', homeTeam: 'UCLA Bruins' });
    expect(text).toBe('247Sports team talent composite (this season\'s rosters): Nevada Wolf Pack 550.0, No. 4 of 4; UCLA Bruins 774.5, No. 2 of 4\nAP Top 25 (this season, week 9): Nevada Wolf Pack not ranked; UCLA Bruins No. 7');
    expect(rosterAndPollLines(talent, ranks, { awayTeam: 'Texas Tech Red Raiders', homeTeam: 'Texas Longhorns' })).toMatch(/Texas Tech Red Raiders 700\.0, No\. 3 .*Texas Longhorns 985\.2, No\. 1[\s\S]*Texas Tech Red Raiders not ranked; Texas Longhorns No\. 12/);
  });
  it('says a source that did not load, and counts a January bowl in the season before', () => {
    expect(rosterAndPollLines(null, null, { awayTeam: 'A', homeTeam: 'B' }, { talent: 'CFBD returned HTTP 500', poll: null }))
      .toBe('247Sports team talent composite: not on file (CFBD returned HTTP 500)\nAP Top 25: not on file');
    expect(ncaafSeasonOf('2027-01-01T20:00:00Z')).toBe(2026);
    expect(ncaafSeasonOf('2026-10-31T16:00:00Z')).toBe(2026);
  });
});
