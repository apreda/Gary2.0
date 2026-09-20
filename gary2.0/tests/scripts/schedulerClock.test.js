import { afterEach, expect, it, vi } from 'vitest';
import { getTodayETDateStr, getTomorrowETDateStr, instantForETDate } from '../../scripts/lib/schedulerClock.js';

import { runBounded } from '../../scripts/lib/asyncPool.js';

afterEach(() => vi.useRealTimers());

it.each([
  ['2026-01-15', '2026-01-15T10:00:00.000Z'],
  ['2026-07-15', '2026-07-15T09:00:00.000Z'],
  ['2026-03-08', '2026-03-08T09:00:00.000Z'],
  ['2026-11-01', '2026-11-01T10:00:00.000Z'],
])('anchors the 5AM scheduler plan across Eastern DST: %s', (date, expected) => {
  expect(instantForETDate(date, 5, 0).toISOString()).toBe(expected);
});

it('keeps late-evening scheduling on the Eastern date across UTC and year rollover', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-01T02:00:00Z'));
  expect(getTodayETDateStr()).toBe('2026-12-31');
  expect(getTomorrowETDateStr()).toBe('2027-01-01');
});

it('runs each item once without exceeding the configured concurrency', async () => {
  let active = 0, peak = 0;
  const seen = [];
  await runBounded([1, 2, 3, 4, 5], 2, async item => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    seen.push(item);
    active--;
  });
  expect(peak).toBe(2);
  expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
});
