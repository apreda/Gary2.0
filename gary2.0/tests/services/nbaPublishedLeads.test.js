// A largest lead or lead-change count is printed only when ESPN's published box agrees (Nov 10 2026 data round:
// Pacers-Bucks on Oct 26, our play-by-play's 5 lead changes against ESPN's published 9).
import { describe, expect, it } from 'vitest';
import { withPublishedLeads } from '../../src/services/sports/nba/nbaGameRecord.js';
import { flowFacts } from '../../src/services/sports/nba/nbaGameRecordText.js';

describe('NBA game record: leads against the published box', () => {
  it('leaves off the numbers ESPN disagrees on and keeps the rest', () => {
    const flow = { largestLead: { home: 12, away: 8 }, leadChanges: 5, ties: 3, biggestRun: { home: null, away: null }, fiveLeft: null };
    const off = withPublishedLeads(flow, { home: { largestLead: 12, leadChanges: 9 }, away: { largestLead: 10, leadChanges: 9 } });
    expect(off).toHaveLength(2);
    const rec = { home: { id: 1, short: 'Bucks' }, away: { id: 2, short: 'Pacers' }, teams: { home: { possessions: 99 }, away: { possessions: 99 } }, quarters: { home: [], away: [] }, flow, players: [] };
    const text = flowFacts(rec, 1);
    expect(text).toContain('largest lead Bucks 12;');
    expect(text).not.toContain('Pacers 8');
    expect(text).toContain('; 3 ties;');
    expect(text).not.toContain('lead change');
  });
});
