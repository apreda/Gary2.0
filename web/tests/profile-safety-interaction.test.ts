import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const f = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0, available: true, effects: [] as (() => void | (() => void))[],
  auth: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  safety: vi.fn(), report: vi.fn(), block: vi.fn(), list: vi.fn(), changed: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const i = f.cursor++; if (!(i in f.cells)) f.cells[i] = initial;
    return [f.cells[i], (v: unknown) => { f.cells[i] = typeof v === 'function' ? v(f.cells[i]) : v; }];
  },
  useRef: (initial: unknown) => {
    const i = f.cursor++; if (!(i in f.cells)) f.cells[i] = { current: initial }; return f.cells[i];
  },
  useEffect: (effect: () => void | (() => void)) => { f.effects.push(effect); },
}));
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return { default: ({ children, ...props }: { children: ReactNode }) => createElement('a', props, children) };
});
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => ({ auth: { onAuthStateChange: (callback: typeof f.auth) => {
  f.auth = callback; return { data: { subscription: { unsubscribe: f.unsubscribe } } };
} } }) }));
vi.mock('@/lib/book/profile-safety', async original => ({
  ...await original<typeof import('@/lib/book/profile-safety')>(),
  fetchProfileSafety: f.safety, reportProfile: f.report, setProfileBlock: f.block, fetchBlockedProfiles: f.list,
}));
vi.mock('@/components/book/LogBet', () => ({ bookButton: '', bookField: '' }));
import { ProfileSafety } from '@/components/book/ProfileSafety';
import { BlockedProfiles } from '@/components/book/BlockedProfiles';

type Props = { children?: ReactNode; onClick?: () => unknown; onChange?: (e: { target: { value: string } }) => void; onSubmit?: (e: { preventDefault: () => void }) => Promise<void> };
function nodes(tree: ReactNode, type: string) {
  const found: Props[] = [];
  const walk = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<Props>(child)) return;
    if (child.type === type) found.push(child.props);
    walk(child.props.children);
  }); walk(tree); return found;
}
function render(surface: 'safety' | 'list' = 'safety') {
  f.cursor = 0; f.effects = [];
  return surface === 'safety' ? ProfileSafety({ userId: 'target', available: f.available, onBlockChange: f.changed }) : BlockedProfiles({ onChange: f.changed });
}
const markup = (surface: 'safety' | 'list' = 'safety') => renderToStaticMarkup(render(surface));
const button = (name: string, surface: 'safety' | 'list' = 'safety') => nodes(render(surface), 'button').find(p => renderToStaticMarkup(p.children).includes(name))!;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function signedIn() {
  render(); f.effects[0](); f.auth!('INITIAL_SESSION', { user: { id: 'viewer' } });
  render(); f.effects[1](); await flush();
}
beforeEach(() => {
  vi.resetAllMocks(); f.available = true; f.cells = []; f.cursor = 0; f.effects = []; f.auth = null;
  f.safety.mockResolvedValue({ blocked: false, is_owner: false, my_profile_hidden: false });
  f.block.mockResolvedValue(undefined); f.report.mockResolvedValue('report-receipt'); f.list.mockResolvedValue([]);
});

describe('profile safety interactions', () => {
  it('offers a sign-in return and public support without issuing anonymous mutations', () => {
    render(); f.effects[0](); f.auth!('INITIAL_SESSION', null);
    expect(markup()).toContain('Sign in to report or block');
    expect(markup()).toContain('/terms#profile-safety');
    expect(f.safety).not.toHaveBeenCalled(); expect(f.report).not.toHaveBeenCalled();
  });
  it('shows failed block state, retries, and changes the profile only after confirmation', async () => {
    await signedIn(); f.block.mockRejectedValueOnce(new Error('Change not confirmed.'));
    button('Block player').onClick!(); await flush();
    expect(markup()).toContain('Change not confirmed.'); expect(f.changed).not.toHaveBeenCalled();
    button('Block player').onClick!(); await flush();
    expect(f.changed).toHaveBeenCalledWith(true); expect(markup()).toContain('Unblock player');
  });
  it('retains report details after failure and displays a real receipt only after retry', async () => {
    await signedIn(); button('Report profile').onClick!();
    nodes(render(), 'textarea')[0].onChange!({ target: { value: 'Relevant public profile context' } });
    f.report.mockRejectedValueOnce(new Error('Report not confirmed.'));
    await nodes(render(), 'form')[0].onSubmit!({ preventDefault: vi.fn() });
    expect(markup()).toContain('Relevant public profile context'); expect(markup()).not.toContain('Report received.');
    await nodes(render(), 'form')[0].onSubmit!({ preventDefault: vi.fn() });
    expect(f.report).toHaveBeenLastCalledWith('target', 'harassment', 'Relevant public profile context');
    expect(markup()).toContain('Report received.'); expect(markup()).toContain('report-receipt');
    expect(f.block).not.toHaveBeenCalled();
  });
  it('discards a late block response after the signed-in viewer changes', async () => {
    await signedIn(); let finish!: () => void;
    f.block.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    button('Block player').onClick!();
    f.auth!('SIGNED_OUT', null); finish(); await flush();
    expect(f.changed).not.toHaveBeenCalled(); expect(markup()).toContain('Sign in to report or block');
  });
  it('makes safety read failures visible and retryable', async () => {
    f.safety.mockRejectedValueOnce(new Error('Could not load safety settings.'));
    await signedIn();
    expect(markup()).toContain('Could not load safety settings.');
    button('Retry safety controls').onClick!(); render(); f.effects[1](); await flush();
    expect(markup()).toContain('Block player'); expect(markup()).not.toContain('Could not load safety');
  });
  it('keeps safety error and retry visible when the public card is unavailable', async () => {
    f.available = false; f.safety.mockRejectedValueOnce(new Error('Could not load safety settings.'));
    await signedIn();
    expect(markup()).toContain('Could not load safety settings.');
    expect(markup()).toContain('Retry safety controls');
    f.safety.mockResolvedValue({ blocked: true, is_owner: false, my_profile_hidden: false });
    button('Retry safety controls').onClick!(); render(); f.effects[1](); await flush();
    expect(markup()).toContain('Unblock player');
  });
  it('offers the owner an appeal without allowing self-reporting or blocking', async () => {
    f.safety.mockResolvedValue({ blocked: false, is_owner: true, my_profile_hidden: true });
    await signedIn();
    expect(markup()).toContain('Contact support to appeal'); expect(markup()).not.toContain('Block player');
  });
  it('does not claim an empty block list on failure and confirms an unblock before removing a row', async () => {
    f.list.mockRejectedValueOnce(new Error('List unavailable.')).mockResolvedValue([{ user_id: 'target', display_name: 'Fixture player' }]);
    button('Blocked players', 'list').onClick!(); await flush();
    expect(markup('list')).toContain('List unavailable.'); expect(markup('list')).not.toContain('not blocked any');
    button('Retry', 'list').onClick!(); await flush();
    f.block.mockRejectedValueOnce(new Error('Unblock not confirmed.'));
    button('Unblock', 'list').onClick!(); await flush();
    expect(markup('list')).toContain('Fixture player'); expect(f.changed).not.toHaveBeenCalled();
    button('Unblock', 'list').onClick!(); await flush();
    expect(markup('list')).not.toContain('Fixture player'); expect(f.changed).toHaveBeenCalledOnce();
    expect(f.block).toHaveBeenLastCalledWith('target', false);
  });
});
