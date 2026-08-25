import { describe, expect, it } from 'vitest';
import { formatRecentForm } from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';

/**
 * RECENT FORM is on every NFL, NCAAF and NCAAB scout report. Two defects lived
 * in it (found Aug 25 2026 during the founder's misleading-data audit):
 *
 *   1. Venue was computed and then discarded — every line printed "vs", so a
 *      road win read as a home win.
 *   2. The record line counted games the list did not show. `shown` was
 *      min(completedGames.length, count) while wins/losses tallied only the
 *      games that survived the opponent filter, so it could print "2-2 last 5"
 *      next to four listed games.
 */

const game = ({ id = 1, homeName, awayName, homeScore, awayScore, date }) => ({
  id,
  date,
  home_team: { name: homeName, full_name: homeName },
  visitor_team: { name: awayName, full_name: awayName },
  home_team_score: homeScore,
  visitor_team_score: awayScore
});

describe('formatRecentForm — venue', () => {
  it('marks a road game with @, not vs', () => {
    const line = formatRecentForm('Detroit Lions', [
      game({ homeName: 'Chicago Bears', awayName: 'Detroit Lions', homeScore: 17, awayScore: 24, date: '2025-09-07' })
    ]);
    expect(line).toContain('W @ Chicago Bears (24-17)');
    expect(line).not.toContain('W vs Chicago Bears');
  });

  it('marks a home game with vs', () => {
    const line = formatRecentForm('Detroit Lions', [
      game({ homeName: 'Detroit Lions', awayName: 'Chicago Bears', homeScore: 24, awayScore: 17, date: '2025-09-07' })
    ]);
    expect(line).toContain('W vs Chicago Bears (24-17)');
  });

  it('reads the loss side with the right venue too', () => {
    const line = formatRecentForm('Detroit Lions', [
      game({ homeName: 'Green Bay Packers', awayName: 'Detroit Lions', homeScore: 31, awayScore: 14, date: '2025-09-14' })
    ]);
    expect(line).toContain('L @ Green Bay Packers (14-31)');
  });
});

describe('formatRecentForm — the record matches the games listed', () => {
  it('counts exactly the games it prints', () => {
    const games = [
      game({ id: 1, homeName: 'Detroit Lions', awayName: 'Chicago Bears', homeScore: 24, awayScore: 17, date: '2025-09-28' }),
      game({ id: 2, homeName: 'Green Bay Packers', awayName: 'Detroit Lions', homeScore: 31, awayScore: 14, date: '2025-09-21' }),
      game({ id: 3, homeName: 'Detroit Lions', awayName: 'Minnesota Vikings', homeScore: 20, awayScore: 10, date: '2025-09-14' })
    ];
    const line = formatRecentForm('Detroit Lions', games);
    expect(line).toContain('2-1 last 3');
    expect(line.match(/\|/g) || []).toHaveLength(2); // three results, two separators
  });

  it('does not claim more games than it lists when one is dropped', () => {
    // The second row's opponent resolves to the team itself, so the formatter
    // drops it. The record must shrink with the list, not stay at the slice size.
    const games = [
      game({ id: 1, homeName: 'Detroit Lions', awayName: 'Chicago Bears', homeScore: 24, awayScore: 17, date: '2025-09-28' }),
      game({ id: 2, homeName: 'Detroit Lions', awayName: 'Detroit Lions', homeScore: 10, awayScore: 3, date: '2025-09-21' }),
      game({ id: 3, homeName: 'Detroit Lions', awayName: 'Minnesota Vikings', homeScore: 20, awayScore: 10, date: '2025-09-14' })
    ];
    const line = formatRecentForm('Detroit Lions', games);
    const claimed = Number(line.match(/last (\d+)/)[1]);
    const wins = Number(line.match(/(\d+)-\d+ last/)[1]);
    const losses = Number(line.match(/\d+-(\d+) last/)[1]);
    expect(wins + losses).toBe(claimed);
  });

  it('never counts an unplayed game as a result', () => {
    const games = [
      game({ id: 1, homeName: 'Detroit Lions', awayName: 'Chicago Bears', homeScore: 24, awayScore: 17, date: '2025-09-28' }),
      game({ id: 2, homeName: 'Detroit Lions', awayName: 'Dallas Cowboys', homeScore: null, awayScore: null, date: '2026-09-13' })
    ];
    const line = formatRecentForm('Detroit Lions', games);
    expect(line).toContain('1-0 last 1');
    expect(line).not.toContain('Dallas');
  });
});
