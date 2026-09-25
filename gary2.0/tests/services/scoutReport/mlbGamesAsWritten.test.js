/**
 * Box score and pen press query contract pins. The pen press query asks for
 * reporting only, never conclusions.
 */
import { describe, it, expect } from 'vitest';
import { renderBoxScore, buildPenPressQuery } from '../../../src/services/agentic/scoutReport/sports/mlbGamesAsWritten.js';

describe('buildPenPressQuery — reporting only, no conclusions', () => {
  it('asks for the pen beat as published, attributed, with no advice asked for', () => {
    const q = buildPenPressQuery('Seattle Mariners');
    expect(q).toContain('Seattle Mariners bullpen');
    expect(q).toContain('as reported');
    expect(q).toContain('Attribute claims to the outlet');
    expect(q).toMatch(/no predictions, no betting advice/);
    expect(q).not.toMatch(/edge|pick|bet on|underdog|favorite/i);
  });
});

describe('renderBoxScore — every batter in order, every pitcher in appearance order', () => {
  const box = {
    teams: {
      away: {
        team: { name: 'Colorado Rockies' },
        pitchers: [77, 88],
        players: {
          ID10: { person: { fullName: 'Jake McCarthy' }, position: { abbreviation: 'RF' }, battingOrder: '100',
            stats: { batting: { atBats: 4, runs: 2, hits: 3, homeRuns: 1, rbi: 4, baseOnBalls: 0, strikeOuts: 1 } } },
          ID11: { person: { fullName: 'Pinch Hitter' }, position: { abbreviation: 'PH' }, battingOrder: '101',
            stats: { batting: { atBats: 1, runs: 0, hits: 0, homeRuns: 0, rbi: 0, baseOnBalls: 0, strikeOuts: 1 } } },
          ID77: { person: { fullName: 'Gabriel Hughes' }, stats: { pitching: { inningsPitched: '5.0', hits: 4, runs: 1, earnedRuns: 1, baseOnBalls: 2, strikeOuts: 6, numberOfPitches: 92 } } },
          ID88: { person: { fullName: 'Relief Arm' }, stats: { pitching: { inningsPitched: '4.0', hits: 1, runs: 0, earnedRuns: 0, baseOnBalls: 0, strikeOuts: 5, numberOfPitches: 51 } } },
        },
      },
      home: { team: { name: 'Washington Nationals' }, pitchers: [], players: {} },
    },
  };

  it('renders lineup-ordered batting, marks subs, and lists pitchers with pitch counts', () => {
    const out = renderBoxScore('2026-08-26 @ Nationals W 13-1', box);
    expect(out).toContain('BOX SCORE — 2026-08-26 @ Nationals W 13-1:');
    expect(out).toContain('1. Jake McCarthy (RF): 4 AB, 2 R, 3 H, 1 HR, 4 RBI, 0 BB, 1 K');
    expect(out).toContain('↳ Pinch Hitter (PH): 1 AB');
    expect(out).toContain('Gabriel Hughes: 5.0 IP, 4 H, 1 R, 1 ER, 2 BB, 6 K, 92 pitches');
    expect(out.indexOf('Gabriel Hughes')).toBeLessThan(out.indexOf('Relief Arm'));
    expect(out).not.toContain('Washington Nationals:');
    expect(out).not.toContain('...');
  });

  it('renders nothing at all when no side has player data', () => {
    expect(renderBoxScore('head', { teams: { away: { players: {} }, home: {} } })).toBe('');
  });
});
