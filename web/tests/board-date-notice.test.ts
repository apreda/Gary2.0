import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoardDateNotice } from '@/components/BoardDateNotice';

const clock = vi.hoisted(() => ({ server: false }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  // Exercise the browser and hydration snapshots with the real date helper.
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown, server: () => unknown) =>
    clock.server ? server() : snapshot(),
}));

afterEach(() => { vi.useRealTimers(); clock.server = false; });

function notice(at: string, date = '2026-09-05') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  return renderToStaticMarkup(createElement(BoardDateNotice, { date }));
}

describe('cached board date notice', () => {
  it('labels yesterday as historical after the Eastern board rollover', () => {
    const html = notice('2026-09-06T10:00:00Z');
    expect(html).toContain('Sat, Sep 5');
    expect(html).toContain('These picks are historical');
    expect(html).toContain('Refresh board');
    expect(html).toContain('href="/archive"');
    expect(html).not.toContain('database');
  });

  it('keeps the previous night current until 3 AM Eastern', () => {
    expect(notice('2026-09-06T06:59:59Z')).toBe('');
    expect(notice('2026-09-06T07:00:00Z')).toContain('historical');
  });

  it('uses the Eastern rollover after daylight saving time ends', () => {
    expect(notice('2026-11-01T07:59:59Z', '2026-10-31')).toBe('');
    expect(notice('2026-11-01T08:00:00Z', '2026-10-31')).toContain('historical');
  });

  it('does not flag the current day or a future board', () => {
    expect(notice('2026-09-06T10:00:00Z', '2026-09-06')).toBe('');
    expect(notice('2026-09-06T10:00:00Z', '2026-09-07')).toBe('');
  });

  it('keeps the server and first hydration output independent of the browser clock', () => {
    clock.server = true;
    expect(notice('2026-09-06T10:00:00Z')).toBe('');
  });
});
