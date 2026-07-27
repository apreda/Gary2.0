import { describe, it, expect } from 'vitest';
import { buildGaryPropsSystemPrompt, THE_PROPS_ASK, buildPropBoard, statForProp, clearedClause } from '../../../src/services/pickdesk/propsBrain.js';

// The props prompt surface is a product contract (spec 2026-07-26-props-desk).
// These pins exist so no edit lands without failing a test first.
describe('props prompt surface', () => {
  it('system prompt is the approved contract, word for word', () => {
    const p = buildGaryPropsSystemPrompt('Sunday, July 26, 2026');
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

describe('buildPropBoard', () => {
  const props = [
    { player: 'Aaron Judge', team: 'Yankees', prop_type: 'hits', line: 1.5, over_odds: 160, under_odds: -210 },
    { player: 'Aaron Judge', team: 'Yankees', prop_type: 'home_runs', line: 0.5, over_odds: 410, under_odds: null },
    { player: 'Kyle Schwarber', team: 'Phillies', prop_type: 'total_bases', line: 1.5, over_odds: -125, under_odds: -105 },
  ];

  it('groups by player, prints prop keys verbatim, formats both market shapes', () => {
    const board = buildPropBoard(props);
    expect(board.text).toContain('═══ THE PROP BOARD (tonight\'s live prop prices) ═══');
    expect(board.text).toContain('Aaron Judge (Yankees): hits 1.5 (Over +160 / Under -210) · home_runs 0.5 (+410)');
    expect(board.text).toContain('Kyle Schwarber (Phillies): total_bases 1.5 (Over -125 / Under -105)');
    expect(board.players).toEqual(new Set(['aaron judge', 'kyle schwarber']));
  });

  it('drops players outside posted lineups and says so', () => {
    const board = buildPropBoard(props, { lineupNames: new Set(['aaron judge']) });
    expect(board.text).toContain('Aaron Judge');
    expect(board.text).not.toContain('Schwarber');
    expect(board.text).toContain('(Players not in tonight\'s lineups are off the board.)');
    expect(board.players).toEqual(new Set(['aaron judge']));
  });

  it('hrOnly keeps only home-run props', () => {
    const board = buildPropBoard(props, { hrOnly: true });
    expect(board.text).toContain('home_runs 0.5');
    expect(board.text).not.toContain('hits 1.5');
    expect(board.text).not.toContain('total_bases');
  });

  it('merges split over/under rows into one two-sided line — never prints null', () => {
    const board = buildPropBoard([
      { player: 'Dominic Canzone', team: 'Mariners', prop_type: 'total_bases', line: 1.5, over_odds: 142, under_odds: null },
      { player: 'Dominic Canzone', team: 'Mariners', prop_type: 'total_bases', line: 1.5, over_odds: null, under_odds: -165 },
      { player: 'Dominic Canzone', team: 'Mariners', prop_type: 'hits', line: 0.5, over_odds: null, under_odds: 155 },
    ]);
    expect(board.text).toContain('total_bases 1.5 (Over +142 / Under -165)');
    expect(board.text).toContain('hits 0.5 (Under +155)');
    expect(board.text).not.toContain('null');
  });

  it('empty input → empty board, no throw', () => {
    const board = buildPropBoard([], {});
    expect(board.text).toBe('');
    expect(board.players.size).toBe(0);
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

  it('board renders the clause as a trailing dash clause', () => {
    const chrono = new Map([['aaron judge', Array(15).fill(g(true))]]);
    const board = buildPropBoard(
      [{ player: 'Aaron Judge', team: 'Yankees', prop_type: 'total_bases', line: 1.5, over_odds: 120, under_odds: -150 }],
      { chronoByPlayer: chrono },
    );
    expect(board.text).toContain('total_bases 1.5 (Over +120 / Under -150) — over in 15 of his last 15');
    expect(board.text).not.toMatch(/%|rate/i);
  });
});
