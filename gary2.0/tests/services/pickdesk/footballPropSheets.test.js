import { describe, it, expect } from 'vitest';
import {
  buildFootballPropSheets,
  seasonClause,
  marketLine,
  usageLine,
} from '../../../src/services/pickdesk/footballPropSheets.js';
import { nflStatForProp, calculateNflHitRate } from '../../../src/services/agentic/nflPropsAgenticContext.js';
import { buildNflEvidenceMaps, clearedCountClause } from '../../../src/services/pickdesk/footballPropsDesk.js';

const qbGame = (pass, att, tds = 1) => ({
  pass_yds: pass, pass_att: att, pass_tds: tds, pass_comp: Math.round(att * 0.65),
  rush_yds: 20, rush_att: 4, rush_tds: 0, rec_yds: 0, receptions: 0, targets: 0, rec_tds: 0,
});
const wrGame = (rec, yds, tds = 0) => ({
  pass_yds: 0, pass_att: 0, pass_tds: 0, rush_yds: 0, rush_att: 0, rush_tds: 0,
  rec_yds: yds, receptions: rec, targets: rec + 2, rec_tds: tds,
});

const ALLEN = 'josh allen';
const priorAllen = { games: [qbGame(317, 33), qbGame(194, 28), qbGame(232, 31)] };

describe('THE NFL PROP SHEETS', () => {
  it('prints last year alone, labeled, when the season has no games yet (Week 1)', () => {
    const out = buildFootballPropSheets({
      markets: [{ player: 'Josh Allen', team: 'Buffalo Bills', prop_type: 'player_pass_yds', line: 248.5, over_odds: -115, under_odds: -105 }],
      gamesByName: new Map(),
      priorGamesByName: new Map([[ALLEN, priorAllen]]),
      positionByName: new Map([[ALLEN, 'QB']]),
      seasonLabel: '2026',
      priorSeasonLabel: '2025',
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'Buffalo Bills',
    });

    expect(out.players).toBe(1);
    expect(out.text).toContain('BUFFALO BILLS (away)');
    expect(out.text).toContain('Josh Allen (QB)');
    expect(out.text).toContain('player_pass_yds 248.5 (Over -115 / Under -105) — 2025: 317 194 232 (3 g, 247.7 per game)');
    // Never this year's label on last year's numbers.
    expect(out.text).not.toContain('2026:');
  });

  it('leads with this season once it has games, and keeps last year behind it', () => {
    const out = buildFootballPropSheets({
      markets: [{ player: 'Josh Allen', team: 'Buffalo Bills', prop_type: 'player_pass_yds', line: 248.5, over_odds: -115 }],
      gamesByName: new Map([[ALLEN, { games: [qbGame(311, 35), qbGame(244, 30)] }]]),
      priorGamesByName: new Map([[ALLEN, priorAllen]]),
      positionByName: new Map([[ALLEN, 'QB']]),
      seasonLabel: '2026',
      priorSeasonLabel: '2025',
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'Buffalo Bills',
    });

    const line = out.text.split('\n').find((l) => l.includes('player_pass_yds'));
    expect(line).toContain('2026: 311 244 (2 g, 277.5 per game)');
    expect(line.indexOf('2026:')).toBeLessThan(line.indexOf('2025:'));
    // The usage frame comes from the window in front.
    expect(out.text).toContain('per game (2026)');
  });

  it('counts touchdowns instead of averaging them', () => {
    const clause = seasonClause([wrGame(6, 84, 1), wrGame(3, 41), wrGame(5, 60, 1)], 'anytime_td', '2025');
    expect(clause).toBe('2025: 1 0 1 (3 g, scored in 2)');
  });

  it('prints nothing for a player with no games in either season', () => {
    const out = buildFootballPropSheets({
      markets: [{ player: 'Rookie Unknown', team: 'Buffalo Bills', prop_type: 'player_rec_yds', line: 24.5, over_odds: -110 }],
      gamesByName: new Map(),
      priorGamesByName: new Map(),
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'Buffalo Bills',
    });
    expect(out.text).toBe('');
    expect(out.players).toBe(0);
  });

  it('files a player whose team the book spells its own way under ALSO ON THE BOARD', () => {
    const out = buildFootballPropSheets({
      markets: [{ player: 'Josh Allen', team: 'BUF Bills O', prop_type: 'player_pass_yds', line: 248.5, over_odds: -110 }],
      gamesByName: new Map(),
      priorGamesByName: new Map([[ALLEN, priorAllen]]),
      seasonLabel: '2026',
      priorSeasonLabel: '2025',
      homeTeam: 'Kansas City Chiefs',
      awayTeam: 'New York Jets',
    });
    expect(out.text).toContain('ALSO ON THE BOARD');
    expect(out.players).toBe(1);
  });

  it('reads the same values the cleared count reads', () => {
    const games = [wrGame(6, 84, 1), wrGame(3, 41), wrGame(5, 60), wrGame(7, 96, 1)];
    const clause = seasonClause(games, 'player_receptions', '2025');
    const count = calculateNflHitRate(games, 'player_receptions', 4.5);

    expect(games.map((g) => nflStatForProp(g, 'player_receptions'))).toEqual([6, 3, 5, 7]);
    expect(clause).toBe('2025: 6 3 5 7 (4 g, 5.3 per game)');
    expect(count.hitsOver).toBe(3);
  });

  it('renders a market line only when a season has numbers behind it', () => {
    expect(marketLine('player_rec_yds', 24.5, 'Over -110', [null, null])).toBeNull();
    expect(marketLine('player_rec_yds', 24.5, 'Over -110', [null, '2025: 30 18 (2 g, 24.0 per game)']))
      .toBe('player_rec_yds 24.5 (Over -110) — 2025: 30 18 (2 g, 24.0 per game)');
  });

  it('frames usage by the volume the position actually gets', () => {
    expect(usageLine([qbGame(300, 32), qbGame(250, 28)], '2025')).toBe('30.0 pass attempts, 4.0 carries per game (2025)');
    expect(usageLine([wrGame(6, 84), wrGame(4, 52)], '2025')).toBe('7.0 targets per game (2025)');
    expect(usageLine([], '2025')).toBeNull();
  });
});

// ═══ The Week 1 carry, as the desk assembles it ═════════════════════════════
describe('the NFL evidence maps (the Week 1 carry)', () => {
  const context = {
    dataWindow: { season: 2026, priorSeason: 2025 },
    propCandidates: [
      { player: 'Josh Allen', playerId: 38 },
      { player: 'James Cook', playerId: 99 },
      { player: 'No Id Here', playerId: null },
    ],
    playerGameLogs: { 99: { games: [wrGame(4, 30), wrGame(5, 44)] } },
    priorGameLogs: {
      38: { games: [qbGame(317, 33), qbGame(194, 28), qbGame(232, 31)] },
      99: { games: [wrGame(6, 84, 1), wrGame(3, 41), wrGame(5, 60), wrGame(7, 96, 1)] },
    },
    playerSeasonStats: {},
    priorSeasonStats: { 38: { player: { position_abbreviation: 'QB' } } },
  };

  it('carries last season for a player with no games this season', () => {
    const { gamesByName, priorGamesByName, countingWindow, positionByName } = buildNflEvidenceMaps(context);

    expect(gamesByName.has('josh allen')).toBe(false);
    expect(priorGamesByName.get('josh allen').games).toHaveLength(3);
    expect(countingWindow.get('josh allen').label).toBe('2025');
    expect(positionByName.get('josh allen')).toBe('QB');
  });

  it('keeps counting last season until this season has three games of its own', () => {
    const { countingWindow } = buildNflEvidenceMaps(context);
    // Two games this season is not yet a count; last season still carries it.
    expect(countingWindow.get('james cook').label).toBe('2025');
    expect(countingWindow.get('james cook').games).toHaveLength(4);

    const grown = buildNflEvidenceMaps({
      ...context,
      playerGameLogs: { 99: { games: [wrGame(4, 30), wrGame(5, 44), wrGame(6, 71)] } },
    });
    expect(grown.countingWindow.get('james cook').label).toBe('2026');
    expect(grown.countingWindow.get('james cook').games).toHaveLength(3);
  });

  it('skips a board name with no resolved player id', () => {
    const { countingWindow } = buildNflEvidenceMaps(context);
    expect(countingWindow.has('no id here')).toBe(false);
  });

  it('names the season inside the cleared count', () => {
    const { countingWindow } = buildNflEvidenceMaps(context);
    expect(clearedCountClause(countingWindow, 'james cook', 'player_receptions', 4.5))
      .toBe('over in 3 of his last 4 games in 2025');
    expect(clearedCountClause(countingWindow, 'nobody', 'player_receptions', 4.5)).toBeNull();
  });
});
