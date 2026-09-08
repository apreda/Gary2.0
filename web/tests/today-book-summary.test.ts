import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | undefined>,
  setState: vi.fn(),
  node: {},
}));
const auth = vi.hoisted(() => ({
  loaded: false,
  browser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | undefined) => { hooks.effects.push(effect); },
  useRef: () => ({ current: hooks.node }),
  useState: (value: unknown) => [value, hooks.setState],
}));
vi.mock('@/lib/auth/client', () => {
  auth.loaded = true;
  return { supabaseBrowser: auth.browser };
});

import { TodayBookSummary } from '@/components/today/TodayBookSummary';

let intersection: IntersectionObserverCallback;
let authChange: (event: AuthChangeEvent, session: Session | null) => void;
const observe = vi.fn();
const disconnect = vi.fn();
const session = { user: { id: 'fixture-reader' } } as Session;
const bets = [{ status: 'won', units_net: 1 }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function mount() {
  TodayBookSummary();
  return hooks.effects.at(-1)!()!;
}

function enter(isIntersecting = true) {
  intersection([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.effects = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersection = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  auth.browser.mockReturnValue({ auth, from: auth.from });
  auth.getSession.mockResolvedValue({ data: { session } });
  auth.onAuthStateChange.mockImplementation(callback => {
    authChange = callback;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  });
  auth.from.mockReturnValue(auth);
  auth.select.mockReturnValue(auth);
  auth.in.mockReturnValue(auth);
  auth.order.mockReturnValue(auth);
  auth.limit.mockResolvedValue({ data: bets, error: null });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('deferred Today Book summary', () => {
  it('does not evaluate or initialize the auth SDK while the section is offscreen', () => {
    expect(auth.loaded).toBe(false);
    const unmount = mount();
    expect(observe).toHaveBeenCalledWith(hooks.node);
    enter(false);
    expect(auth.loaded).toBe(false);
    expect(auth.browser).not.toHaveBeenCalled();
    expect(auth.from).not.toHaveBeenCalled();
    unmount();
  });

  it('activates once near the viewport and preserves the verified Book query', async () => {
    const unmount = mount();
    enter();
    enter();
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenLastCalledWith({ kind: 'ready', bets }));
    expect(auth.browser).toHaveBeenCalledTimes(1);
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(auth.from).toHaveBeenCalledWith('user_bets');
    expect(auth.select).toHaveBeenCalledWith('status,units_net');
    expect(auth.in).toHaveBeenCalledWith('kind', ['tail', 'fade']);
    expect(auth.order).toHaveBeenCalledWith('placed_at', { ascending: false });
    expect(auth.limit).toHaveBeenCalledWith(400);
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });

  it('activates without IntersectionObserver and shows the signed-out invitation', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    auth.getSession.mockResolvedValue({ data: { session: null } });
    const unmount = mount();
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenLastCalledWith({ kind: 'signed-out' }));
    expect(auth.from).not.toHaveBeenCalled();
    unmount();
  });

  it('does not let an older session snapshot overwrite a newer auth event', async () => {
    const snapshot = deferred<{ data: { session: Session } }>();
    auth.getSession.mockReturnValue(snapshot.promise);
    const unmount = mount();
    enter();
    await vi.waitFor(() => expect(auth.getSession).toHaveBeenCalled());
    authChange('SIGNED_OUT', null);
    snapshot.resolve({ data: { session } });
    await snapshot.promise;
    expect(hooks.setState).toHaveBeenLastCalledWith({ kind: 'signed-out' });
    expect(auth.from).not.toHaveBeenCalled();
    unmount();
  });

  it('discards a pending Book response after sign-out', async () => {
    const response = deferred<{ data: typeof bets; error: null }>();
    auth.limit.mockReturnValue(response.promise);
    const unmount = mount();
    enter();
    await vi.waitFor(() => expect(auth.limit).toHaveBeenCalled());
    authChange('SIGNED_OUT', null);
    response.resolve({ data: bets, error: null });
    await response.promise;
    expect(hooks.setState).toHaveBeenCalledExactlyOnceWith({ kind: 'signed-out' });
    unmount();
  });

  it('does not initialize auth when unmounted during its dynamic import', async () => {
    const unmount = mount();
    enter();
    unmount();
    // Await the same dependency import so its activation continuation settles.
    await import('@/lib/auth/client');
    await Promise.resolve();
    expect(auth.browser).not.toHaveBeenCalled();
    expect(hooks.setState).not.toHaveBeenCalled();
  });

  it('unsubscribes and ignores an in-flight Book response after unmount', async () => {
    const response = deferred<{ data: typeof bets; error: null }>();
    auth.limit.mockReturnValue(response.promise);
    const unmount = mount();
    enter();
    await vi.waitFor(() => expect(auth.limit).toHaveBeenCalled());
    unmount();
    response.resolve({ data: bets, error: null });
    await response.promise;
    expect(auth.unsubscribe).toHaveBeenCalledTimes(1);
    expect(hooks.setState).not.toHaveBeenCalled();
  });

  it('shows the existing error state if the Book request rejects', async () => {
    auth.limit.mockRejectedValue(new Error('offline'));
    const unmount = mount();
    enter();
    await vi.waitFor(() => expect(hooks.setState).toHaveBeenLastCalledWith({ kind: 'error' }));
    unmount();
  });
});
