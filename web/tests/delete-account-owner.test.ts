import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';

const f = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[],
  auth: null as null | ((event: string, session: unknown) => void), getSession: vi.fn(), invoke: vi.fn(),
  signOut: vi.fn(), clear: vi.fn(), redirect: vi.fn(), removeItem: vi.fn(), hint: vi.fn(), owner: 'owner-a' as string | null,
  token: 'token-a', cleanups: [] as (() => void)[],
}));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i=f.cursor++; if (!(i in f.cells)) f.cells[i]=typeof initial==='function' ? initial() : initial;
    return [f.cells[i],(next: unknown) => {f.cells[i]=typeof next==='function' ? next(f.cells[i]) : next;}]; },
  useRef: (initial: unknown) => { const i=f.cursor++; if (!(i in f.cells)) f.cells[i]={current:initial}; return f.cells[i]; },
  useEffect: (effect: () => void | (() => void)) => { f.effects.push(effect); },
}));
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => ({
  auth: { getSession:f.getSession, signOut:f.signOut, onAuthStateChange:(callback: typeof f.auth) => {
    f.auth=callback; return {data:{subscription:{unsubscribe:vi.fn()}}};
  } }, functions:{invoke:f.invoke},
}) }));
vi.mock('@/lib/auth/session-hint', () => ({ announceSessionHintChanged:f.hint }));
vi.mock('@/lib/auth/account-deletion', async original => ({
  ...await original<typeof import('@/lib/auth/account-deletion')>(), clearDeletedAccountSession:f.clear,
}));
vi.mock('@/components/book/LogBet', () => ({bookButton:'',bookField:''}));
import { DeleteAccount } from '@/components/book/DeleteAccount';

type Props = { children?:ReactNode; type?:string; disabled?:boolean; value?:string;
  onChange?:(event:{target:{value:string}})=>void; onSubmit?:(event:{preventDefault:()=>void})=>Promise<void> };
function render() { f.cursor=0; f.effects=[]; return DeleteAccount({ownerId:'owner-a'}); }
function nodes(tree:ReactNode,type:string):Props[] {
  const out:Props[]=[]; const walk=(node:ReactNode)=>Children.forEach(node,child=>{
    if(!isValidElement<Props>(child))return; if(child.type===type)out.push(child.props); walk(child.props.children);
  }); walk(tree); return out;
}
const field=()=>nodes(render(),'input')[0];
const button=()=>nodes(render(),'button').find(p=>p.type==='submit')!;
const submit=()=>nodes(render(),'form')[0].onSubmit!;
const event={preventDefault:()=>{}};
function auth(owner:string|null,eventName='SIGNED_IN') {
  f.owner=owner; f.auth?.(eventName,owner ? {user:{id:owner},access_token:f.token} : null);
}
function mount(confirm=true) {
  render(); f.cleanups=f.effects.map(effect=>effect()).filter((cleanup):cleanup is ()=>void=>typeof cleanup==='function');
  if(confirm)auth('owner-a','INITIAL_SESSION');
}
function typeDelete() { field().onChange!({target:{value:'DELETE'}}); }
function deferred<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }
const success=()=>({data:{ok:true,deleted:'owner-a'},error:null});
beforeEach(()=>{
  vi.resetAllMocks(); f.cells=[]; f.cursor=0; f.effects=[]; f.cleanups=[]; f.auth=null; f.owner='owner-a'; f.token='token-a';
  f.getSession.mockImplementation(async()=>({data:{session:f.owner ? {user:{id:f.owner},access_token:f.token} : null},error:null}));
  f.invoke.mockResolvedValue(success());
  f.signOut.mockImplementation(async()=>{auth(null,'SIGNED_OUT');return {error:null};});
  f.clear.mockResolvedValue(true);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');
  vi.stubGlobal('document',{cookie:''});
  vi.stubGlobal('window',{location:{assign:f.redirect},sessionStorage:{removeItem:f.removeItem}});
});
afterEach(()=>{for(const cleanup of f.cleanups)cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('rendered account deletion owns its confirmation and completion',()=>{
  it('disables confirmation until the browser confirms the rendered account',()=>{
    mount(false); typeDelete(); expect(field().disabled).toBe(true); expect(button().disabled).toBe(true);
    auth('owner-b'); expect(field().value).toBe(''); expect(button().disabled).toBe(true);
  });
  it('invalidates a captured A submit and clears DELETE after switching to B',async()=>{
    mount(); typeDelete(); const oldSubmit=submit(); auth('owner-b'); await oldSubmit(event);
    expect(f.invoke).not.toHaveBeenCalled(); expect(field().value).toBe(''); expect(button().disabled).toBe(true);
  });
  it('invalidates A→B→A even when the final user id matches again',async()=>{
    mount(); typeDelete(); const oldSubmit=submit(); auth('owner-b'); auth('owner-a'); await oldSubmit(event);
    expect(f.invoke).not.toHaveBeenCalled(); expect(field().value).toBe('');
  });
  it('keeps same-owner refresh confirmation and sends the checked Authorization',async()=>{
    mount(); typeDelete(); f.token='refreshed-a'; auth('owner-a','TOKEN_REFRESHED');
    expect(field().value).toBe('DELETE'); await submit()(event);
    expect(f.invoke).toHaveBeenCalledWith('delete-account',{body:{},headers:{Authorization:'Bearer refreshed-a'}});
    expect(f.redirect).toHaveBeenCalledWith('/account?deleted=1');
    expect(f.clear).toHaveBeenCalledOnce(); expect(f.signOut).not.toHaveBeenCalled();
    expect(f.removeItem).toHaveBeenCalledWith('userUnitDollars');
  });
  it('never signs out or redirects replacement B after late A success',async()=>{
    mount(); typeDelete(); const pending=deferred<ReturnType<typeof success>>(); f.invoke.mockReturnValue(pending.promise);
    const deleting=submit()(event); await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledOnce());
    auth('owner-b'); pending.resolve(success()); await deleting;
    expect(f.signOut).not.toHaveBeenCalled(); expect(f.redirect).not.toHaveBeenCalled(); expect(f.removeItem).not.toHaveBeenCalled();
    expect(f.clear).not.toHaveBeenCalled();
  });
  it('never signs out replacement B on a late signed_out failure from A',async()=>{
    mount(); typeDelete(); const pending=deferred<unknown>(); f.invoke.mockReturnValue(pending.promise);
    const deleting=submit()(event); await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledOnce());
    auth('owner-b'); pending.resolve({data:{ok:false,signed_out:true,error:'Deletion failed'},error:null}); await deleting;
    expect(f.signOut).not.toHaveBeenCalled(); expect(f.redirect).not.toHaveBeenCalled();
  });
  it('does not complete an unmounted deletion form',async()=>{
    mount(); typeDelete(); const pending=deferred<ReturnType<typeof success>>(); f.invoke.mockReturnValue(pending.promise);
    const deleting=submit()(event); await vi.waitFor(()=>expect(f.invoke).toHaveBeenCalledOnce());
    for(const cleanup of f.cleanups)cleanup(); pending.resolve(success()); await deleting;
    expect(f.signOut).not.toHaveBeenCalled(); expect(f.redirect).not.toHaveBeenCalled();
  });
  it.each([false,true].flatMap(failed=>[false,true].map(staleSignOut=>({failed,staleSignOut}))))
  ('preserves B preferences/navigation ahead of its event: failed=$failed staleSignOut=$staleSignOut',async({failed,staleSignOut})=>{
    mount();typeDelete();
    f.invoke.mockResolvedValue(failed?{data:{ok:false,signed_out:true},error:null}:success());
    f.clear.mockImplementation(async()=>{
      document.cookie='sb-fixture-auth-token=replacement-b';
      if(staleSignOut)auth(null,'SIGNED_OUT');
      return true;
    });
    await submit()(event);
    expect(f.removeItem).not.toHaveBeenCalled();expect(f.hint).not.toHaveBeenCalled();expect(f.redirect).not.toHaveBeenCalled();
  });
});
