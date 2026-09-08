import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';

const hooks = vi.hoisted(() => ({ useState: vi.fn(), setDays: vi.fn(), setLoading: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: hooks.useState,
  useEffect: vi.fn(),
}));
import { PublicProfile } from '@/components/book/PublicProfile';

const record = {
  profile: { display_name: 'Fixture player', handle: 'fixture', bio: null, avatar: null },
  wins: 5, losses: 2, graded: 7,
  tail: { wins: 3, losses: 1 }, fade: { wins: 2, losses: 1 },
  gary_on_same_picks: { wins: 4, losses: 3 },
  streak: { current: 2, best: 3 }, window_start: '2026-08-09', window_end: '2026-09-07',
};

function dateButtons(days: number) {
  // Supply an already-loaded profile, then exercise its real rendered event
  // handlers. API effects are outside this regression's interaction boundary.
  hooks.useState.mockReturnValueOnce([days, hooks.setDays])
    .mockReturnValueOnce([record, vi.fn()])
    .mockReturnValueOnce([false, hooks.setLoading])
    .mockReturnValueOnce([null, vi.fn()])
    .mockReturnValueOnce([0, vi.fn()]);
  const buttons: { 'aria-pressed': boolean; onClick: () => void }[] = [];
  const walk = (node: ReactNode) => Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode; 'aria-pressed': boolean; onClick: () => void }>(child)) return;
    if (child.type === 'button') buttons.push(child.props);
    walk(child.props.children);
  });
  walk(PublicProfile({ userId: 'fixture-player' }));
  return buttons;
}

beforeEach(() => vi.resetAllMocks());

describe('public profile record window interaction', () => {
  it.each([7, 30, 365])('keeps the loaded record visible when %i days is clicked again', (days) => {
    const selected = dateButtons(days).find((button) => button['aria-pressed']);
    expect(selected).toBeDefined();
    selected!.onClick();
    expect(hooks.setLoading).not.toHaveBeenCalled();
    expect(hooks.setDays).not.toHaveBeenCalled();
  });

  it('loads the newly selected record window', () => {
    dateButtons(30)[0].onClick();
    expect(hooks.setLoading).toHaveBeenCalledExactlyOnceWith(true);
    expect(hooks.setDays).toHaveBeenCalledExactlyOnceWith(7);
  });
});
