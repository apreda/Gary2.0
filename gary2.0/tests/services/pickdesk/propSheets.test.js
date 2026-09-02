import { describe, it, expect } from 'vitest';
import {
  buildPropSheets, hitterMarketLine, pitcherMarketLine, pitchCountLine, paPerGame, handsFaced, pitcherStarts, lineupTendencies,
} from '../../../src/services/pickdesk/propSheets.js';

// Oldest → newest, the chrono contract.
const hitterRows = (vals) => vals.map((tb, i) => ({
  plate_appearances: 4, at_bats: 4, hits: tb > 0 ? 1 : 0, total_bases: tb, hr: tb === 4 ? 1 : 0, rbi: 0, runs: 0, bb: 0, k: 1,
  doubles: tb === 2 ? 1 : 0, triples: 0, stolen_bases: 0, _game: { date: `2026-08-${String(i + 1).padStart(2, '0')}` },
}));
const starts = (ks) => ks.map((k, i) => ({
  ip: 6, pitching_outs: 18, p_k: k, p_bb: 1, p_hits: 5, er: 2, games_started: 1, pitch_count: 90 + i,
}));

describe('prop sheet lines', () => {
  it('a hitter market prints the last 15 values newest first and the season rate', () => {
    const rows = hitterRows([0, 1, 2, 0, 4, 1, 1, 0, 3, 1, 2, 0, 1, 0, 2, 1, 1]); // 17 games
    const line = hitterMarketLine(rows, 'total_bases', 1.5, 'Over -120 / Under -105');
    expect(line).toBe('total_bases 1.5 (Over -120 / Under -105) — last 15: 1 1 2 0 1 0 2 1 3 0 1 1 4 0 2 · season 1.2 per game (17 g)');
  });
  it('a derived market (hits+runs+rbis) settles on the same arithmetic the grader uses', () => {
    const rows = [{ plate_appearances: 4, hits: 2, runs: 1, rbi: 1 }, { plate_appearances: 3, hits: 0, runs: 0, rbi: 0 }];
    expect(hitterMarketLine(rows, 'hits_runs_rbis', 1.5, null)).toBe('hits_runs_rbis 1.5 — last 2: 0 4 · season 2.0 per game (2 g)');
  });
  it('a pitcher market uses starts only, newest first, outs from the box', () => {
    const rows = [...starts([7, 5, 9, 4, 6, 8, 3, 6, 5]), { ip: 1, pitching_outs: 3, p_k: 2, games_started: 0 }];
    expect(pitcherMarketLine(rows, 'pitcher_strikeouts', 5.5, 'Over -115 / Under -105'))
      .toBe('pitcher_strikeouts 5.5 (Over -115 / Under -105) — last 8 starts: 5 6 3 8 6 4 9 5 · season 5.9 per start (9 starts)');
    expect(pitcherMarketLine(rows, 'pitcher_outs', 17.5, null)).toContain('last 8 starts: 18 18 18 18 18 18 18 18');
    expect(pitchCountLine(rows)).toBe('pitches, last 8 starts: 98 97 96 95 94 93 92 91');
    expect(pitcherStarts(rows)).toHaveLength(9);
  });
  it('says nothing where the feed has nothing', () => {
    expect(hitterMarketLine([], 'hits', 0.5, null)).toBeNull();
    expect(pitcherMarketLine(null, 'pitcher_outs', 15.5, null)).toBeNull();
    expect(pitchCountLine(starts([5]).map((r) => ({ ...r, pitch_count: null })))).toBeNull();
    expect(paPerGame([])).toBeNull();
  });
  it('lineup tendencies read the opposing nine from the rows on hand, and say how many were covered', () => {
    const rows = [{ plate_appearances: 4, at_bats: 4, k: 1, bb: 0 }, { plate_appearances: 5, at_bats: 4, k: 2, bb: 1 }];
    const chrono = new Map(['a', 'b', 'c', 'd', 'e'].map((n) => [n, rows]));
    const nine = [...'abcdefghi'].map((n) => ({ name: n }));
    expect(lineupTendencies(nine, chrono)).toBe("tonight's nine, season: 33 of every 100 plate appearances a strikeout, 11 a walk (5 of 9 with numbers)");
    expect(lineupTendencies(nine, new Map([['a', rows]]))).toBeNull();
  });

  it('hands faced counts the lineup by bat side', () => {
    expect(handsFaced([{ batsThrows: 'L/R' }, { batsThrows: 'R/R' }, { batsThrows: 'S/R' }, { batsThrows: 'L/L' }, { batsThrows: '?' }]))
      .toBe('2 LHB / 1 RHB / 1 switch / 1 unlisted');
    expect(handsFaced([])).toBeNull();
  });
});

describe('buildPropSheets', () => {
  const markets = [
    { player: 'Brendan Donovan', team: 'STL', prop_type: 'hits', line: 0.5, over_odds: -180, under_odds: 140 },
    { player: 'Brendan Donovan', team: 'STL', prop_type: 'total_bases', line: 1.5, over_odds: 105, under_odds: -135 },
    { player: 'Yoshinobu Yamamoto', team: 'LAD', prop_type: 'pitcher_strikeouts', line: 6.5, over_odds: -115, under_odds: -105 },
    { player: 'Shohei Ohtani', team: 'LAD', prop_type: 'home_runs', line: 0.5, over_odds: 240, under_odds: null },
    { player: 'Some Reliever', team: 'LAD', prop_type: 'pitcher_strikeouts', line: 1.5, over_odds: -110, under_odds: -110 },
  ];
  const chrono = new Map([
    ['brendan donovan', hitterRows([1, 0, 2, 1, 1, 0])],
    ['yoshinobu yamamoto', starts([8, 9, 5, 7])],
    ['shohei ohtani', hitterRows([4, 0, 1, 4])],
    ['some reliever', [{ ip: 1, pitching_outs: 3, p_k: 2, games_started: 0 }]],
  ]);
  const lineups = {
    away: { batters: [{ name: 'Brendan Donovan', battingOrder: 1, position: '2B', batsThrows: 'L/R' }], pitcher: { name: 'Michael McGreevy', batsThrows: 'R/R' } },
    home: { batters: [{ name: 'Shohei Ohtani', battingOrder: 1, position: 'DH', batsThrows: 'L/R' }, { name: 'Mookie Betts', battingOrder: 2, batsThrows: 'R/R' }], pitcher: { name: 'Yoshinobu Yamamoto', batsThrows: 'R/R' } },
  };

  it('walks each lineup in batting order, then the starter, with the frame on every header', () => {
    const { text, players } = buildPropSheets({ markets, chronoByPlayer: chrono, lineups, homeTeam: 'Dodgers', awayTeam: 'Cardinals' });
    expect(players).toBe(4);
    expect(text.startsWith('═══ THE PROP SHEETS — the numbers each market settles on, newest first ═══')).toBe(true);
    expect(text.indexOf('CARDINALS (away)')).toBeLessThan(text.indexOf('DODGERS (home)'));
    expect(text).toContain('1st Brendan Donovan (L) 2B · vs RHP Yoshinobu Yamamoto · 4.0 PA per game');
    expect(text).toContain('   hits 0.5 (Over -180 / Under +140) — last 6: 0 1 1 1 0 1 · season 0.7 per game (6 g)');
    expect(text).toContain('   total_bases 1.5 (Over +105 / Under -135) — last 6: 0 1 1 2 0 1');
    expect(text).toContain('1st Shohei Ohtani (L) DH · vs RHP Michael McGreevy');
    expect(text).toContain('   home_runs 0.5 (Over +240) — last 4: 1 0 0 1');
    expect(text).toContain('SP Yoshinobu Yamamoto (R) · faces 1 LHB / 0 RHB');
    expect(text).toContain('   pitcher_strikeouts 6.5 (Over -115 / Under -105) — last 4 starts: 7 5 9 8 · season 7.3 per start (4 starts)');
    expect(text).toContain('   pitches, last 4 starts: 93 92 91 90');
    // The reliever is not in either lineup: his numbers still print, under ALSO ON THE BOARD.
    expect(text).toContain('ALSO ON THE BOARD\nSome Reliever (LAD)\n   pitcher_strikeouts 1.5 (Over -110 / Under -110) — last 1 starts: 2');
    // A lineup batter with no market prints nothing.
    expect(text).not.toContain('Mookie Betts');
  });

  it('is empty, not broken, without markets or without rows', () => {
    expect(buildPropSheets({ markets: [], chronoByPlayer: chrono, lineups, homeTeam: 'A', awayTeam: 'B' })).toEqual({ text: '', players: 0 });
    expect(buildPropSheets({ markets, chronoByPlayer: new Map(), lineups: null, homeTeam: 'A', awayTeam: 'B' })).toEqual({ text: '', players: 0 });
  });
});
