import { describe, it, expect } from 'vitest';
import { parseOfficialReport, reportUrlFor } from '../../src/services/providers/nbaOfficialInjuryReport.js';

// The shape `pdftotext -layout` gives the league's report: wrapped reasons print above and below their row, later
// pages drop the header and shift left, and a reason can run past a page break.
const TEXT = [
  '                                         Injury Report: 04/10/26 05:00 PM',
  '',
  'Game Date    Game Time    Matchup   Team                        Player Name           Current Status   Reason',
  '',
  '                                                                                                       Injury/Illness - Right Knee; Injury',
  '04/10/2026   07:00 (ET)   CLE@ATL   Cleveland Cavaliers          Allen, Jarrett       Out',
  '                                                                                                       Management',
  '',
  '                                    Atlanta Hawks                Dennis, RayJ         Doubtful         G League - Two-Way',
  '',
  '                          DET@CHA   Detroit Pistons              NOT YET SUBMITTED',
  '\f               Injury Report: 04/10/26 05:00 PM',
  'MIA@WAS   Miami Heat                  Moore Jr., Wendell   Questionable   Injury/Illness - Right Shoulder;',
  '\f',
  '                                                                          Contusion',
].join('\n');

describe('the NBA official injury report reader', () => {
  it('reads every row with its game, team, status and whole reason', () => {
    const { rows, notSubmitted } = parseOfficialReport(TEXT);
    expect(rows).toEqual([
      { gameDate: '04/10/2026', gameTime: '07:00 (ET)', matchup: 'CLE@ATL', team: 'Cleveland Cavaliers', player: 'Jarrett Allen', status: 'Out', reason: 'Injury/Illness - Right Knee; Injury Management' },
      { gameDate: '04/10/2026', gameTime: '07:00 (ET)', matchup: 'CLE@ATL', team: 'Atlanta Hawks', player: 'RayJ Dennis', status: 'Doubtful', reason: 'G League - Two-Way' },
      { gameDate: '04/10/2026', gameTime: '07:00 (ET)', matchup: 'MIA@WAS', team: 'Miami Heat', player: 'Wendell Moore Jr.', status: 'Questionable', reason: 'Injury/Illness - Right Shoulder; Contusion' },
    ]);
    expect(notSubmitted).toEqual([{ gameDate: '04/10/2026', gameTime: '07:00 (ET)', matchup: 'DET@CHA', team: 'Detroit Pistons' }]);
  });

  it('names the report for an instant on the Eastern quarter hour', () => {
    expect(reportUrlFor(new Date('2026-04-10T21:07:00Z'))).toBe('https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-04-10_05_00PM.pdf');
    expect(reportUrlFor(new Date('2026-10-21T03:59:00Z'))).toBe('https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-10-20_11_45PM.pdf');
  });
});
