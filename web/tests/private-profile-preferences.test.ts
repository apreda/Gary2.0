import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MyProfile } from '@/lib/book/api';

const f = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0,
  rpc: vi.fn(), unit: vi.fn(), saved: vi.fn(), getSession: vi.fn(),
  effects: [] as (() => void | (() => void))[], auth: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  owner: 'owner-a', mounted: false, childKey: null as string | null, childStart: 0,
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = f.cursor++;
    if (!(index in f.cells)) f.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [f.cells[index], (next: unknown) => {
      f.cells[index] = typeof next === 'function' ? next(f.cells[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const i = f.cursor++; if (!(i in f.cells)) f.cells[i] = { current: initial }; return f.cells[i];
  },
  useEffect: (effect: () => void | (() => void)) => { f.effects.push(effect); },
}));
// The component and saveMyProfile transport adapter are real. Only the
// authenticated RPC boundary is intercepted; no network/account is used.
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => ({
  rpc: (...args: unknown[]) => { const response = f.rpc(...args); return Object.assign(response, { setHeader: () => response }); },
  auth: { getSession: f.getSession, onAuthStateChange: (callback: typeof f.auth) => { f.auth = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } },
}) }));
vi.mock('@/components/book/BookDay', () => ({ useUnitDollars: () => [0, f.unit] }));
vi.mock('@/components/book/LogBet', () => ({ bookButton: '', bookField: '' }));
import { ProfileEditor } from '@/components/book/ProfileEditor';

type NodeProps = {
  children?: ReactNode;
  type?: string; autoComplete?: string; required?: boolean; disabled?: boolean;
  value?: string; checked?: boolean; pattern?: string; minLength?: number; maxLength?: number;
  'aria-label'?: string; 'aria-pressed'?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string; checked: boolean } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
};
const privateProfile = (): MyProfile => ({
  ok: true, profile: null, preferences: { favorite_sports: [], unit_value: 0 },
});
const claimedProfile = (visible = false): MyProfile => ({
  ok: true,
  profile: { display_name: 'KnownFan', handle: 'KnownFan', avatar: 'baseball.fill', bio: 'Baseball notebook', leaderboard_visible: visible },
  preferences: { favorite_sports: ['MLB'], unit_value: 10 },
});
let initial: MyProfile;

function render(): ReactNode {
  f.cursor = 0; f.effects = [];
  let editor = ProfileEditor({ initial, initialOwnerId: 'owner-a', onSaved: f.saved });
  if (!f.mounted) {
    f.mounted = true; f.effects[0](); f.auth?.('INITIAL_SESSION', { user: { id: f.owner } });
    f.cursor = 0; f.effects = [];
    editor = ProfileEditor({ initial, initialOwnerId: 'owner-a', onSaved: f.saved });
  }
  if (!isValidElement(editor) || typeof editor.type !== 'function') {
    return editor;
  }
  if (f.childKey !== editor.key) { f.cells.length = f.cursor; f.childKey = editor.key; }
  f.childStart = f.cursor;
  // Execute the private child function reached through ProfileEditor's real
  // React element. Hook cells survive renders; onSaved never replaces initial.
  return (editor.type as (props: unknown) => ReactNode)(editor.props);
}
function nodes(tree: ReactNode, type: string): NodeProps[] {
  const found: NodeProps[] = [];
  const walk = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<NodeProps>(child)) return;
    if (child.type === type) found.push(child.props);
    walk(child.props.children);
  });
  walk(tree);
  return found;
}
const markup = () => renderToStaticMarkup(render());
const handle = () => nodes(render(), 'input').find(p => p.autoComplete === 'nickname')!;
const unit = () => nodes(render(), 'input').find(p => p.type === 'number')!;
const visibility = () => nodes(render(), 'input').find(p => p.type === 'checkbox')!;
const bio = () => nodes(render(), 'textarea')[0];
const button = (name: string) => nodes(render(), 'button').find(p =>
  p['aria-label'] === name || renderToStaticMarkup(p.children) === name)!;
const change = (field: NodeProps, value: string) => field.onChange!({ target: { value, checked: false } });
const setVisible = (checked: boolean) => visibility().onChange!({ target: { checked, value: '' } });
async function submit() {
  const preventDefault = vi.fn();
  await nodes(render(), 'form')[0].onSubmit!({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
}
function receipt(data: MyProfile) { return { data, error: null }; }

beforeEach(() => {
  vi.resetAllMocks(); f.cells = []; f.cursor = 0; f.effects = []; f.auth = null; f.owner = 'owner-a'; f.mounted = false; f.childKey = null; initial = privateProfile();
  f.getSession.mockImplementation(async () => ({ data: { session: { user: { id: f.owner }, access_token: 'fixture-token-' + f.owner } }, error: null }));
  f.rpc.mockResolvedValue(receipt(privateProfile()));
});

describe('private profile preference submission', () => {
  it('allows a blank handle in the actual HTML and saves only private preference payloads', async () => {
    expect(handle()).toMatchObject({ required: false, value: '', minLength: 3, maxLength: 18, pattern: '[A-Za-z0-9_]{3,18}' });
    expect(markup()).not.toMatch(/<input[^>]*required=""/);
    button('NFL').onClick!(); button('MLB').onClick!(); change(unit(), '24.99');
    const confirmed = { ...privateProfile(), preferences: { favorite_sports: ['NFL', 'MLB'], unit_value: 25 } };
    f.rpc.mockResolvedValueOnce(receipt(confirmed));
    await submit();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('save_my_profile', {
      p_handle: null, p_avatar: null, p_bio: null, p_leaderboard_visible: false,
      p_favorite_sports: ['NFL', 'MLB'], p_unit_value: 24.99,
    });
    expect(f.unit).toHaveBeenCalledExactlyOnceWith(25);
    expect(f.saved).toHaveBeenCalledExactlyOnceWith(confirmed);
    expect(handle().value).toBe('');
    expect(markup()).toContain('Private preferences saved. No public profile was created.');
  });

  it.each(['avatar', 'bio', 'public'] as const)('requires a handle for new %s identity content and retains the unsaved draft', async kind => {
    button('NFL').onClick!(); change(unit(), '18.50');
    if (kind === 'avatar') button('Flame').onClick!();
    if (kind === 'bio') change(bio(), 'A patient sports fan');
    if (kind === 'public') setVisible(true);
    expect(handle().required).toBe(true);
    expect(markup()).toMatch(/<input[^>]*required=""/);
    await submit();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.unit).not.toHaveBeenCalled(); expect(f.saved).not.toHaveBeenCalled();
    expect(unit().value).toBe('18.50'); expect(button('NFL')['aria-pressed']).toBe(true);
    if (kind === 'avatar') expect(button('Flame')['aria-pressed']).toBe(true);
    if (kind === 'bio') expect(bio().value).toBe('A patient sports fan');
    if (kind === 'public') expect(visibility().checked).toBe(true);
    expect(markup()).toContain('Choose a handle to save an avatar or bio');
    change(handle(), 'NewFan');
    const confirmed = claimedProfile(kind === 'public');
    confirmed.profile = { ...confirmed.profile!, handle: 'NewFan', display_name: 'NewFan' };
    f.rpc.mockResolvedValueOnce(receipt(confirmed));
    await submit();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('save_my_profile', {
      p_handle: 'NewFan', p_avatar: kind === 'avatar' ? 'flame.fill' : 'initials',
      p_bio: kind === 'bio' ? 'A patient sports fan' : '', p_leaderboard_visible: kind === 'public',
      p_favorite_sports: ['NFL'], p_unit_value: 18.5,
    });
    expect(f.saved).toHaveBeenCalledExactlyOnceWith(confirmed);
  });

  it.each([false, true])('clearing an existing handle preserves server identity with public=%s', async visible => {
    initial = claimedProfile(visible);
    change(handle(), '');
    expect(handle().required).toBe(false);
    expect(markup()).not.toMatch(/<input[^>]*required=""/);
    expect(markup()).toContain('Leave blank to keep @KnownFan.');
    f.rpc.mockResolvedValueOnce(receipt(initial));
    await submit();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('save_my_profile', {
      p_handle: null, p_avatar: 'baseball.fill', p_bio: 'Baseball notebook',
      p_leaderboard_visible: visible, p_favorite_sports: ['MLB'], p_unit_value: 10,
    });
    expect(handle().value).toBe('KnownFan');
    expect(f.saved).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it.each(['ab', 'bad handle', 'x'.repeat(19)])('blocks the nonempty invalid handle %s before RPC', async invalid => {
    change(handle(), invalid); change(unit(), '12');
    await submit();
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.unit).not.toHaveBeenCalled();
    expect(f.saved).not.toHaveBeenCalled(); expect(handle().value).toBe(invalid);
    expect(markup()).toContain('Use 3–18 letters, numbers, or underscores');
  });

  it('does not fall back to a saved identity when a newly entered nonempty handle is invalid', async () => {
    initial = claimedProfile(true); change(handle(), 'invalid name');
    await submit();
    expect(f.rpc).not.toHaveBeenCalled(); expect(handle().value).toBe('invalid name');
    expect(visibility().checked).toBe(true); expect(f.saved).not.toHaveBeenCalled();
  });

  it.each(['transport', 'receipt'] as const)('keeps all edits after a %s failure and applies confirmed units only on retry', async failure => {
    change(handle(), 'PatientFan'); change(bio(), 'Careful calls');
    button('Target').onClick!(); button('NCAAF').onClick!(); change(unit(), '40'); setVisible(true);
    if (failure === 'transport') f.rpc.mockRejectedValueOnce(new Error('Connection interrupted.'));
    else f.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'handle taken' }, error: null });
    await submit();
    expect(f.rpc).toHaveBeenCalledOnce(); expect(f.unit).not.toHaveBeenCalled(); expect(f.saved).not.toHaveBeenCalled();
    expect(handle().value).toBe('PatientFan'); expect(bio().value).toBe('Careful calls');
    expect(button('Target')['aria-pressed']).toBe(true); expect(button('NCAAF')['aria-pressed']).toBe(true);
    expect(unit().value).toBe('40'); expect(visibility().checked).toBe(true);
    expect(nodes(render(), 'fieldset')[0].disabled).toBe(false);
    expect(markup()).not.toContain('Profile saved.');
    expect(markup()).toContain(failure === 'transport' ? 'Connection interrupted.' : 'That handle is already taken.');
    const confirmed: MyProfile = {
      ok: true, profile: { handle: 'PatientFan', display_name: 'PatientFan', avatar: 'target', bio: 'Careful calls', leaderboard_visible: true },
      preferences: { favorite_sports: ['NCAAF'], unit_value: 40.01 },
    };
    f.rpc.mockResolvedValueOnce(receipt(confirmed));
    await submit();
    expect(f.rpc.mock.calls[1]).toEqual(f.rpc.mock.calls[0]);
    expect(f.unit).toHaveBeenCalledExactlyOnceWith(40.01);
    expect(f.saved).toHaveBeenCalledExactlyOnceWith(confirmed);
    expect(markup()).toContain('Profile saved.'); expect(markup()).not.toContain('role="alert"');
  });

  it('remembers a first claimed handle when the field is later cleared without a parent profile update', async () => {
    change(handle(), 'FirstClaim'); button('Crown').onClick!(); change(unit(), '8');
    const first: MyProfile = {
      ok: true, profile: { handle: 'FirstClaim', display_name: 'FirstClaim', avatar: 'crown.fill', bio: '', leaderboard_visible: false },
      preferences: { favorite_sports: [], unit_value: 7.5 },
    };
    f.rpc.mockResolvedValueOnce(receipt(first));
    await submit();
    expect(initial.profile).toBeNull(); // onSaved is a spy; parent input never changes.
    expect(f.unit).toHaveBeenLastCalledWith(7.5);
    change(handle(), ''); setVisible(true); change(unit(), '13');
    expect(handle().required).toBe(false);
    expect(markup()).toContain('Leave blank to keep @FirstClaim.');
    const second = { ...first, profile: { ...first.profile!, leaderboard_visible: true }, preferences: { favorite_sports: [], unit_value: 12.5 } };
    f.rpc.mockResolvedValueOnce(receipt(second));
    await submit();
    expect(f.rpc).toHaveBeenLastCalledWith('save_my_profile', {
      p_handle: null, p_avatar: 'crown.fill', p_bio: '', p_leaderboard_visible: true,
      p_favorite_sports: [], p_unit_value: 13,
    });
    expect(handle().value).toBe('FirstClaim'); expect(f.unit).toHaveBeenLastCalledWith(12.5);
    expect(f.saved).toHaveBeenLastCalledWith(second);
  });
});

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function switchOwner(id: string | null) {
  f.owner = id ?? '';
  f.auth?.('SIGNED_IN', id ? { user: { id } } : null);
}
async function loadChangedOwner(profile: MyProfile) {
  f.rpc.mockResolvedValueOnce(receipt(profile));
  render(); f.effects[1]?.(); await flush(); render();
}

describe('profile account ownership', () => {
  it('preserves a same-owner draft on token refresh', () => {
    initial = claimedProfile(); change(bio(), 'Unsaved owner A draft');
    f.auth?.('TOKEN_REFRESHED', { user: { id: 'owner-a' } });
    expect(bio().value).toBe('Unsaved owner A draft');
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('clears a changed-owner draft immediately and rejects its retained submit callback', async () => {
    initial = claimedProfile(); change(bio(), 'Unsaved owner A draft');
    const oldSubmit = nodes(render(), 'form')[0].onSubmit!;
    switchOwner('owner-b');
    expect(markup()).not.toContain('KnownFan');
    expect(markup()).not.toContain('Unsaved owner A draft');
    expect(nodes(render(), 'form')).toHaveLength(0);
    await oldSubmit({ preventDefault: vi.fn() });
    expect(f.rpc).not.toHaveBeenCalled();
    await loadChangedOwner(privateProfile());
    expect(handle().value).toBe(''); expect(bio().value).toBe('');
  });

  it.each(['owner-b', 'owner-a'])('ignores a late save after A→B→%s, including units and parent callbacks', async finalOwner => {
    initial = claimedProfile(); change(unit(), '77');
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    f.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const saving = submit(); await flush();
    expect(f.rpc).toHaveBeenCalledOnce();
    switchOwner('owner-b');
    if (finalOwner === 'owner-a') switchOwner('owner-a');
    await loadChangedOwner(privateProfile());
    resolve(receipt(claimedProfile())); await saving;
    expect(handle().value).toBe('');
    expect(f.saved).not.toHaveBeenCalled(); expect(f.unit).not.toHaveBeenCalled();
    expect(markup()).not.toContain('Profile saved.');
  });

  it('rejects an old profile load after another owner finishes loading', async () => {
    initial = claimedProfile(); render(); switchOwner('owner-b');
    let resolve!: (value: ReturnType<typeof receipt>) => void;
    f.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(); f.effects[1]?.(); await flush();
    switchOwner('owner-c'); await loadChangedOwner(privateProfile());
    resolve(receipt(claimedProfile())); await flush();
    expect(handle().value).toBe(''); expect(markup()).not.toContain('KnownFan');
  });
});
