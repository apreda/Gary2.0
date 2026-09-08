import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UserBet } from '@/lib/book/model';

const fixture = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0,
  callbacks: [] as ((...args: unknown[]) => Promise<void>)[],
  effects: [] as (() => void | (() => void))[],
  authChanged: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  sessionOwner: 'owner-a' as string | null, getSession: vi.fn(),
  bets: vi.fn(), streak: vi.fn(), profile: vi.fn(), rankings: vi.fn(), rpc: vi.fn(), unit: vi.fn(),
}));

vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  // Keep hook cells between explicit renders while executing the component's
  // real reload, auth listener and request callbacks. No browser/DOM package
  // is needed for these data-state and rendered-markup boundaries.
  useState: (initial: unknown) => {
    const index = fixture.cursor++;
    if (!(index in fixture.cells)) fixture.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [fixture.cells[index], (next: unknown) => {
      fixture.cells[index] = typeof next === 'function' ? next(fixture.cells[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = fixture.cursor++;
    if (!(index in fixture.cells)) fixture.cells[index] = { current: initial };
    return fixture.cells[index];
  },
  useCallback: (callback: (...args: unknown[]) => Promise<void>) => {
    if (callback.constructor.name === 'AsyncFunction') fixture.callbacks.push(callback); return callback;
  },
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
}));
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return { default: ({ children, ...props }: { children: import('react').ReactNode }) => createElement('a', props, children) };
});
vi.mock('@/lib/auth/client', () => ({
  supabaseBrowser: () => ({ rpc: fixture.rpc, auth: { getSession: fixture.getSession, onAuthStateChange: (callback: typeof fixture.authChanged) => {
    fixture.authChanged = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  } } }),
}));
vi.mock('@/lib/book/api', () => ({
  fetchMyBets: fixture.bets, fetchMyStreak: fixture.streak,
  fetchMyProfile: fixture.profile, fetchRankings: fixture.rankings,
  deleteBet: vi.fn(), gradeManual: vi.fn(), setStreakPick: vi.fn(), updateBet: vi.fn(),
}));
vi.mock('@/components/book/BookDay', () => ({ useUnitDollars: () => [0, fixture.unit] }));
vi.mock('@/components/book/BookSlips', () => ({ Ledger: () => null, OpenSlips: () => null }));
vi.mock('@/components/book/LogBet', () => ({ bookButton: '', bookField: '', LogBet: () => null }));
vi.mock('@/components/book/ProfileEditor', () => ({ profileAvatar: () => 'FP', ProfileEditor: () => null }));
vi.mock('@/components/book/RideChart', () => ({ RideChart: () => null }));
vi.mock('@/components/book/BlockedProfiles', () => ({ BlockedProfiles: () => null }));
vi.mock('@/lib/gary/analytics', () => ({ logBookMilestone: vi.fn() }));

vi.mock('@/components/book/ProfileSafety', () => ({ ProfileSafety: () => null }));
import { PublicProfile } from '@/components/book/PublicProfile';

import { BookClient } from '@/components/book/BookClient';
import { Leaderboard } from '@/components/book/Leaderboard';
import { Ledger, OpenSlips } from '@/components/book/BookSlips';
import { RideChart } from '@/components/book/RideChart';
import { LogBet } from '@/components/book/LogBet';
import { ProfileEditor } from '@/components/book/ProfileEditor';

const actualSlips = await vi.importActual<typeof import('@/components/book/BookSlips')>('@/components/book/BookSlips');

const board = { rows: [], me: null, qualified_count: 0, min_decided: 5, my_decided: 0, has_more: false };
const record = [{
  id: 'fixture', kind: 'tail', status: 'won', stake_units: 1, units_net: 1,
  game_date: '2026-09-07', pick_text: 'Fixture pick', odds_american: 100, graded_by: 'system',
}];
const garyRows = { '7d': null, '30d': null, season: null };

function render(surface: 'book' | 'leaderboard' | 'public-profile') {
  fixture.cursor = 0; fixture.callbacks = []; fixture.effects = [];
  return renderToStaticMarkup(surface === 'book' ? BookClient({ garyRows }) : surface === 'leaderboard' ? Leaderboard({}) : PublicProfile({ userId: 'target' }));
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.resetAllMocks();
  fixture.cells = []; fixture.cursor = 0; fixture.callbacks = []; fixture.effects = []; fixture.authChanged = null;
  fixture.sessionOwner = 'owner-a';
  fixture.getSession.mockImplementation(async () => ({ data: { session: fixture.sessionOwner ? { user: { id: fixture.sessionOwner } } : null }, error: null }));
  fixture.bets.mockResolvedValue([]);
  fixture.streak.mockResolvedValue(null);
  fixture.profile.mockResolvedValue({ profile: null, preferences: { unit_value: 0 } });
  fixture.rankings.mockResolvedValue(board);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type ElementProps = { children?: ReactNode; [key: string]: unknown };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  const found: ReactElement<ElementProps>[] = [];
  Children.forEach(node, child => {
    if (isValidElement<ElementProps>(child)) found.push(child, ...elements(child.props.children));
  });
  return found;
}
function textOf(node: ReactNode): string {
  let text = '';
  Children.forEach(node, child => {
    if (typeof child === 'string' || typeof child === 'number') text += child;
    else if (isValidElement<ElementProps>(child)) text += textOf(child.props.children);
  });
  return text;
}
function bookTree() {
  fixture.cursor = 0; fixture.callbacks = []; fixture.effects = [];
  return BookClient({ garyRows });
}
function changeFilter(label: string, value: string | boolean) {
  const field = elements(bookTree()).find(node => node.type === 'label' && textOf(node).trim().startsWith(label))!;
  const control = elements(field.props.children).find(node => node.type === 'input' || node.type === 'select')!;
  (control.props.onChange as (event: { target: { value?: string; checked?: boolean } }) => void)({
    target: typeof value === 'boolean' ? { checked: value } : { value },
  });
}
function chooseTimeframe(label: string) {
  const button = elements(bookTree()).find(node => node.type === 'button' && textOf(node) === label)!;
  (button.props.onClick as () => void)();
}
function rowElement(tree: ReactNode, type: typeof Ledger | typeof OpenSlips) {
  return elements(tree).find(node => node.type === type);
}
// Render the shipping slip/ledger components using the rows actually passed by
// BookClient. Isolate child hook cells so these renders cannot alter its state.
function renderRows(tree: ReactNode, kind: 'open' | 'ledger') {
  const element = rowElement(tree, kind === 'open' ? OpenSlips : Ledger);
  if (!element) return '';
  const saved = { cells: fixture.cells, cursor: fixture.cursor, effects: fixture.effects };
  fixture.cells = []; fixture.cursor = 0; fixture.effects = [];
  try {
    const component = kind === 'open' ? actualSlips.OpenSlips : actualSlips.Ledger;
    return renderToStaticMarkup(createElement(component, element.props as Parameters<typeof component>[0]));
  } finally { Object.assign(fixture, saved); }
}

describe('Book loading and failure presentation', () => {
  it('never invents zero records or a zero streak after the first history request fails', async () => {
    fixture.bets.mockRejectedValue(new Error('Saved history could not load.'));
    render('book');
    await fixture.callbacks[0]();
    const html = render('book');
    expect(html).toContain('Saved history could not load.');
    expect(html).not.toContain('correct picks in a row');
    expect(html).not.toContain('With Gary · verified');
    expect(html).not.toContain('Every record starts with one call.');
    expect(html).not.toContain('Claim your handle');
  });

  it('shows a genuine empty Book once all account reads succeed', async () => {
    render('book');
    await fixture.callbacks[0]();
    const html = render('book');
    expect(html).toContain('Every record starts with one call.');
    expect(html).toContain('With Gary · verified');
    expect(html).toContain('correct picks in a row');
  });

  it('keeps a previously loaded record with an explicit stale notice on refresh failure', async () => {
    fixture.bets.mockResolvedValue(record);
    fixture.streak.mockResolvedValue({ current: 3, best: 4 });
    render('book');
    await fixture.callbacks[0]();
    render('book');
    fixture.bets.mockRejectedValue(new Error('Refresh failed.'));
    await fixture.callbacks[0]();
    const html = render('book');
    expect(html).toContain('Showing the last Book we loaded.');
    expect(html).toContain('1–0');
    expect(html).toContain('3 <span');
  });

  it('recovers from an initial outage without keeping its error or stale warning', async () => {
    fixture.bets.mockRejectedValueOnce(new Error('Offline.')).mockResolvedValue(record);
    render('book'); await fixture.callbacks[0]();
    render('book'); await fixture.callbacks[0]();
    const html = render('book');
    expect(html).toContain('1–0');
    expect(html).not.toContain('Offline.');
    expect(html).not.toContain('Showing the last Book');
  });
});

describe('Book date-filter and open-slip presentation', () => {
  const bet = (id: string, date: string, extra: Partial<UserBet> = {}): UserBet => ({
    id, game_date: date, kind: 'manual', pick_type: 'game', league: 'MLB', pick_text: id,
    matchup: 'PHI @ NYM', player_name: null, prop_type: null, description: null,
    odds_american: 100, odds_estimated: false, stake_units: 1, gary_confidence: null,
    streak_pick: false, status: 'pending', units_net: null, lock_at: null, placed_at: null,
    graded_by: 'self', is_favorite: true, notes: 'Wind read', ...extra,
  });
  async function load(rows: UserBet[]) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-09-08T04:58:00Z');
    fixture.bets.mockResolvedValue(rows);
    bookTree(); await fixture.callbacks[0]();
  }

  it.each(['7D', '30D', 'Season'])('keeps old and future open slips under %s while bounding history, stats, chart and exported CSV', async timeframe => {
    await load([
      bet('Older unresolved', '2025-12-01'),
      bet('Future unresolved', '2026-09-09'),
      bet('Current settled', '2026-09-08', { status: 'lost', units_net: -1 }),
      bet('Future settled', '2026-09-09', { status: 'won', units_net: 100 }),
      bet('Older settled', '2025-12-01', { status: 'won', units_net: 200 }),
      bet('Other source', '2026-09-09', { kind: 'tail' }),
      bet('Other sport', '2026-09-09', { league: 'NFL' }),
      bet('Other search', '2026-09-09', { notes: 'Calm read' }),
      bet('Not favorite', '2026-09-09', { is_favorite: false }),
    ]);
    chooseTimeframe(timeframe);
    changeFilter('Source', 'manual');
    changeFilter('Sport', 'MLB');
    changeFilter('Search your book', 'wind');
    changeFilter('Favorites only', true);
    let tree = bookTree();
    let open = renderRows(tree, 'open');
    expect(open).toContain('Older unresolved');
    expect(open).toContain('Future unresolved');
    expect(open).toContain('Open slips');
    expect(open).toContain('Edit bet');
    for (const excluded of ['Current settled', 'Future settled', 'Older settled', 'Other source', 'Other sport', 'Other search', 'Not favorite']) {
      expect(open).not.toContain(excluded);
    }
    const ledger = renderRows(tree, 'ledger');
    expect(ledger).toContain('Current settled');
    expect(ledger).not.toContain('Future settled');
    expect(ledger).not.toContain('Older settled');
    expect(elements(tree).find(node => node.props.label === 'Win rate')?.props.value).toBe('0%');
    expect(elements(tree).find(node => node.props.label === 'Return on stake')?.props.value).toBe('-100%');
    expect(elements(tree).find(node => node.type === RideChart)?.props.series).toEqual([{ date: '2026-09-08', units: -1 }]);
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blobs.push(value as Blob); return 'blob:fixture'; });
    vi.stubGlobal('document', { createElement: () => ({ click: vi.fn() }) });
    vi.stubGlobal('window', { setTimeout: vi.fn() });
    const exportButton = elements(tree).find(node => node.type === 'button' && textOf(node).startsWith('Export CSV'))!;
    expect(textOf(exportButton)).toBe('Export CSV (1)');
    (exportButton.props.onClick as () => void)();
    const csv = await blobs[0].text();
    expect(csv).toContain('Current settled');
    for (const excluded of ['Older unresolved', 'Future unresolved', 'Future settled', 'Older settled']) expect(csv).not.toContain(excluded);

    changeFilter('Status', 'pending');
    tree = bookTree();
    open = renderRows(tree, 'open');
    expect(open).toContain('Older unresolved');
    expect(open).toContain('Future unresolved');
    expect(renderToStaticMarkup(tree)).toContain('No history matches this date range and filters.');
    expect(elements(tree).find(node => node.type === 'button' && textOf(node).startsWith('Export CSV'))?.props.disabled).toBe(true);

    changeFilter('Status', 'settled');
    tree = bookTree();
    expect(renderRows(tree, 'open')).toBe('');
    expect(renderRows(tree, 'ledger')).toContain('Current settled');
    chooseTimeframe('All time');
    tree = bookTree();
    expect(renderRows(tree, 'ledger')).toContain('Future settled');
    expect(renderRows(tree, 'ledger')).toContain('Older settled');
    expect(textOf(elements(tree).find(node => node.type === 'button' && textOf(node).startsWith('Export CSV')))).toBe('Export CSV (3)');
  });

  it('renders a future-only Book with usable open slips even when selected history is empty', async () => {
    await load([bet('Only future bet', '2026-09-09')]);
    chooseTimeframe('7D');
    const tree = bookTree();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('No history matches this date range and filters.');
    expect(html).toContain('Open slips include every date and follow your other filters.');
    expect(html).not.toContain('Every record starts with one call.');
    expect(renderRows(tree, 'open')).toContain('Only future bet');
    expect(renderRows(tree, 'open')).toContain('Edit bet');
    expect(renderRows(tree, 'ledger')).toBe('');
  });

  it.each([
    ['2026-09-08T03:59:59Z', '2026-09-08T04:00:00Z', '2026-09-07', '2026-09-08'],
    ['2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z', '2026-03-07', '2026-03-08'],
    ['2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z', '2026-10-31', '2026-11-01'],
  ])('advances rendered history at Eastern midnight %s while preserving open slips', async (before, after, oldDay, newDay) => {
    await load([
      bet('Prior result', oldDay, { status: 'lost', units_net: -1 }),
      bet('Incoming result', newDay, { status: 'won', units_net: 2 }),
      bet('Incoming open', newDay),
    ]);
    chooseTimeframe('7D');
    vi.setSystemTime(before);
    let tree = bookTree();
    expect(renderRows(tree, 'ledger')).toContain('Prior result');
    expect(renderRows(tree, 'ledger')).not.toContain('Incoming result');
    expect(renderRows(tree, 'open')).toContain('Incoming open');
    expect(elements(tree).find(node => node.props.label === 'Win rate')?.props.value).toBe('0%');
    expect(textOf(elements(tree).find(node => node.type === 'button' && textOf(node).startsWith('Export CSV')))).toBe('Export CSV (1)');
    vi.setSystemTime(after);
    tree = bookTree();
    expect(renderRows(tree, 'ledger')).toContain('Incoming result');
    expect(renderRows(tree, 'open')).toContain('Incoming open');
    expect(elements(tree).find(node => node.props.label === 'Win rate')?.props.value).toBe('50%');
    expect(textOf(elements(tree).find(node => node.type === 'button' && textOf(node).startsWith('Export CSV')))).toBe('Export CSV (3)');
  });
});

describe('standalone leaderboard account guidance', () => {
  it('shows qualification progress without requiring a previously claimed handle', async () => {
    fixture.rankings.mockResolvedValue({ ...board, my_decided: 2 });
    render('leaderboard'); fixture.effects[0]();
    fixture.authChanged!('INITIAL_SESSION', { user: { id: 'owner-a' } });
    render('leaderboard'); fixture.effects[1](); await flush();
    const html = render('leaderboard');
    expect(html).toContain('2/5 decided calls · 3 more to qualify.');
    expect(html).toContain('Choose a handle and enable public rankings');
  });

  it('distinguishes meeting the pick minimum from opting in publicly', async () => {
    fixture.rankings.mockResolvedValue({ ...board, my_decided: 8 });
    render('leaderboard'); fixture.effects[0]();
    fixture.authChanged!('INITIAL_SESSION', { user: { id: 'owner-a' } });
    render('leaderboard'); fixture.effects[1](); await flush();
    const html = render('leaderboard');
    expect(html).toContain('You have enough decided calls to qualify.');
    expect(html).not.toContain('0 more');
  });

  it('does not display personal progress to anonymous readers', async () => {
    render('leaderboard'); fixture.effects[1](); await flush();
    const html = render('leaderboard');
    expect(html).toContain('The next name could be yours.');
    expect(html).not.toContain('0/5 decided calls');
  });

  it('distinguishes a fully blocked view from a board with no qualified players', async () => {
    fixture.rankings.mockResolvedValue({ ...board, qualified_count: 2, hidden_count: 2 });
    render('leaderboard'); fixture.effects[1](); await flush();
    const html = render('leaderboard');
    expect(html).toContain('Your blocked players are hidden.');
    expect(html).not.toContain('Nobody has qualified');
  });

  it('gives a moderated owner an appeal route instead of a false qualification prompt', async () => {
    fixture.rankings.mockResolvedValue({ ...board, my_decided: 8, profile_hidden: true });
    render('leaderboard'); fixture.effects[0]();
    fixture.authChanged!('INITIAL_SESSION', { user: { id: 'owner-a' } });
    render('leaderboard'); fixture.effects[1](); await flush();
    const html = render('leaderboard');
    expect(html).toContain('Contact support to appeal');
    expect(html).toContain('/terms#profile-safety');
    expect(html).not.toContain('Choose a handle and enable public rankings');
  });

  it('rejects a late qualification response after the account signs out', async () => {
    let finish!: (value: typeof board) => void;
    fixture.rankings.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render('leaderboard'); fixture.effects[0]();
    fixture.authChanged!('INITIAL_SESSION', { user: { id: 'owner-a' } });
    render('leaderboard'); fixture.effects[1]();
    fixture.authChanged!('SIGNED_OUT', null);
    finish({ ...board, my_decided: 4 }); await flush();
    const html = render('leaderboard');
    expect(html).not.toContain('4/5 decided calls');
    expect(html).toContain('Loading the standings');
  });
});


describe('public profile transport failures', () => {
  it('handles an owner record without a claimed public profile', async () => {
    fixture.rpc.mockResolvedValue({ data: { profile: null, is_owner: true }, error: null });
    render('public-profile'); fixture.effects[1](); await flush();
    expect(render('public-profile')).toContain('This profile is unavailable');
  });
  it('exposes a retry after a rejected transport instead of loading indefinitely', async () => {
    fixture.rpc.mockRejectedValueOnce(new Error('Network disconnected'));
    render('public-profile'); fixture.effects[1](); await flush();
    const html = render('public-profile');
    expect(html).toContain('This profile could not load. Please retry.');
    expect(html).not.toContain('Loading the player');
    expect(html).not.toContain('This profile is unavailable');
    fixture.rpc.mockResolvedValueOnce({ data: null, error: null });
    fixture.effects[1](); await flush();
    expect(render('public-profile')).toContain('This profile is unavailable');
    expect(render('public-profile')).not.toContain('could not load');
  });
});

describe('Book account ownership', () => {
  function mountBook() {
    vi.stubGlobal('window', {
      setTimeout: vi.fn(), setInterval: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      location: { assign: vi.fn() },
    });
    render('book'); fixture.effects[0]();
    fixture.authChanged!('INITIAL_SESSION', { user: { id: 'owner-a' } });
  }
  const privateIdentity = (name: string, unit: number) => ({
    ok: true, profile: { display_name: name, handle: name, avatar: 'initials', leaderboard_visible: false },
    preferences: { favorite_sports: [], unit_value: unit },
  });
  async function load() { render('book'); await fixture.callbacks[0](); }
  function changeOwner(id: string) {
    fixture.sessionOwner = id;
    fixture.authChanged!('SIGNED_IN', { user: { id } });
  }
  it('clears old account record and open editors immediately, but retains them on a same-owner refresh', async () => {
    mountBook(); fixture.bets.mockResolvedValue(record); fixture.profile.mockResolvedValue(privateIdentity('OwnerAFan', 25));
    await load();
    const edit = elements(bookTree()).find(node => node.type === 'button' && textOf(node) === 'Edit profile')!;
    (edit.props.onClick as () => void)();
    expect(render('book')).toContain('Close profile'); expect(render('book')).toContain('OwnerAFan');
    fixture.authChanged!('TOKEN_REFRESHED', { user: { id: 'owner-a' } });
    expect(render('book')).toContain('Close profile'); expect(render('book')).toContain('OwnerAFan');
    changeOwner('owner-b');
    const html = render('book');
    expect(html).not.toContain('OwnerAFan'); expect(html).not.toContain('Close profile'); expect(html).not.toContain('1–0');
    expect(fixture.unit).toHaveBeenLastCalledWith(0);
  });
  it('rejects an old account read after the new account has loaded, including shared unit display', async () => {
    mountBook();
    let oldRows!: (rows: typeof record) => void;
    fixture.bets.mockImplementationOnce(() => new Promise(resolve => { oldRows = resolve; })).mockResolvedValue([]);
    fixture.profile.mockResolvedValueOnce(privateIdentity('OwnerAFan', 25)).mockResolvedValue(privateIdentity('OwnerBFan', 5));
    render('book'); const oldLoad = fixture.callbacks[0](); await flush();
    changeOwner('owner-b'); await load();
    expect(render('book')).toContain('OwnerBFan');
    oldRows(record); await oldLoad;
    expect(render('book')).toContain('OwnerBFan'); expect(render('book')).not.toContain('OwnerAFan');
    expect(render('book')).not.toContain('1–0'); expect(fixture.unit).toHaveBeenLastCalledWith(5);
    expect(fixture.unit).not.toHaveBeenCalledWith(25);
  });
  it('clears retained private history when the first session read confirms sign-out before the event', async () => {
    mountBook(); fixture.bets.mockResolvedValue(record); fixture.profile.mockResolvedValue(privateIdentity('OwnerAFan', 25));
    await load(); fixture.sessionOwner = null; await load();
    const html = render('book');
    expect(html).toContain('Your session has ended'); expect(html).not.toContain('OwnerAFan'); expect(html).not.toContain('1–0');
    expect(fixture.unit).toHaveBeenLastCalledWith(0);
  });
  it.each([false, true])('keeps a log callback owner-bound while allowing same-owner reload: switch=%s', async switchAccount => {
    mountBook(); await load();
    const add = elements(bookTree()).find(node => node.type === 'button' && textOf(node) === '+ Log a bet')!;
    (add.props.onClick as () => void)();
    const form = elements(bookTree()).find(node => node.type === LogBet)!;
    expect(form.props.ownerId).toBe('owner-a');
    if (switchAccount) changeOwner('owner-b');
    await load();
    (form.props.onLogged as (bet: UserBet) => void)({ ...record[0], id: 'old-account-manual', kind: 'manual', status: 'pending' } as UserBet);
    const rows = (rowElement(bookTree(), OpenSlips)?.props.bets ?? []) as UserBet[];
    expect(rows.some(row => row.id === 'old-account-manual')).toBe(!switchAccount);
  });
  it.each(['owner-b', null])('rejects an old editor callback after the parent detects session %s before the auth event', async nextOwner => {
    mountBook(); fixture.profile.mockResolvedValue(privateIdentity('OwnerAFan', 25)); await load();
    const edit = elements(bookTree()).find(node => node.type === 'button' && textOf(node) === 'Edit profile')!;
    (edit.props.onClick as () => void)();
    const editor = elements(bookTree()).find(node => node.type === ProfileEditor)!;
    fixture.sessionOwner = nextOwner; fixture.profile.mockResolvedValue(privateIdentity('OwnerBFan', 5));
    await load();
    (editor.props.onSaved as (profile: unknown) => void)(privateIdentity('LateOwnerAFan', 99));
    expect(render('book')).not.toContain('LateOwnerAFan');
    if (nextOwner) expect(render('book')).toContain('OwnerBFan');
  });
  it('rechecks ownership after an account-bound data read fails before the final session check', async () => {
    mountBook(); fixture.bets.mockResolvedValue(record); fixture.profile.mockResolvedValue(privateIdentity('OwnerAFan', 25)); await load();
    fixture.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'owner-a' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'owner-b' } } }, error: null });
    fixture.profile.mockRejectedValueOnce(new Error('Your account changed.'));
    await load();
    const html = render('book');
    expect(html).not.toContain('OwnerAFan'); expect(html).not.toContain('1–0');
    expect(fixture.unit).toHaveBeenLastCalledWith(0);
  });
  it('clears retained private history if a cookie-session change is detected before its auth event', async () => {
    mountBook(); fixture.bets.mockResolvedValue(record); fixture.profile.mockResolvedValue(privateIdentity('OwnerAFan', 25));
    await load();
    fixture.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'owner-a' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'owner-b' } } }, error: null });
    await load();
    const html = render('book');
    expect(html).toContain('Your account changed'); expect(html).not.toContain('OwnerAFan'); expect(html).not.toContain('1–0');
    expect(fixture.unit).toHaveBeenLastCalledWith(0);
  });
});
