import { afterEach, describe, expect, it, vi } from 'vitest';
import { winnersFlags, resultAlreadyCurrent } from '../../supabase/functions/grade-results/winners.ts';
import { admittedGameKeys, isWinnersGame } from '../../src/services/pickdesk/winnersBook.js';

const pick = { league: 'MLB', game_id: '42', pick: 'Mariners ML', odds: 150, homeTeam: 'Boston', awayTeam: 'Seattle', confidence: 0.51 };
const board = [{ game_date: '2026-09-04', league: 'MLB', kind: 'game', game_id: '42', pick_snapshot: pick }];

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

describe('Cloud Winners publication identity', () => {
  it('matches local grading on exact date, league, game, selection and price', () => {
    const boardKeys = admittedGameKeys(board);
    for (const changed of [{}, { game_id: '43' }, { game_id: null }, { league: 'NFL' }, { pick: 'Mariners +1.5' }, { odds: 140 }, { odds: null }]) {
      const current = { ...pick, ...changed };
      const cloud = winnersFlags('2026-09-04', [current], board)[0];
      const local = isWinnersGame({ gameDate: '2026-09-04', league: current.league, gameId: current.game_id, pickText: current.pick, odds: current.odds, boardKeys });
      expect(cloud).toBe(local);
      expect(cloud).toBe(Object.keys(changed).length === 0);
    }
    expect(winnersFlags('2026-09-05', [pick], board)).toEqual([false]);
  });

  it('keeps historical top three but cannot fall back to confidence on a missing current board', () => {
    const picks = Array.from({ length: 4 }, (_, i) => ({ ...pick, game_id: String(i), pick: `Team ${i} ML`, confidence: 0.5 + i / 10 }));
    expect(winnersFlags('2026-09-03', picks, [])).toEqual([false, true, true, true]);
    expect(winnersFlags('2026-09-04', picks, [])).toEqual([false, false, false, false]);
  });

  it('updates a changed Winners flag even when all result/score fields are unchanged', () => {
    const row = { game_id: '42', league: 'MLB', result: 'won', final_score: '3-2', is_winners_pick: true };
    expect(resultAlreadyCurrent(row, row)).toBe(true);
    expect(resultAlreadyCurrent(row, { ...row, is_winners_pick: false })).toBe(false);
    expect(resultAlreadyCurrent({ ...row, is_winners_pick: undefined }, row)).toBe(false);
    expect(resultAlreadyCurrent(row, { ...row, game_id: '43' })).toBe(false);
  });
});

async function edgeHandler() {
  let handler;
  vi.stubGlobal('Deno', { env: { get: name => name === 'SUPABASE_URL' ? 'https://test.invalid' : 'test-credential' }, serve: fn => { handler = fn; } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: vi.fn() });
  await import('../../supabase/functions/grade-results/index.ts');
  return handler;
}

describe('Read-only deployed selector verification', () => {
  it('returns actual selector decisions using GETs only, without provider calls or settlement', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([{ picks: [pick] }])).mockResolvedValueOnce(Response.json(board));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await edgeHandler();
    const response = await handler(new Request('https://test.invalid/grade-results?winners=1&date=2026-09-04'));
    expect(await response.json()).toMatchObject({ ok: true, read_only: true, policy: 'immutable-board', picks: [{ game_id: '42', odds: 150, is_winners_pick: true }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/v1/daily_picks?');
    expect(fetchMock.mock.calls[1][0]).toContain('/rest/v1/winners_board?');
    expect(fetchMock.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
    expect(globalThis.EdgeRuntime.waitUntil).not.toHaveBeenCalled();
  });

  it('propagates a failed board read without returning guessed flags or making writes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([{ picks: [pick] }])).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const handler = await edgeHandler();
    await expect(handler(new Request('https://test.invalid/grade-results?winners=1&date=2026-09-04'))).rejects.toThrow('winners_board GET 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(globalThis.EdgeRuntime.waitUntil).not.toHaveBeenCalled();
  });
});
