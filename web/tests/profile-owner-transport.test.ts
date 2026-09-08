import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
const f = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => f.client }));
import { logManual, saveMyProfile } from '@/lib/book/api';

const session = (id: string) => ({ data: { session: { user: { id }, access_token: `fixture-token-${id}` } as Session }, error: null });
let client: SupabaseClient;
let transport: ReturnType<typeof vi.fn>;
beforeEach(() => {
  transport = vi.fn(async () => new Response(JSON.stringify({ ok: true, profile: null, preferences: { favorite_sports: ['MLB'], unit_value: 25 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  client = createClient('https://fixture.invalid', 'fixture-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport as typeof fetch },
  });
  f.client = client;
});
afterEach(() => vi.restoreAllMocks());

describe('profile save uses the checked owner through actual SDK transport', () => {
  it('pins A authorization when the SDK token lookup changes to B after the account guard', async () => {
    let tokenLookup!: (value: ReturnType<typeof session>) => void;
    const getSession = vi.spyOn(client.auth, 'getSession')
      .mockResolvedValueOnce(session('owner-a'))
      .mockImplementationOnce(() => new Promise(resolve => { tokenLookup = resolve; }));
    const saving = saveMyProfile({ sports: ['MLB'], unitValue: 25 }, 'owner-a');
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    expect(transport).not.toHaveBeenCalled();
    tokenLookup(session('owner-b'));
    await saving;
    expect(transport).toHaveBeenCalledOnce();
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/rest/v1/rpc/save_my_profile');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-token-owner-a');
    expect(JSON.parse(String(options.body))).toMatchObject({ p_favorite_sports: ['MLB'], p_unit_value: 25 });
    expect(String(options.body)).not.toContain('owner-');
  });

  it('never dispatches an A draft when the checked session already belongs to B', async () => {
    vi.spyOn(client.auth, 'getSession').mockResolvedValue(session('owner-b'));
    await expect(saveMyProfile({ bio: 'Owner A draft' }, 'owner-a')).rejects.toThrow('account changed');
    expect(transport).not.toHaveBeenCalled();
  });

  it('checks the form generation again after the session await, including A→B→A', async () => {
    let resolve!: (value: ReturnType<typeof session>) => void;
    vi.spyOn(client.auth, 'getSession').mockImplementation(() => new Promise(done => { resolve = done; }));
    let current = true;
    const saving = saveMyProfile({ unitValue: 25 }, 'owner-a', () => current);
    current = false; resolve(session('owner-a'));
    await expect(saving).rejects.toThrow('account changed');
    expect(transport).not.toHaveBeenCalled();
  });
});

const manual = { league: 'MLB', description: 'Private fixture note', odds: -110, stake: 1, gameDate: '2026-09-08' };
describe('manual insert owner binding', () => {
  it('keeps both inserted user_id and actual SDK authorization on A when token lookup changes to B', async () => {
    transport.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'fixture-row' }]), { status: 201, headers: { 'content-type': 'application/json' } }));
    let tokenLookup!: (value: ReturnType<typeof session>) => void;
    const getSession = vi.spyOn(client.auth, 'getSession').mockResolvedValueOnce(session('owner-a'))
      .mockImplementationOnce(() => new Promise(resolve => { tokenLookup = resolve; }));
    const saving = logManual(manual, 'owner-a');
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    tokenLookup(session('owner-b')); await saving;
    const [url, options] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/rest/v1/user_bets');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-token-owner-a');
    expect(JSON.parse(String(options.body))).toMatchObject({ user_id: 'owner-a', kind: 'manual', notes: '' });
  });
  it('refuses an old draft before dispatch when the checked session belongs to B', async () => {
    vi.spyOn(client.auth, 'getSession').mockResolvedValue(session('owner-b'));
    await expect(logManual(manual, 'owner-a')).rejects.toThrow('account changed');
    expect(transport).not.toHaveBeenCalled();
  });
});
