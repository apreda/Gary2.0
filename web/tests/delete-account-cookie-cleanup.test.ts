import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserClient, createServerClient, createChunks, parseCookieHeader, serializeCookieHeader, stringToBase64URL } from '@supabase/ssr';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createDeletionAwareCookieStore } from '@/lib/auth/browser-cookies';
const f=vi.hoisted(()=>({retireOwner:null as ((owner:string)=>void)|null}));
vi.mock('@/lib/auth/client',()=>({retireBrowserSessionOwner:(owner:string)=>f.retireOwner!(owner)}));
import { canFinishAccountDeletion, clearDeletedAccountSession } from '@/lib/auth/account-deletion';

const storageKey='sb-fixture-auth-token';
let jar:Map<string,string>;
let client:ReturnType<typeof createBrowserClient>;
let transport:ReturnType<typeof vi.fn>;
let ignoreCookieWrites=false;
function seed(owner:string, token='original', chunked=false) {
  for(const name of jar.keys())if(name.startsWith(storageKey))jar.delete(name);
  const value='base64-'+stringToBase64URL(JSON.stringify({
    user:{id:owner}, access_token:`fixture-access-${token}`, refresh_token:`fixture-refresh-${token}`,
    expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',
  }));
  for(const chunk of createChunks(storageKey,value,chunked?80:3180))jar.set(chunk.name,chunk.value);
}
function refreshedSession(owner:string,chunked=false) {
  return {user:{id:owner,...(chunked?{user_metadata:{fixture_padding:'x'.repeat(9000)}}:{})},
    access_token:`eyJhbGciOiJub25lIn0.${stringToBase64URL(JSON.stringify({sub:owner}))}.fixture`,
    refresh_token:`fixture-refresh-new-${owner}`,expires_at:Math.floor(Date.now()/1000)+3600,
    expires_in:3600,token_type:'bearer'};
}
async function releaseRefresh(chunked:boolean) {
  let release!:(response:Response)=>void;
  let started!:()=>void;
  const requestStarted=new Promise<void>(resolve=>{started=resolve;});
  transport.mockImplementationOnce(()=>{started();return new Promise<Response>(resolve=>{release=resolve;});});
  const refreshing=client.auth.refreshSession();
  await requestStarted;
  release(new Response(JSON.stringify(refreshedSession('owner-a',chunked)),{status:200,headers:{'content-type':'application/json'}}));
  return {refreshing};
}
beforeEach(async()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');
  jar=new Map();
  ignoreCookieWrites=false;
  const document={get cookie(){return [...jar].map(([name,value])=>serializeCookieHeader(name,value,{})).join('; ');},
    set cookie(header:string){if(ignoreCookieWrites)return;const [pair,...options]=header.split(';');const at=pair.indexOf('=');
      const name=decodeURIComponent(pair.slice(0,at));const value=decodeURIComponent(pair.slice(at+1));
      if(options.some(option=>/^\s*Max-Age=0\s*$/i.test(option)))jar.delete(name);else jar.set(name,value);
    }};
  vi.stubGlobal('document',document);vi.stubGlobal('window',{document});vi.stubGlobal('BroadcastChannel',undefined);
  seed('owner-a');
  const cookieStore=createDeletionAwareCookieStore(storageKey);
  f.retireOwner=cookieStore.retireOwner;
  transport=vi.fn(async()=>{throw new Error('unexpected Auth network request');});
  client=createBrowserClient('https://fixture.supabase.co','fixture-anon-key',{
    isSingleton:false,cookies:cookieStore.cookies,
    auth:{autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport as typeof fetch},
  });
  expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-a');
});
afterEach(async()=>{await client?.auth.dispose();vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('deleted-account cleanup through the actual SSR cookie store',()=>{
  it.each([false,true])('clears only A session cookies, including chunks=%s, and the real SDK reads signed out',async(chunked)=>{
    seed('owner-a','original',chunked);jar.set('unrelated-preference','keep');
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(jar.get('unrelated-preference')).toBe('keep');expect(transport).not.toHaveBeenCalled();
  });
  it('preserves B when replacement happens in the async gap after A snapshot',async()=>{
    const clearing=clearDeletedAccountSession('owner-a',()=>true);seed('owner-b','replacement');
    expect(await clearing).toBe(false);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    expect(transport).not.toHaveBeenCalled();
  });
  it('rechecks and clears a same-owner refreshed snapshot without selecting another owner',async()=>{
    const clearing=clearDeletedAccountSession('owner-a',()=>true);seed('owner-a','refreshed',true);
    expect(await clearing).toBe(true);expect((await client.auth.getSession()).data.session).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it('preserves an already-current B session and A cookies after form invalidation',async()=>{
    seed('owner-b');expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(false);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    seed('owner-a');expect(await clearDeletedAccountSession('owner-a',()=>false)).toBe(false);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-a');
  });
  it('refuses malformed, missing-chunk or mixed session cookies instead of erasing them',async()=>{
    jar.set(storageKey,'base64-invalid');expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(false);
    expect(jar.get(storageKey)).toBe('base64-invalid');
    seed('owner-a','original',true);jar.delete(`${storageKey}.1`);
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(false);
    seed('owner-a');jar.set(`${storageKey}.0`,'different-session');
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(false);
  });
  it('accepts an already-cleared session without contacting Auth or writing unrelated cookies',async()=>{
    jar.clear();jar.set('unrelated-preference','keep');
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    expect([...jar]).toEqual([['unrelated-preference','keep']]);expect(transport).not.toHaveBeenCalled();
  });
  it('does not report local cleanup when the browser ignores cookie removal',async()=>{
    ignoreCookieWrites=true;expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(false);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-a');
  });
  it.each([false,true].flatMap(chunked=>[false,true].flatMap(replaced=>Array.from({length:33},(_,ticks)=>({chunked,replaced,ticks})))))
  ('keeps the final owner after actual SDK refresh: chunks=$chunked replacement=$replaced microtask=$ticks',async({chunked,replaced,ticks})=>{
    seed('owner-a','original',chunked);
    const {refreshing}=await releaseRefresh(chunked);
    for(let i=0;i<ticks;i++)await Promise.resolve();
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    if(replaced)seed('owner-b','replacement',!chunked);
    await refreshing;
    const session=(await client.auth.getSession()).data.session;
    if(replaced)expect(session?.user.id).toBe('owner-b');else expect(session).toBeNull();
    expect(transport).toHaveBeenCalledOnce();
  });
  it('permits a new B sign-in through actual SSR while fencing later A writes',async()=>{
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    transport.mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession('owner-b',true)),{status:200,headers:{'content-type':'application/json'}}));
    const signedIn=await client.auth.signInWithPassword({email:'fixture-b@example.test',password:'fixture-only-password'});
    expect(signedIn.error).toBeNull();expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    // An externally supplied stale A refresh is another supported SDK write path.
    transport.mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession('owner-a')),{status:200,headers:{'content-type':'application/json'}}));
    await client.auth.refreshSession({refresh_token:'fixture-refresh-stale-a'});
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('negative control: unfenced default SSR writes can restore A after the same cleanup',async()=>{
    f.retireOwner=()=>{};
    const {refreshing}=await releaseRefresh(false);
    for(let i=0;i<9;i++)await Promise.resolve();
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    await refreshing;
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-a');
  });
  it.each(Array.from({length:33},(_,ticks)=>ticks))('checks B cookies before final navigation even ahead of its SDK auth event at microtask %s',async(ticks)=>{
    let release!:(response:Response)=>void;let started!:()=>void;
    const requestStarted=new Promise<void>(resolve=>{started=resolve;});
    transport.mockImplementationOnce(()=>{started();return new Promise<Response>(resolve=>{release=resolve;});});
    let observed='owner-a';
    const {data}=client.auth.onAuthStateChange((_event:AuthChangeEvent,session:Session|null)=>{observed=session?.user.id??'';});
    const signingIn=client.auth.signInWithPassword({email:'fixture-b@example.test',password:'fixture-only-password'});
    await requestStarted;
    release(new Response(JSON.stringify(refreshedSession('owner-b')),{status:200,headers:{'content-type':'application/json'}}));
    for(let i=0;i<ticks;i++)await Promise.resolve();
    if(await clearDeletedAccountSession('owner-a',()=>observed==='owner-a')) {
      // Completion has no await between this check and its synchronous actions.
      const wouldNavigate=canFinishAccountDeletion(()=>observed==='owner-a');
      const currentCookies=[...jar.keys()].some(name=>name.startsWith(storageKey));
      if(currentCookies)expect(wouldNavigate).toBe(false);
    }
    await signingIn;
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    data.subscription.unsubscribe();
  });
  it('keeps B after a late failed A refresh uses the real SDK error/removal path',async()=>{
    let release!:(response:Response)=>void;let started!:()=>void;
    const requestStarted=new Promise<void>(resolve=>{started=resolve;});
    transport.mockImplementationOnce(()=>{started();return new Promise<Response>(resolve=>{release=resolve;});});
    const refreshing=client.auth.refreshSession();await requestStarted;
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    transport.mockResolvedValueOnce(new Response(JSON.stringify(refreshedSession('owner-b',true)),{status:200,headers:{'content-type':'application/json'}}));
    expect((await client.auth.signInWithPassword({email:'fixture-b@example.test',password:'fixture-only-password'})).error).toBeNull();
    release(new Response(JSON.stringify({code:'refresh_token_not_found',message:'Fixture refresh token was revoked'}),{status:400,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}}));
    expect((await refreshing).error?.code).toBe('refresh_token_not_found');
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each(Array.from({length:33},(_,ticks)=>ticks))('preserves concurrent B sign-in across a failed retired-A refresh at microtask %s',async(ticks)=>{
    let releaseA!:(response:Response)=>void;let startedA!:()=>void;
    const startedRefresh=new Promise<void>(resolve=>{startedA=resolve;});
    transport.mockImplementationOnce(()=>{startedA();return new Promise<Response>(resolve=>{releaseA=resolve;});});
    const refreshing=client.auth.refreshSession();await startedRefresh;
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    let releaseB!:(response:Response)=>void;let startedB!:()=>void;
    const startedSignIn=new Promise<void>(resolve=>{startedB=resolve;});
    transport.mockImplementationOnce(()=>{startedB();return new Promise<Response>(resolve=>{releaseB=resolve;});});
    const signingIn=client.auth.signInWithPassword({email:'fixture-b@example.test',password:'fixture-only-password'});
    await startedSignIn;
    releaseA(new Response(JSON.stringify({code:'refresh_token_not_found',message:'Fixture refresh token was revoked'}),{status:400,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}}));
    for(let i=0;i<ticks;i++)await Promise.resolve();
    releaseB(new Response(JSON.stringify(refreshedSession('owner-b',true)),{status:200,headers:{'content-type':'application/json'}}));
    await Promise.all([refreshing,signingIn]);
    expect(canFinishAccountDeletion(()=>true)).toBe(false);
    expect((await client.auth.getSession()).data.session?.user.id).toBe('owner-b');
  });
  it('still lets the existing server-action Sign out remove B after A was retired',async()=>{
    expect(await clearDeletedAccountSession('owner-a',()=>true)).toBe(true);
    seed('owner-b','replacement',true);
    const logout=vi.fn(async()=>new Response(null,{status:204}));
    const server=createServerClient('https://fixture.supabase.co','fixture-anon-key',{
      global:{fetch:logout as typeof fetch},cookies:{getAll:()=>parseCookieHeader(document.cookie),
        setAll:updates=>{for(const {name,value,options} of updates)document.cookie=serializeCookieHeader(name,value,options);}},
    });
    try {
      expect((await server.auth.signOut()).error).toBeNull();
      expect((await client.auth.getSession()).data.session).toBeNull();
      expect(logout).toHaveBeenCalledOnce();
      const [url]=logout.mock.calls[0] as unknown as [string];expect(String(url)).toContain('/auth/v1/logout');
    } finally {await server.auth.dispose();}
  });
});
