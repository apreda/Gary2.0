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
import { selectStoryGames, renderGamesAsWritten, buildPenPressQuery } from '../../../src/services/agentic/scoutReport/sports/mlbGamesAsWritten.js';

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

describe('renderGamesAsWritten — whole articles, silence over reconstruction', () => {
  it('prints the full body untrimmed and drops story-less games silently', () => {
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
