import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ useState: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: hooks.useState, useEffect: vi.fn(), useRef: () => ({ current: 0 }),
}));
import { WinnersClient } from '@/components/book/WinnersClient';

function textOf(node: ReactNode): string {
  let text = '';
  Children.forEach(node, child => {
    if (typeof child === 'string') text += child;
    else if (isValidElement<{ children?: ReactNode }>(child)) text += textOf(child.props.children);
  });
  return text;
}
beforeEach(() => vi.resetAllMocks());

it.each(['2026-09-04', '2026-09-08'])('does not promise future reviews for an empty board on %s', date => {
  hooks.useState.mockReturnValueOnce([date, vi.fn()])
    .mockReturnValueOnce(['all', vi.fn()])
    .mockReturnValueOnce([{ tickets: [], boards: [], access: {} }, vi.fn()])
    .mockReturnValueOnce([null, vi.fn()])
    .mockReturnValueOnce([0, vi.fn()]);
  const copy = textOf(WinnersClient());
  expect(copy).toContain('an empty board is a valid result');
  expect(copy).toContain('Try another sport or board date');
  expect(copy).not.toContain('reviews finish');
});
