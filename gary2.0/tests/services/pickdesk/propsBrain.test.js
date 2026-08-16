import { describe, it, expect } from 'vitest';
import { buildGaryPropsSystemPrompt, THE_PROPS_ASK, buildPropBoardV2, selectPrimaryMarkets, statForProp, clearedClause, resolvedConfirmedLineupNames } from '../../../src/services/pickdesk/propsBrain.js';
import { propOddsService } from '../../../src/services/propOddsService.js';

// The props prompt surface is a product contract (spec 2026-07-26-props-desk).
// These pins exist so no edit lands without failing a test first.
describe('props prompt surface', () => {
  it('system prompt is the approved contract, word for word', () => {
    const p = buildGaryPropsSystemPrompt('Sunday, July 26, 2026');
    // Aug 10 2026 (founder order): the price sentence — the last value lens
    // anywhere in a Gary contract — removed; the game desk buried its twin
    // in era 41ca4244054e.
    expect(p).toBe(`Today is Sunday, July 26, 2026. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.

Each prop you take publishes as its own card with its own "Gary's Take" — the reasoning is yours. No emojis. Never mention data feeds, tools, or missing data.`);
  });

  it('the ask is the approved contract and allows passing', () => {
    expect(THE_PROPS_ASK).toContain('Pick the prop bets you want from tonight\'s board — an empty list means you pass this game.');
    expect(THE_PROPS_ASK).toContain('fresh news — today\'s scratch — is the exception');
    expect(THE_PROPS_ASK).toContain('"prop_type": "[key from the board]"');
    expect(THE_PROPS_ASK).toContain('confidence_score (0.50–1.00)');
    // No steering, no strategy, no menu explanations beyond the output contract.
    expect(THE_PROPS_ASK).not.toMatch(/value|edge|sharp|favor|prefer|target/i);
  });
});

describe('shared confirmed lineup', () => {
  it('reads both batting orders and starting pitchers from the resolved desk scout', () => {
    const names = resolvedConfirmedLineupNames({
      confirmedLineups: {
        home: { batters: [{ name: 'Aaron Judge' }], pitcher: { name: 'Gerrit Cole' } },
        away: { batters: [{ name: 'Rafael Devers' }], pitcher: { name: 'Garrett Crochet' } },
      },
    });
    expect(names).toEqual(new Set(['aaron judge', 'gerrit cole', 'rafael devers', 'garrett crochet']));
  });

  it('never fails open when the desk did not return a structured lineup', () => {
    expect(resolvedConfirmedLineupNames({})).toBeNull();
  });
});

describe('cleared counts (founder: past-tense counts, never rates)', () => {
  const g = (over) => ({ at_bats: 4, hits: over ? 2 : 0, doubles: over ? 1 : 0, triples: 0, hr: 0, runs: 0, rbi: 0, bb: 0, k: 1, total_bases: over ? 3 : 0, stolen_bases: 0 });

  it('statForProp maps derived markets correctly', () => {
    const row = { at_bats: 4, hits: 3, doubles: 1, triples: 0, hr: 1, runs: 2, rbi: 2, bb: 1, k: 0, total_bases: 7, stolen_bases: 0 };
    expect(statForProp(row, 'singles')).toBe(1);            // 3 H − 1 2B − 1 HR
    expect(statForProp(row, 'hits_runs_rbis')).toBe(7);     // 3+2+2
    expect(statForProp(row, 'extra_base_hits')).toBe(2);    // 1 2B + 1 HR
    expect(statForProp({ ip: '6.2', p_k: 7 }, 'pitcher_outs')).toBe(20);
    expect(statForProp({ ip: '6.2', p_k: 7 }, 'pitcher_strikeouts')).toBe(7);
  });

  it('counts games over the exact line, count form, hitter window 15', () => {
    const rows = [...Array(10).fill(g(true)), ...Array(5).fill(g(false))];
    expect(clearedClause(rows, 'total_bases', 1.5)).toBe('over in 10 of his last 15');
    expect(clearedClause(rows, 'hits', 0.5)).toBe('over in 10 of his last 15');
  });

  it('thin samples say nothing (no noisy 1-of-2 counts)', () => {
    expect(clearedClause([g(true), g(true)], 'hits', 0.5)).toBeNull();
    expect(clearedClause(null, 'hits', 0.5)).toBeNull();
  });

});

// ═══ Board V2 (Aug 3 2026): markets, not filtered scrape rows ═══════════════

describe('isOddsTakeable (the window as a BET rule)', () => {
  it('holds the exact legacy window edges', () => {
    expect(propOddsService.isOddsTakeable(-200, 'hits')).toBe(true);
    expect(propOddsService.isOddsTakeable(-201, 'hits')).toBe(false);
    expect(propOddsService.isOddsTakeable(400, 'hits')).toBe(true);
    expect(propOddsService.isOddsTakeable(401, 'hits')).toBe(false);
    expect(propOddsService.isOddsTakeable(null, 'hits')).toBe(false);
  });
  it('keeps the home_runs +900 fun-lane override', () => {
    expect(propOddsService.isOddsTakeable(900, 'home_runs')).toBe(true);
    expect(propOddsService.isOddsTakeable(901, 'home_runs')).toBe(false);
  });
});

describe('selectPrimaryMarkets', () => {
  it('prefers a fully-takeable line over a closer-to-even line with an off-window side', () => {
    const { rows } = selectPrimaryMarkets([
      { player: 'A', prop_type: 'total_bases', line: 1.5, over_odds: 350, under_odds: -195 },  // both takeable, unbalanced
      { player: 'A', prop_type: 'total_bases', line: 0.5, over_odds: -215, under_odds: 160 },  // closer to even, over off-window
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(1.5);
  });

  it('falls back to closest-to-even when no line is fully takeable', () => {
    const { rows } = selectPrimaryMarkets([
      { player: 'A', prop_type: 'hits', line: 0.5, over_odds: -215, under_odds: 160 },
      { player: 'A', prop_type: 'hits', line: 1.5, over_odds: 200, under_odds: -268 },
      { player: 'A', prop_type: 'hits', line: 2.5, over_odds: 650, under_odds: -1000 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(0.5); // |0.68 − 0.38| beats |0.33 − 0.73|
  });

  it('breaks a balance tie toward the lower line', () => {
    const { rows } = selectPrimaryMarkets([
      { player: 'A', prop_type: 'hits', line: 1.5, over_odds: -110, under_odds: -120 },
      { player: 'A', prop_type: 'hits', line: 0.5, over_odds: -120, under_odds: -110 },
    ]);
    expect(rows[0].line).toBe(0.5);
  });

  it('drops a market where NEITHER side is inside the bet window, and counts it', () => {
    const { rows, stats } = selectPrimaryMarkets([
      { player: 'D', prop_type: 'stolen_bases', line: 0.5, over_odds: 1120, under_odds: -2300 },
    ]);
    expect(rows).toHaveLength(0);
    expect(stats.dropped_no_takeable_side).toBe(1);
  });

  it('keeps a one-takeable-side market (the gate guards the dead side)', () => {
    const { rows } = selectPrimaryMarkets([
      { player: 'E', prop_type: 'walks', line: 0.5, over_odds: 354, under_odds: -537 },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('drops a core player-prop with no two-sided line anywhere, and counts it', () => {
    const { rows, stats } = selectPrimaryMarkets([
      { player: 'B', prop_type: 'rbis', line: 1.5, over_odds: 300, under_odds: null },
      { player: 'B', prop_type: 'rbis', line: 2.5, over_odds: 750, under_odds: null },
    ]);
    expect(rows).toHaveLength(0);
    expect(stats.dropped_one_sided_pairs).toBe(1);
  });

  it('home runs are the sanctioned one-sided exception — every takeable rung stays', () => {
    const { rows, stats } = selectPrimaryMarkets([
      { player: 'C', prop_type: 'home_runs', line: 0.5, over_odds: 410, under_odds: null },
      { player: 'C', prop_type: 'home_runs', line: 1.5, over_odds: 950, under_odds: null },  // beyond the 900 cap
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(0.5);
    expect(stats.over_only).toBe(1);
    expect(stats.dropped_one_sided_pairs).toBe(0);
  });

  it('stamps an honest composition record', () => {
    const { stats } = selectPrimaryMarkets([
      { player: 'A', prop_type: 'hits', line: 0.5, over_odds: -150, under_odds: 120 },
      { player: 'C', prop_type: 'home_runs', line: 0.5, over_odds: 410, under_odds: null },
    ]);
    expect(stats).toMatchObject({ board_version: 2, markets: 2, two_sided: 1, over_only: 1, under_only: 0, two_sided_pct: 50 });
  });
});

describe('buildPropBoardV2', () => {
  const markets = [
    { player: 'Aaron Judge', team: 'Yankees', prop_type: 'hits', line: 0.5, over_odds: -190, under_odds: 146 },
    { player: 'Aaron Judge', team: 'Yankees', prop_type: 'hits', line: 1.5, over_odds: 200, under_odds: -268 },
    { player: 'Aaron Judge', team: 'Yankees', prop_type: 'home_runs', line: 0.5, over_odds: 410, under_odds: null },
    { player: 'Kyle Schwarber', team: 'Phillies', prop_type: 'total_bases', line: 1.5, over_odds: -125, under_odds: -105 },
    { player: 'Kyle Schwarber', team: 'Phillies', prop_type: 'rbis', line: 1.5, over_odds: 320, under_odds: null }, // rung-only pair: off the board
  ];

  it('one labeled market per player-prop — rungs collapsed, never a bare number', () => {
    const board = buildPropBoardV2(markets);
    expect(board.text).toContain('Aaron Judge (Yankees): hits 0.5 (Over -190 / Under +146) · home_runs 0.5 (Over +410)');
    expect(board.text).toContain('Kyle Schwarber (Phillies): total_bases 1.5 (Over -125 / Under -105)');
    expect(board.text).not.toContain('hits 1.5');            // rung collapsed into the primary
    expect(board.text).not.toContain('rbis');                // one-sided core pair is off the board
    expect(board.text).not.toMatch(/\(\+\d/);                // no bare positive price
    expect(board.text).not.toMatch(/\(-\d/);                 // no bare negative price
    expect(board.players).toEqual(new Set(['aaron judge', 'kyle schwarber']));
  });

  it('reports composition stats for the pick stamp', () => {
    const board = buildPropBoardV2(markets);
    expect(board.stats).toMatchObject({ board_version: 2, markets: 3, two_sided: 2, over_only: 1, dropped_one_sided_pairs: 1 });
  });

  it('keeps the lineup gate and its note', () => {
    const board = buildPropBoardV2(markets, { lineupNames: new Set(['aaron judge']) });
    expect(board.text).toContain('Aaron Judge');
    expect(board.text).not.toContain('Schwarber');
    expect(board.text).toContain('(Players not in tonight\'s lineups are off the board.)');
  });

  it('hrOnly keeps only labeled home-run rungs', () => {
    const board = buildPropBoardV2(markets, { hrOnly: true });
    expect(board.text).toContain('home_runs 0.5 (Over +410)');
    expect(board.text).not.toContain('hits');
    expect(board.text).not.toContain('total_bases');
  });

  it('renders cleared clauses on the primary market', () => {
    const g = { at_bats: 4, hits: 2, doubles: 0, triples: 0, hr: 0, runs: 1, rbi: 1, bb: 0, k: 1, total_bases: 2, stolen_bases: 0 };
    const chrono = new Map([['aaron judge', Array(15).fill(g)]]);
    const board = buildPropBoardV2(markets, { chronoByPlayer: chrono });
    expect(board.text).toContain('hits 0.5 (Over -190 / Under +146) — over in 15 of his last 15');
  });

  it('empty input → empty board, null stats, no throw', () => {
    const board = buildPropBoardV2([], {});
    expect(board.text).toBe('');
    expect(board.players.size).toBe(0);
    expect(board.stats).toBeNull();
  });
});
