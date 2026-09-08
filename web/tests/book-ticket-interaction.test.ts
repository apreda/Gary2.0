import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { UserBet } from '@/lib/book/model';

const hooks = vi.hoisted(() => ({
  useState: vi.fn(), effects: [] as (() => void | (() => void))[],
  setClock: vi.fn(), setArming: vi.fn(), setBusy: vi.fn(), setError: vi.fn(),
  push: vi.fn(), rpc: vi.fn(), addBet: vi.fn(), removeBet: vi.fn(),
  ctx: null as unknown, started: vi.fn(), completed: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: hooks.useState,
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: hooks.push }) }));
vi.mock('@/components/book/BookDay', () => ({
  useBookDay: () => hooks.ctx,
  useUnitDollars: () => [0, vi.fn()],
}));
vi.mock('@/lib/auth/client', () => ({ supabaseBrowser: () => ({ rpc: hooks.rpc }) }));
vi.mock('@/lib/gary/analytics', () => ({
  logBookActionStarted: hooks.started, logFirstBookAction: hooks.completed,
}));
import { PropTailFadeRow, TailFadeRow } from '@/components/book/TailFadeRow';
import { propIntentKey, withBookIntent } from '@/lib/auth/book-intent';

const NOW = Date.parse('2026-09-08T16:00:00Z');
const START = '2026-09-08T17:00:00Z';
const prop = { player: 'Aaron Judge', prop: 'hits 1.5', gameId: 'game-2', line: 1.5, side: 'over' };
type ElementProps = {
  children?: ReactNode; onClick?: () => void; onConfirm?: (stake: number, streak: boolean) => Promise<void>;
  onUndo?: () => Promise<void>; locked?: boolean; bet?: UserBet;
};

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  const result: ReactElement<ElementProps>[] = [];
  Children.forEach(node, child => {
    if (!isValidElement<ElementProps>(child)) return;
    result.push(child, ...elements(child.props.children));
  });
  return result;
}
function textOf(node: ReactNode): string {
  let result = '';
  Children.forEach(node, child => {
    if (typeof child === 'string' || typeof child === 'number') result += child;
    else if (isValidElement<ElementProps>(child)) result += textOf(child.props.children);
  });
  return result;
}
function render(kind: 'game' | 'prop', commence: string | null | undefined, options: {
  arming?: 'tail' | 'fade' | null; clock?: number | null; signedIn?: boolean; mine?: UserBet[];
  ticket?: Partial<typeof prop>;
} = {}) {
  hooks.ctx = {
    date: '2026-09-08', ready: true, signedIn: options.signedIn ?? true,
    ambiguousGamePickReceiptKeys: new Set(), counts: {}, mine: options.mine ?? [],
    addBet: hooks.addBet, removeBet: hooks.removeBet,
  };
  hooks.useState.mockReturnValueOnce([options.clock === undefined ? NOW : options.clock, hooks.setClock])
    .mockReturnValueOnce([options.arming ?? null, hooks.setArming])
    .mockReturnValueOnce([false, hooks.setBusy])
    .mockReturnValueOnce([null, hooks.setError]);
  return kind === 'game'
    ? TailFadeRow({ pickText: 'Yankees ML', pickId: 'pick-2', commence })
    : PropTailFadeRow({ ...prop, ...options.ticket, commence });
}

beforeEach(() => {
  vi.resetAllMocks();
  hooks.effects.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('window', {
    setTimeout, clearTimeout, setInterval, clearInterval,
    location: { pathname: '/props', search: '', hash: '' },
    history: { state: null, replaceState: vi.fn() },
  });
  hooks.rpc.mockResolvedValue({ data: { id: 'saved-exact-ticket' }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe.each(['game', 'prop'] as const)('%s tracking start-time boundary', kind => {
  it.each([undefined, null, '', 'garbage', '2026-09-08', '2026-09-08T17:00:00'])
    ('shows unavailable rather than offering a wager or claiming kickoff for %s', commence => {
      const tree = render(kind, commence, { signedIn: false });
      expect(textOf(tree)).toContain('unavailable until the game start time is confirmed');
      expect(textOf(tree)).not.toContain('game has started');
      expect(elements(tree).filter(node => node.type === 'button')).toHaveLength(0);
      expect(hooks.push).not.toHaveBeenCalled();
      expect(hooks.rpc).not.toHaveBeenCalled();
    });

  it('waits for a browser clock before offering the first tracking action', () => {
    expect(render(kind, START, { clock: null })).toBeNull();
    const cleanup = hooks.effects[0]();
    vi.advanceTimersByTime(0);
    expect(hooks.setClock).toHaveBeenCalledWith(NOW);
    cleanup?.();
    expect(elements(render(kind, START)).filter(node => node.type === 'button')).toHaveLength(2);
  });

  it('keeps already-started games closed and blocks a stale pregame tap', () => {
    expect(render(kind, '2026-09-08T15:59:59Z')).toBeNull();
    const tap = elements(render(kind, START, { signedIn: false })).find(node => node.type === 'button')!.props.onClick!;
    vi.setSystemTime(START);
    tap();
    expect(hooks.setError).toHaveBeenCalledWith('Book tracking is locked because the game has started.');
    expect(hooks.push).not.toHaveBeenCalled();
    expect(hooks.started).not.toHaveBeenCalled();
  });

  it('blocks a confirmation held open across the exact kickoff boundary before any RPC', async () => {
    const confirm = elements(render(kind, START, { arming: 'tail' })).find(node => node.props.onConfirm)!.props.onConfirm!;
    vi.setSystemTime(START);
    await confirm(1, false);
    expect(hooks.rpc).not.toHaveBeenCalled();
    expect(hooks.addBet).not.toHaveBeenCalled();
    expect(hooks.setError).toHaveBeenCalledWith('Book tracking is locked because the game has started.');
  });

  it('confirms a valid future call using the real API and exact RPC identity', async () => {
    const confirm = elements(render(kind, '2026-09-08 17:00:00+00', { arming: 'tail' }))
      .find(node => node.props.onConfirm)!.props.onConfirm!;
    await confirm(2, true);
    expect(hooks.rpc).toHaveBeenCalledOnce();
    expect(hooks.rpc).toHaveBeenCalledWith(kind === 'game' ? 'place_user_bet' : 'place_user_prop_bet_v2',
      expect.objectContaining(kind === 'game'
        ? { p_pick_id: 'pick-2', p_kind: 'tail', p_stake: 2, p_streak: true }
        : { p_game_id: 'game-2', p_line: 1.5, p_side: 'over', p_kind: 'tail', p_stake: 2, p_streak: true }));
    expect(hooks.addBet).toHaveBeenCalledWith({ id: 'saved-exact-ticket' });
  });

  it('preserves an existing receipt with unknown time while disabling undo', async () => {
    const bet = {
      id: 'existing', game_date: '2026-09-08', pick_type: kind, kind: 'tail', status: 'pending',
      pick_text: 'Yankees ML', source_pick_id: 'pick-2', source_game_id: 'game-2',
      player_name: 'Aaron Judge', prop_type: 'hits', source_line: 1.5, source_side: 'over', stake_units: 1,
    } as UserBet;
    const chip = elements(render(kind, null, { mine: [bet] })).find(node => node.props.bet === bet)!;
    expect(chip).toBeDefined();
    expect(chip.props.locked).toBe(true);
    await chip.props.onUndo!();
    expect(hooks.rpc).not.toHaveBeenCalled();
    expect(hooks.removeBet).not.toHaveBeenCalled();
    expect(hooks.setError).toHaveBeenCalledWith('Book tracking is unavailable until the game start time is confirmed.');
  });
});

describe('exact prop sign-in return', () => {
  it('arms only the intended doubleheader game and line; an explicit second confirmation is still required', () => {
    const key = propIntentKey(prop.player, 'hits', prop.gameId, prop.line, prop.side)!;
    window.location.search = new URL(withBookIntent('/props', { kind: 'prop', side: 'fade', key }), 'https://gary.local').search;
    render('prop', START, { ticket: { gameId: 'game-1' } });
    render('prop', START, { ticket: { line: 0.5 } });
    render('prop', START);
    hooks.effects.forEach(effect => effect());
    vi.advanceTimersByTime(0);
    expect(hooks.setArming).toHaveBeenCalledExactlyOnceWith('fade');
    expect(hooks.rpc).not.toHaveBeenCalled();
  });

  it('ignores ambiguous legacy sign-in intent while keeping explicit manual taps usable', () => {
    window.location.search = '?book_kind=prop&book_side=tail&book_key=prop%3Aaaron%20judge%3Ahits';
    // Even a legacy card missing exact identity must not auto-arm that URL.
    const legacy = render('prop', START, { ticket: { gameId: undefined } });
    render('prop', START);
    hooks.effects.forEach(effect => effect());
    vi.advanceTimersByTime(0);
    expect(hooks.setArming).not.toHaveBeenCalled();
    elements(legacy).find(node => node.type === 'button')!.props.onClick!();
    expect(hooks.setArming).toHaveBeenCalledExactlyOnceWith('tail');
    expect(hooks.rpc).not.toHaveBeenCalled();
  });

  it('rechecks kickoff when a matching auth-return callback runs late', () => {
    const key = propIntentKey(prop.player, 'hits', prop.gameId, prop.line, prop.side)!;
    window.location.search = new URL(withBookIntent('/props', { kind: 'prop', side: 'tail', key }), 'https://gary.local').search;
    render('prop', START);
    hooks.effects.forEach(effect => effect());
    vi.setSystemTime(START);
    vi.advanceTimersByTime(0);
    expect(hooks.setArming).not.toHaveBeenCalled();
    expect(hooks.rpc).not.toHaveBeenCalled();
  });
});
