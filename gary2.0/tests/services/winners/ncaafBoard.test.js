import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/gary/agentic/orchestrator/sessionManager.js', () => ({ createModelSession: vi.fn(), sendToSessionWithRetry: vi.fn() }));
vi.mock('../../../src/services/gary/agentic/orchestrator/ncaafRead.js', () => ({ buildNcaafBoardEntry: vi.fn() }));

const { ncaafBoardDecisions } = await import('../../../src/services/winners/ncaafBoard.js');

const games = [
  { id: 1, gameId: '10', home: 'LSU Tigers', away: 'Auburn Tigers' },
  { id: 2, gameId: '20', home: 'Georgia Bulldogs', away: 'Mississippi State Bulldogs' },
  { id: 3, gameId: '30', home: 'Syracuse Orange', away: 'Louisville Cardinals' },
];

describe('college board decisions', () => {
  it('resolves teams that share a nickname by their full names, in his order', () => {
    const out = ncaafBoardDecisions(games, [
      { game: 'Mississippi State Bulldogs at Georgia Bulldogs', side: 'Mississippi State Bulldogs', why: 'a' },
      { game: 'Auburn Tigers at LSU Tigers', side: 'LSU Tigers', why: 'b' },
    ]);
    const byId = Object.fromEntries(out.map((d) => [d.id, d]));
    expect(byId[2]).toMatchObject({ decision: 'bet', side: 'Mississippi State Bulldogs', rank: 1 });
    expect(byId[1]).toMatchObject({ decision: 'bet', side: 'LSU Tigers', rank: 2 });
    expect(byId[3]).toMatchObject({ decision: 'pass', side: null, rank: null });
  });

  it('falls back to the NFL matching when the names are shortened', () => {
    const out = ncaafBoardDecisions(games, [{ game: 'Louisville at Syracuse', side: 'Louisville', why: 'c' }]);
    expect(out.find((d) => d.id === 3)).toMatchObject({ decision: 'bet', side: 'Louisville Cardinals', rank: 1 });
  });

  it('leaves a bet whose side names neither team off the board', () => {
    const out = ncaafBoardDecisions(games, [{ game: 'Auburn Tigers at LSU Tigers', side: 'Tigers', why: 'd' }]);
    expect(out.every((d) => d.decision === 'pass')).toBe(true);
  });
});
