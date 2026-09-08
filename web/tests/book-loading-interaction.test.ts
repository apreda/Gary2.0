import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const fixture = vi.hoisted(() => ({
  cells: [] as unknown[], cursor: 0,
  callbacks: [] as ((...args: unknown[]) => Promise<void>)[],
  effects: [] as (() => void | (() => void))[],
  authChanged: null as null | ((event: string, session: { user: { id: string } } | null) => void),
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
    fixture.callbacks.push(callback); return callback;
  },
  useEffect: (effect: () => void | (() => void)) => { fixture.effects.push(effect); },
}));
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return { default: ({ children, ...props }: { children: import('react').ReactNode }) => createElement('a', props, children) };
});
vi.mock('@/lib/auth/client', () => ({
  supabaseBrowser: () => ({ rpc: fixture.rpc, auth: { onAuthStateChange: (callback: typeof fixture.authChanged) => {
    fixture.authChanged = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  } } }),
}));
vi.mock('@/lib/book/api', () => ({
  fetchMyBets: fixture.bets, fetchMyStreak: fixture.streak,
  fetchMyProfile: fixture.profile, fetchRankings: fixture.rankings,
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
  fixture.bets.mockResolvedValue([]);
  fixture.streak.mockResolvedValue(null);
  fixture.profile.mockResolvedValue({ profile: null, preferences: { unit_value: 0 } });
  fixture.rankings.mockResolvedValue(board);
});

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
