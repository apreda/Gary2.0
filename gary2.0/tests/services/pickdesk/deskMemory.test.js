/**
 * DESK MEMORY pins (Aug 4 2026 evening — the Nationals-streak + value-hunting
 * autopsy). Three data lanes, founder-approved: YOUR BOOK (his own recent
 * picks touching tonight's clubs), the TEAM SAMPLE note (post-deadline
 * departures), and the props desk reading the published game call.
 */
import { describe, it, expect } from 'vitest';
import { yourBookSection, teamSampleNote } from '../../../src/services/pickdesk/mlbDesk.js';

describe('yourBookSection', () => {
  const NATS_ROWS = [
    { date: '2026-08-03', pick: 'Nationals ML +133', result: 'lost', score: '3-6', side: 'Nationals' },
    { date: '2026-08-02', pick: 'Nationals ML +101', result: 'lost', score: '2-4', side: 'Nationals' },
    { date: '2026-07-31', pick: 'Nationals ML +103', result: 'lost', score: '2-6', side: 'Nationals' },
    { date: '2026-07-30', pick: 'Nationals +1.5 -145', result: 'won', score: '4-5', side: 'Nationals' },
  ];

  it('prints the tally and the raw ledger — facts, no interpretation', () => {
    const s = yourBookSection([{ club: 'Nationals', rows: NATS_ROWS }]);
    expect(s).toContain('═══ YOUR BOOK');
    expect(s).toContain('Nationals: 4 recent pick(s) touching them — you took the Nationals side in 4; graded 1-3.');
    expect(s).toContain('2026-08-03: Nationals ML +133 — lost (3-6)');
    // No verdicts, no advice — the ledger IS the message.
    expect(s).not.toMatch(/avoid|fade|stop|careful|trend|due/i);
  });

  it('silent when no rows touch tonight\'s clubs', () => {
    expect(yourBookSection([{ club: 'Rockies', rows: [] }])).toBe('');
  });
});

describe('teamSampleNote', () => {
  it('names the departed and their dates', () => {
    const s = teamSampleNote({
      Nationals: [
        { player: 'Luis García Jr.', date: '2026-08-03' },
        { player: 'JoJo Romero', date: '2026-08-01' },
      ],
      Phillies: [],
    });
    expect(s).toContain('Sample note:');
    expect(s).toContain('Nationals: season/L10 numbers include games with since-departed players — Luis García Jr. (2026-08-03), JoJo Romero (2026-08-01).');
    expect(s).not.toContain('Phillies');
  });

  it('silent when nobody left', () => {
    expect(teamSampleNote({ Reds: [], Athletics: [] })).toBe('');
  });
});
