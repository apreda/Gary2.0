import { describe, it, expect } from 'vitest';
import { buildGaryPropsSystemPrompt, THE_PROPS_ASK, buildPropBoard } from '../../../src/services/pickdesk/propsBrain.js';

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

  it('empty input → empty board, no throw', () => {
    const board = buildPropBoard([], {});
    expect(board.text).toBe('');
    expect(board.players.size).toBe(0);
  });
});
