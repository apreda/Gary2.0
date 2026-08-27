/**
 * THE LAST GAMES, AS WRITTEN — contract pins (born Aug 27 2026 with the
 * founder's pen-as-articles GO).
 *
 * The laws these pins hold: selection is last game + current-series run,
 * deduped against pks already printed on the desk; bodies print WHOLE (no
 * trims); a game with no published recap is silently omitted; the pen press
 * query asks for reporting only, never conclusions.
 */
import { describe, it, expect } from 'vitest';
import { selectStoryGames, renderGamesAsWritten, renderBoxScore, buildPenPressQuery } from '../../../src/services/agentic/scoutReport/sports/mlbGamesAsWritten.js';

const row = (pk, home, away, hs, as_, officialDate) => ({
  gamePk: pk,
  officialDate,
  gameDate: `${officialDate}T23:10:00Z`,
  teams: {
    home: { team: { name: home }, score: hs },
    away: { team: { name: away }, score: as_ },
  },
});

// Mariners' last four: two vs Astros (older series), then two vs Phillies
// (the current series against tonight's opponent).
const RECENT = [
  row(101, 'Seattle Mariners', 'Houston Astros', 3, 5, '2026-08-23'),
  row(102, 'Seattle Mariners', 'Houston Astros', 6, 2, '2026-08-24'),
  row(103, 'Seattle Mariners', 'Philadelphia Phillies', 9, 2, '2026-08-25'),
  row(104, 'Seattle Mariners', 'Philadelphia Phillies', 4, 1, '2026-08-26'),
];

describe('selectStoryGames — last game + the current series, deduped', () => {
  it('picks the last game and every current-series game exactly once, newest first', () => {
    const picks = selectStoryGames({
      teamName: 'Seattle Mariners',
      opponentName: 'Philadelphia Phillies',
      recentGames: RECENT,
    });
    expect(picks.map((p) => p.gamePk)).toEqual([104, 103]);
    expect(picks[0].final).toBe('W 4-1');
    expect(picks[0].label).toBe('vs Philadelphia Phillies');
    expect(picks[0].date).toBe('2026-08-26');
  });

  it('a series opener tonight still carries the last game, even vs another club', () => {
    const picks = selectStoryGames({
      teamName: 'Seattle Mariners',
      opponentName: 'San Diego Padres',
      recentGames: RECENT,
    });
    expect(picks.map((p) => p.gamePk)).toEqual([104]);
  });

  it('never reprints a pk the desk already carries', () => {
    const picks = selectStoryGames({
      teamName: 'Seattle Mariners',
      opponentName: 'Philadelphia Phillies',
      recentGames: RECENT,
      printedPks: [104],
    });
    expect(picks.map((p) => p.gamePk)).toEqual([103]);
  });

  it('empty input renders nothing and throws nothing', () => {
    expect(selectStoryGames({ teamName: 'X', opponentName: 'Y', recentGames: [] })).toEqual([]);
    expect(renderGamesAsWritten('X', [])).toBe('');
  });
});

describe('renderGamesAsWritten — whole articles, silence only for verified-empty', () => {
  it('prints the full body untrimmed and omits verified-empty games silently', () => {
    const body = 'The starter left in the sixth with two on. '.repeat(60).trim();
    const out = renderGamesAsWritten('Seattle Mariners', [
      { gamePk: 104, date: '2026-08-26', label: 'vs Philadelphia Phillies', final: 'W 4-1', story: { headline: 'Mariners hold on', body } },
      { gamePk: 103, date: '2026-08-25', label: 'vs Philadelphia Phillies', final: 'W 9-2', story: null },
    ]);
    expect(out).toContain('SEATTLE MARINERS — THE LAST GAMES, AS WRITTEN');
    expect(out).toContain(body);
    expect(out).toContain('Mariners hold on');
    expect(out).not.toContain('2026-08-25');
    expect(out).not.toContain('…');
    expect(out).not.toContain('...');
  });

  it('a FAILED retrieval prints an honest-absence line — never a quiet omission', () => {
    const out = renderGamesAsWritten('Seattle Mariners', [
      { gamePk: 104, date: '2026-08-26', label: 'vs Philadelphia Phillies', final: 'W 4-1', story: null, storyError: true },
    ]);
    expect(out).toContain('2026-08-26 vs Philadelphia Phillies W 4-1: recap retrieval failed this run');
    expect(out).toContain('treat as missing coverage, not a quiet game');
  });
});

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
