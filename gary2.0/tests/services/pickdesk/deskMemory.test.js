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
    { date: '2026-08-03', pick: 'Nationals ML +133', result: 'lost', score: '3-6' },
    { date: '2026-08-02', pick: 'Nationals ML +101', result: 'lost', score: '2-4' },
    { date: '2026-07-31', pick: 'Nationals ML +103', result: 'lost', score: '2-6' },
    { date: '2026-07-30', pick: 'Nationals +1.5 -145', result: 'won', score: '4-5' },
    { date: '2026-07-29', pick: 'Mets ML -140', result: 'won', score: '5-2' },
    { date: '2026-07-28', pick: 'Nationals +1.5 -120', result: 'lost', score: '1-7' },
  ];

  it('prints the raw rows and nothing else — no tally, no side count', () => {
    const s = yourBookSection([{ club: 'Nationals', rows: NATS_ROWS }]);
    expect(s).toContain('═══ YOUR BOOK');
    expect(s).toContain('Nationals — your last 5 pick(s) on their games:');
    expect(s).toContain('2026-08-03: Nationals ML +133 — lost (3-6)');
    // Newest five only; the sixth row stays off the desk.
    expect(s).not.toContain('2026-07-28');
    // FOUNDER LAW (Aug 4 night): a computed tally is steering — it hands Gary a
    // reason to switch sides. Rows only; the pattern is his to read.
    expect(s).not.toMatch(/you took|straight|graded \d|side in \d|record/i);
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
