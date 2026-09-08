import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => ({ rpc: (...args: unknown[]) => { const response = mock.rpc(...args); return Object.assign(response, { setHeader: () => response }); }, auth: { getSession: mock.session } }) }));
import { fetchProfileSafety, fetchBlockedProfiles, reportProfile, setProfileBlock } from '@/lib/book/profile-safety';
import { saveMyProfile } from '@/lib/book/api';
beforeEach(() => { vi.resetAllMocks(); mock.session.mockResolvedValue({ data: { session: { user: { id: 'owner-a' }, access_token: 'fixture-token' } }, error: null }); });

describe('profile safety API boundary', () => {
  it('reports only the chosen public target and reason, leaving actor identity to the server', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, report_id: '10000000-0000-4000-8000-000000000001' }, error: null });
    expect(await reportProfile('target', 'spam', '  Useful context  ')).toBe('10000000-0000-4000-8000-000000000001');
    expect(mock.rpc).toHaveBeenCalledWith('report_profile', { p_user: 'target', p_reason: 'spam', p_details: 'Useful context' });
  });
  it.each([{ ok: false }, { ok: true }, null, { ok: true, report_id: '' }, { ok: true, report_id: 'not-a-uuid' }])('does not invent a report receipt from %j', async data => {
    mock.rpc.mockResolvedValue({ data, error: null });
    await expect(reportProfile('target', 'spam', '')).rejects.toThrow('could not be confirmed');
  });
  it('does not claim a block succeeded when the returned state disagrees', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, blocked: false }, error: null });
    await expect(setProfileBlock('target', true)).rejects.toThrow('could not be confirmed');
  });
  it('keeps failed private reads distinct from an empty block list', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(fetchBlockedProfiles()).rejects.toThrow('could not be confirmed');
    mock.rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchBlockedProfiles()).toEqual([]);
    mock.rpc.mockResolvedValue({ data: [null], error: null });
    await expect(fetchBlockedProfiles()).rejects.toThrow('could not be confirmed');
  });
  it('uses only the owner RPC to retrieve block state and rejects malformed responses', async () => {
    mock.rpc.mockResolvedValue({ data: { blocked: true, is_owner: false, my_profile_hidden: false }, error: null });
    expect((await fetchProfileSafety('target')).blocked).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith('get_profile_safety', { p_user: 'target' });
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    await expect(fetchProfileSafety('target')).rejects.toThrow();
    mock.rpc.mockResolvedValue({ data: { blocked: false, is_owner: true }, error: null });
    await expect(fetchProfileSafety('target')).rejects.toThrow();
  });
  it('explains rate-limit recovery without exposing server diagnostics', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'report limit reached; internal_table=reports' } });
    await expect(reportProfile('target', 'spam', '')).rejects.toThrow('contact support');
    await expect(reportProfile('target', 'spam', '')).rejects.not.toThrow('internal_table');
  });
  it('explains rejected profile content instead of a misleading handle-format error', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'profile text is not allowed; remove abusive wording' } });
    await expect(saveMyProfile({ bio: 'fixture rejected content' }, 'owner-a')).rejects.toThrow('without abusive wording');
  });
});
