import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
const f = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[], log: vi.fn(), logged: vi.fn(), close: vi.fn(), milestone: vi.fn(), current: true }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => { const i = f.cursor++; if (!(i in f.cells)) f.cells[i] = typeof initial === 'function' ? initial() : initial; return [f.cells[i], (value: unknown) => { f.cells[i] = value; }]; },
  useRef: (initial: unknown) => { const i = f.cursor++; if (!(i in f.cells)) f.cells[i] = { current: initial }; return f.cells[i]; },
  useEffect: (effect: () => void | (() => void)) => { f.effects.push(effect); },
}));
vi.mock('@/lib/book/api', () => ({ logManual: f.log, updateBet: vi.fn() }));
vi.mock('@/lib/gary/analytics', () => ({ logBookMilestone: f.milestone }));
import { LogBet } from '@/components/book/LogBet';
type Props = { children?: ReactNode; maxLength?: number; onChange?: (e: { target: { value: string } }) => void; onSubmit?: (e: { preventDefault: () => void }) => Promise<void> };
function nodes(node: ReactNode, tag: string): Props[] {
  const found: Props[] = []; Children.forEach(node, child => { if (!isValidElement<Props>(child)) return; if (child.type === tag) found.push(child.props); found.push(...nodes(child.props.children, tag)); }); return found;
}
function render() { f.cursor = 0; f.effects = []; return LogBet({ ownerId: 'owner-a', isCurrent: () => f.current, onLogged: f.logged, onClose: f.close }); }
beforeEach(() => { vi.resetAllMocks(); f.cells = []; f.current = true; });
describe('manual form completion ownership', () => {
  it.each(['switch', 'unmount'] as const)('drops a late successful save after %s without contaminating callbacks or measurement', async reason => {
    render(); const cleanup = f.effects[0]();
    nodes(render(), 'input').find(p => p.maxLength === 300)!.onChange!({ target: { value: 'Owner A private entry' } });
    let finish!: (bet: { id: string }) => void;
    f.log.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const saving = nodes(render(), 'form')[0].onSubmit!({ preventDefault: vi.fn() });
    expect(f.log).toHaveBeenCalledWith(expect.objectContaining({ description: 'Owner A private entry' }), 'owner-a', expect.any(Function));
    if (reason === 'switch') f.current = false; else cleanup?.();
    expect(f.log.mock.calls[0][2]()).toBe(false);
    finish({ id: 'owner-a-row' }); await saving;
    expect(f.logged).not.toHaveBeenCalled(); expect(f.close).not.toHaveBeenCalled(); expect(f.milestone).not.toHaveBeenCalled();
  });
});
