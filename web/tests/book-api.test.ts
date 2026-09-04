import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), getUser: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({
  supabaseBrowser: () => ({ rpc: mock.rpc, from: mock.from, auth: { getUser: mock.getUser } }),
}));
import {
  deleteBet,
  fetchMyBets,
  fetchMyProfile,
  fetchRankings,
  gradeManual,
  placePropBet,
} from '@/lib/book/api';

beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
});
function readQuery(pages: { data: unknown[] | null; error: { message: string } | null }[]) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.order.mockReturnValue(q);
  pages.forEach((p) => q.range.mockResolvedValueOnce(p));
  mock.from.mockReturnValue(q);
  return q;
}
describe('Book data boundary', () => {
  it('loads full history beyond the former 400-row cap and scopes every page to the owner', async () => {
    const q = readQuery([
      { data: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })), error: null },
      { data: [{ id: '500' }], error: null },
    ]);
    expect(await fetchMyBets()).toHaveLength(501);
    expect(q.range.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(q.eq.mock.calls).toEqual([
      ['user_id', 'owner'],
      ['user_id', 'owner'],
    ]);
  });
  it('never turns a partial history fetch failure into a false record', async () => {
    readQuery([
      { data: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })), error: null },
      { data: null, error: { message: 'unavailable' } },
    ]);
    await expect(fetchMyBets()).rejects.toThrow('could not load');
  });
  it('rejects a stale session before requesting any bet rows', async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(fetchMyBets()).rejects.toThrow('session has ended');
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('profile is fetched through the owner RPC instead of the first public profile', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, profile: null, preferences: null }, error: null });
    await fetchMyProfile();
    expect(mock.rpc).toHaveBeenCalledWith('get_my_profile');
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('keeps leaderboard outage distinct from an empty board', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(fetchRankings('30d', 'streak', 'MLB')).rejects.toThrow('leaderboard could not load');
  });
  it('uses exact prop identity and streak flag when a ticket has full source data', async () => {
    mock.rpc.mockResolvedValue({ data: { id: 'b' }, error: null });
    await placePropBet({
      gameDate: '2026-09-04',
      player: 'Judge',
      propType: 'hits',
      kind: 'tail',
      stake: 1,
      gameId: 'game-2',
      line: 1.5,
      side: 'over',
      streak: true,
    });
    expect(mock.rpc).toHaveBeenCalledWith(
      'place_user_prop_bet_v2',
      expect.objectContaining({ p_game_id: 'game-2', p_line: 1.5, p_side: 'over', p_streak: true }),
    );
  });
  it('does not claim a blocked deletion succeeded when RLS affected zero rows', async () => {
    const q = { delete: vi.fn(), eq: vi.fn(), select: vi.fn() };
    q.delete.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.select.mockResolvedValue({ data: [], error: null });
    mock.from.mockReturnValue(q);
    await expect(deleteBet('locked')).rejects.toThrow('locked');
  });
  it('does not claim a missing manual bet was graded', async () => {
    const q = { update: vi.fn(), eq: vi.fn(), select: vi.fn() };
    q.update.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.select.mockResolvedValue({ data: [], error: null });
    mock.from.mockReturnValue(q);
    await expect(gradeManual('missing', 'won', 1)).rejects.toThrow('could not be updated');
  });
});
