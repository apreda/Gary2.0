import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeReading } from '@/lib/gary/reading-visibility';
let callback: IntersectionObserverCallback;
let doc: EventTarget & { visibilityState: string };
let rect = { top: 0, bottom: 200 };
let hasBox = true;
const element = { getBoundingClientRect: () => rect, getClientRects: () => hasBox ? [rect] : [] } as unknown as Element;
const enter = (height = 200) => callback([{ target: element, isIntersecting: height > 0, intersectionRect: { height } } as IntersectionObserverEntry], {} as IntersectionObserver);
beforeEach(() => {
  vi.useFakeTimers(); rect = { top: 0, bottom: 200 }; hasBox = true;
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', { innerHeight: 800 });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: IntersectionObserverCallback) { callback = cb; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('visible reasoning milestone', () => {
  it('requires five continuous foreground seconds, once, even as intersection ratios change', () => {
    const read = vi.fn(); const cleanup = observeReading(element, read);
    vi.advanceTimersByTime(10000); expect(read).not.toHaveBeenCalled();
    enter(); vi.advanceTimersByTime(3000); enter(100); vi.advanceTimersByTime(1999);
    expect(read).not.toHaveBeenCalled(); vi.advanceTimersByTime(1); expect(read).toHaveBeenCalledTimes(1);
    enter(); vi.advanceTimersByTime(10000); expect(read).toHaveBeenCalledTimes(1); cleanup();
  });
  it('restarts after hiding the tab or scrolling away and cancels on unmount', () => {
    const read = vi.fn(); const cleanup = observeReading(element, read);
    enter(); vi.advanceTimersByTime(4000); doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10000); expect(read).not.toHaveBeenCalled();
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(4000); enter(0); enter(); vi.advanceTimersByTime(4000);
    expect(read).not.toHaveBeenCalled(); cleanup(); vi.advanceTimersByTime(10000); expect(read).not.toHaveBeenCalled();
  });
  it('can measure a mounted card again after a later foreground visit', () => {
    const read = vi.fn(); const cleanup = observeReading(element, read);
    enter(); vi.advanceTimersByTime(5000); expect(read).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(24 * 60 * 60_000);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000); expect(read).toHaveBeenCalledTimes(2); cleanup();
  });
  it('does not count a closed reasoning details block or a thin sliver', () => {
    const read = vi.fn(); const cleanup = observeReading(element, read);
    enter(20); vi.advanceTimersByTime(10000); expect(read).not.toHaveBeenCalled();
    enter(); hasBox = false; vi.advanceTimersByTime(5000); expect(read).not.toHaveBeenCalled(); cleanup();
  });
});
