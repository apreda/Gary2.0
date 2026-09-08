import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
const f = vi.hoisted(() => ({ client:null as unknown }));
vi.mock('@/lib/auth/client', () => ({supabaseBrowser:()=>f.client}));
import { requestAccountDeletion } from '@/lib/auth/account-deletion';

const session=(id:string)=>({data:{session:{user:{id},access_token:`fixture-token-${id}`} as Session},error:null});
let client:SupabaseClient;
let transport:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  transport=vi.fn(async()=>new Response(JSON.stringify({ok:true,deleted:'owner-a'}),{status:200,headers:{'content-type':'application/json'}}));
  client=createClient('https://fixture.invalid','fixture-anon-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport as typeof fetch},
  });f.client=client;
});
afterEach(()=>vi.restoreAllMocks());

describe('account deletion pins its owner through the actual Supabase SDK',()=>{
  it('keeps A Authorization when SDK token lookup switches to B after the owner check',async()=>{
    let lookup!:(value:ReturnType<typeof session>)=>void;
    const getSession=vi.spyOn(client.auth,'getSession').mockResolvedValueOnce(session('owner-a'))
      .mockImplementationOnce(()=>new Promise(resolve=>{lookup=resolve;}));
    const removing=requestAccountDeletion('owner-a',()=>true);
    await vi.waitFor(()=>expect(getSession).toHaveBeenCalledTimes(2));
    expect(transport).not.toHaveBeenCalled();lookup(session('owner-b'));await removing;
    const [url,options]=transport.mock.calls[0] as unknown as [string,RequestInit];
    expect(String(url)).toContain('/functions/v1/delete-account');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-token-owner-a');
    expect(JSON.parse(String(options.body))).toEqual({});
  });
  it('does not send deletion when the checked identity already belongs to B',async()=>{
    vi.spyOn(client.auth,'getSession').mockResolvedValue(session('owner-b'));
    await expect(requestAccountDeletion('owner-a',()=>true)).rejects.toThrow('account changed');
    expect(transport).not.toHaveBeenCalled();
  });
  it('rechecks the form generation after awaiting the session',async()=>{
    let lookup!:(value:ReturnType<typeof session>)=>void;
    vi.spyOn(client.auth,'getSession').mockImplementation(()=>new Promise(resolve=>{lookup=resolve;}));
    let current=true;const removing=requestAccountDeletion('owner-a',()=>current);
    current=false;lookup(session('owner-a'));
    await expect(removing).rejects.toThrow('account changed');expect(transport).not.toHaveBeenCalled();
  });
});
