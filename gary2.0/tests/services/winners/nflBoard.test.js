import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/services/gary/agentic/orchestrator/sessionManager.js', () => ({ createModelSession: vi.fn(), sendToSessionWithRetry: vi.fn() }));
vi.mock('../../../src/services/gary/agentic/orchestrator/nflRead.js', () => ({ buildNflBoardEntry: vi.fn() }));
vi.mock('../../../src/services/sports/nfl/nflBettorData.js', () => ({ loadBettorData: vi.fn(), etDate: vi.fn() }));
const { parseBoardBets, boardDecisions } = await import('../../../src/services/winners/nflBoard.js');

const games = [
  { id: 1, gameId: '10', home: 'Philadelphia Eagles', away: 'Carolina Panthers' },
  { id: 2, gameId: '11', home: 'New England Patriots', away: 'New York Jets' },
  { id: 3, gameId: '12', home: 'Los Angeles Rams', away: 'Arizona Cardinals' },
];

describe('the NFL board', () => {
  it('reads the last JSON block, and nothing when there is none', () => {
    const text = 'I like two.\n```json\n{"bets": []}\n```\nOn second look:\n```json\n{"bets": [{"game": "Carolina Panthers at Philadelphia Eagles", "side": "Panthers", "why": "x"}]}\n```';
    expect(parseBoardBets(text)).toEqual([{ game: 'Carolina Panthers at Philadelphia Eagles', side: 'Panthers', why: 'x' }]);
    expect(parseBoardBets('No JSON here.')).toBeNull();
    expect(parseBoardBets('```json\n{"bets": []}\n```')).toEqual([]);
  });

  it('resolves each bet to the game and its full team name, in his order; every other game is a pass', () => {
    const out = boardDecisions(games, [
      { game: 'Jets at Patriots', side: 'New York Jets', why: 'a' },
      { game: 'Carolina Panthers at Philadelphia Eagles', side: 'Carolina', why: 'b' },
    ]);
    const by = Object.fromEntries(out.map((d) => [d.gameId, d]));
    expect(by['11']).toMatchObject({ decision: 'bet', side: 'New York Jets', rank: 1 });
    expect(by['10']).toMatchObject({ decision: 'bet', side: 'Carolina Panthers', rank: 2 });
    expect(by['12']).toMatchObject({ decision: 'pass', rank: null });
  });

  it('a city alone is not a side when both teams share it', () => {
    const ny = [{ id: 9, gameId: '20', home: 'New York Giants', away: 'New York Jets' }];
    expect(boardDecisions(ny, [{ game: 'Jets at Giants', side: 'New York' }])[0].decision).toBe('pass');
    expect(boardDecisions(ny, [{ game: 'Jets at Giants', side: 'Giants' }])[0]).toMatchObject({ decision: 'bet', side: 'New York Giants' });
  });

  it('takes a nickname as the side and ignores a bet on a game not on the board', () => {
    const out = boardDecisions(games, [{ game: 'Bills at Raiders', side: 'Bills' }, { game: 'Cardinals at Rams', side: 'Rams', why: 'c' }]);
    expect(out.filter((d) => d.decision === 'bet')).toEqual([expect.objectContaining({ gameId: '12', side: 'Los Angeles Rams', rank: 1 })]);
  });
});
