import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runRollingDecisionPipeline,
  reanchorGameSchedule,
  retireGameSchedule,
  scheduleEntryKey,
  setGameScheduleHold,
  sharedLaneConcurrency,
  takeReadySharedEntries,
} from '../../scripts/lib/schedulerPolicy.js';

const epoch = Date.parse('2026-09-05T00:00:00Z');
function game(id, { trigger = 0, start = 90, sport = 'baseball_mlb', tier = 1 } = {}) {
  return {
    gameId: id, sport: { key: sport }, tier,
    triggerTime: new Date(epoch + trigger * 60_000),
    startTime: new Date(epoch + start * 60_000),
  };
}
function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); });

describe('rolling shared scheduler queue', () => {
  it('defaults to three complete pipelines, with an explicit hard cap of four', () => {
    expect(sharedLaneConcurrency({})).toBe(3);
    expect(sharedLaneConcurrency({ GARY_SCHEDULER_SHARED_CONCURRENCY: '1' })).toBe(1);
    expect(sharedLaneConcurrency({ GARY_SCHEDULER_SHARED_CONCURRENCY: '2' })).toBe(2);
    expect(sharedLaneConcurrency({ GARY_SCHEDULER_SHARED_CONCURRENCY: '99' })).toBe(4);
    for (const value of ['0', '-1', 'NaN', '2.5', '']) {
      expect(sharedLaneConcurrency({ GARY_SCHEDULER_SHARED_CONCURRENCY: value })).toBe(3);
    }
  });

  it('takes only due viable shared games and retains in-flight retries', () => {
    const active = game(1);
    const retry = game(1, { tier: 2 });
    const held = game(2);
    setGameScheduleHold([held], held, 'delayed');
    const future = game(3, { trigger: 5 });
    const started = game(4, { start: -1 });
    const football = game(5, { sport: 'americanfootball_nfl' });
    const due = game(6);
    const entries = [retry, held, future, started, football, due];
    const result = takeReadySharedEntries(entries, {
      now: epoch, occupiedGameKeys: new Set([scheduleEntryKey(active)]),
    });
    expect(result.selected).toEqual([due]);
    expect(result.remaining).toEqual([retry, held, future, started, football]);
    expect(entries).toHaveLength(6);
  });

  it('takes only free slots in earliest-start order and leaves every other tier live', () => {
    const later = game(1, { trigger: -40, start: 80 });
    const earlier = game(2, { trigger: -5, start: 20 });
    const fetchRetry = { kind: 'sport_fetch_retry', sport: later.sport, dateStr: '2026-09-04', triggerTime: new Date(epoch) };
    const entries = [later, fetchRetry, earlier];
    expect(takeReadySharedEntries(entries, { now: epoch, limit: 1 }))
      .toEqual({ selected: [earlier], remaining: [later, fetchRetry] });
    expect(takeReadySharedEntries(entries, { now: epoch, limit: 0 }))
      .toEqual({ selected: [], remaining: entries });
  });

  it.each(['delayed', 'postponed', 'moved-later'])('keeps an initial waiting game visible when official state becomes %s', async (state) => {
    const first = game(1, { start: 50 });
    const waiting = { ...game(2), leadMin: 90 };
    // Scheduler returns its initial shared batch here before launching slots.
    let pending = [first, waiting];
    const busy = gate();
    const starts = [];
    const takeReadyEntries = (occupiedGameKeys, availableSlots) => {
      const ready = takeReadySharedEntries(pending, { now: epoch, occupiedGameKeys, limit: availableSlots });
      pending = ready.remaining;
      return ready.selected;
    };
    const runGame = async ({ gameId }) => {
      starts.push(gameId);
      if (gameId === 1) await busy.promise;
    };
    const running = runRollingDecisionPipeline({
      concurrency: 1, now: () => epoch, takeReadyEntries, runGame, runProps: async () => {},
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending).toEqual([waiting]);
    if (state === 'delayed') setGameScheduleHold(pending, waiting, 'delayed');
    if (state === 'postponed') retireGameSchedule(pending, waiting, 'postponed');
    if (state === 'moved-later') reanchorGameSchedule(pending, waiting, new Date(epoch + 150 * 60_000));
    busy.resolve();
    await running;
    expect(starts).toEqual([1]);
    expect(pending).toEqual([waiting]);
    if (state === 'delayed') {
      setGameScheduleHold(pending, waiting, null);
      await runRollingDecisionPipeline({
        concurrency: 1, now: () => epoch, takeReadyEntries, runGame, runProps: async () => {},
      });
      expect(starts).toEqual([1, 2]);
      expect(pending).toEqual([]);
    }
  });

  it('orders due games by first pitch instead of an older lineup trigger', async () => {
    const starts = [];
    await runRollingDecisionPipeline({
      entries: [game(1, { trigger: -40, start: 80 }), game(2, { trigger: -5, start: 20 })],
      concurrency: 1, now: () => epoch,
      runGame: async ({ gameId }) => { starts.push(gameId); },
      runProps: async () => {},
    });
    expect(starts).toEqual([2, 1]);
  });

  it('never starts a future tier early, even when a worker is free', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const starts = [];
    const running = runRollingDecisionPipeline({
      entries: [game(1, { trigger: 1 })], concurrency: 3,
      runGame: async () => { starts.push(Date.now()); }, runProps: async () => {},
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await running;
    expect(starts).toEqual([epoch + 60_000]);
  });

  it('starts a later batch in a freed slot while the original slow game continues', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const slow = gate();
    const events = [];
    let pending = [game(3, { trigger: 5, start: 30 })];
    const running = runRollingDecisionPipeline({
      entries: [game(1), game(2)], concurrency: 2,
      takeReadyEntries: (occupiedGameKeys) => {
        const ready = takeReadySharedEntries(pending, { occupiedGameKeys });
        pending = ready.remaining;
        return ready.selected;
      },
      runGame: async ({ gameId }) => {
        events.push(`game-${gameId}`);
        if (gameId === 1) await slow.promise;
      },
      runProps: async ({ gameId }) => { events.push(`props-${gameId}`); },
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(events).toEqual(['game-1', 'game-2', 'props-2', 'game-3', 'props-3']);
    expect(pending).toEqual([]);
    slow.resolve();
    await running;
    expect(events.at(-1)).toBe('props-1');
  });

  it('keeps the exact-game lock through props while its retry becomes due', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const props = gate();
    const attempts = [];
    let pending = [game(1, { trigger: 1, tier: 2 })];
    const running = runRollingDecisionPipeline({
      entries: [game(1)], concurrency: 3,
      takeReadyEntries: (occupiedGameKeys) => {
        const ready = takeReadySharedEntries(pending, { occupiedGameKeys });
        pending = ready.remaining;
        return ready.selected;
      },
      runGame: async ({ tier }) => { attempts.push(tier); },
      runProps: async ({ tier }) => { if (tier === 1) await props.promise; },
    });
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(attempts).toEqual([1]);
    expect(pending).toHaveLength(1);
    props.resolve();
    await running;
    expect(attempts).toEqual([1, 2]);
  });

  it('bounds all game and props work across a larger slate', async () => {
    const gates = [gate(), gate(), gate()];
    let active = 0;
    let peak = 0;
    const starts = [];
    const running = runRollingDecisionPipeline({
      entries: Array.from({ length: 8 }, (_, i) => game(i)), concurrency: 3,
      runGame: async ({ gameId }) => {
        starts.push(gameId);
        active += 1;
        peak = Math.max(peak, active);
      },
      runProps: async ({ gameId }) => {
        if (gameId < 3) await gates[gameId].promise;
        active -= 1;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toEqual([0, 1, 2]);
    gates.forEach(({ resolve }) => resolve());
    await running;
    expect(peak).toBe(3);
    expect(active).toBe(0);
    expect(starts).toHaveLength(8);
  });

  it('observes other active work before surfacing an unexpected runner failure', async () => {
    const remaining = gate();
    const events = [];
    const running = runRollingDecisionPipeline({
      entries: [game(1), game(2), game(3)], concurrency: 2,
      runGame: async ({ gameId }) => {
        events.push(`game-${gameId}`);
        if (gameId === 1) throw new Error('runner crashed');
        await remaining.promise;
      },
      runProps: async ({ gameId }) => { events.push(`props-${gameId}`); },
    });
    const observed = running.then(() => 'completed', (error) => error.message);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['game-1', 'game-2']);
    remaining.resolve();
    expect(await observed).toBe('runner crashed');
    expect(events).toEqual(['game-1', 'game-2', 'props-2']);
  });
});
