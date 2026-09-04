import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {} }));
const { releaseBoards } = await import('../../../scripts/run-winners-board.js');

function clientWithPages({ failSecond = false } = {}) {
  const ranges = [];
  const client = {
    ranges, rpc: vi.fn(async () => ({ data: 0, error: null })),
    from() {
      let columns, offset = 0;
      const q = {
        select(value) { columns = value; return q; },
        gte() { return q; }, lte() { return q; }, eq() { return q; }, neq() { return q; }, order() { return q; },
        range(from, to) { offset = from; ranges.push([from, to]); return q; },
        then(resolve) {
          let data = [], error = null;
          if (columns === 'id,game_date,league,kind') {
            if (offset === 0) data = Array.from({ length: 1000 }, (_, id) => ({ id, game_date: '2026-09-04', league: 'MLB', kind: 'prop' }));
            else if (failSecond) error = { message: 'second page unavailable' };
            else data = [{ id: 1000, game_date: '2026-09-13', league: 'NFL', kind: 'game' }];
          }
          return Promise.resolve({ data, error }).then(resolve);
        },
      };
      return q;
    },
  };
  return client;
}

describe('Winners release across a growing ledger', () => {
  it('releases current-date groups beyond the API first page', async () => {
    const client = clientWithPages();
    await releaseBoards(client, '2026-09-13');
    expect(client.ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(client.rpc).toHaveBeenCalledWith('release_winners_board', { p_date: '2026-09-13', p_league: 'NFL', p_kind: 'game' });
    expect(client.rpc).toHaveBeenCalledTimes(2);
  });

  it('propagates an incomplete group read instead of silently dropping newer dates', async () => {
    const client = clientWithPages({ failSecond: true });
    await expect(releaseBoards(client, '2026-09-13')).rejects.toMatchObject({ message: 'second page unavailable' });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
