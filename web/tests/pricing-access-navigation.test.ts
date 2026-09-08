import { Children, isValidElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ selection: { plan: 'all_access_annual', sport: undefined as string | undefined } }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: () => [hooks.selection, vi.fn()],
  useEffect: vi.fn(),
}));
import { PricingPlans } from '@/components/PricingPlans';

afterEach(() => vi.unstubAllGlobals());

describe('pricing access navigation', () => {
  it.each([
    { plan: 'single', sport: 'NFL' },
    { plan: 'all_access', sport: undefined },
    { plan: 'all_access_annual', sport: undefined },
  ])('returns $plan visitors to their membership after sign-in', selection => {
    hooks.selection = selection;
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    let checkAccess: (() => void) | undefined;
    const walk = (node: ReactNode) => Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
      if (child.type === 'button' && typeof child.props.children === 'string' && child.props.children.startsWith('CHECK YOUR')) {
        checkAccess = child.props.onClick;
      }
      walk(child.props.children);
    });
    walk(PricingPlans());

    expect(checkAccess).toBeDefined();
    checkAccess!();
    expect(assign).toHaveBeenCalledOnce();
    const destination = new URL(assign.mock.calls[0][0], 'https://www.betwithgary.ai');
    expect(destination.pathname).toBe('/account');
    expect(destination.searchParams.get('next')).toBe('/account');
  });
});
