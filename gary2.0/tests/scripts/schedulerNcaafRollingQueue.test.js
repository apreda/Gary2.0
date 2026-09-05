import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  childExecutionBudget,
  coalesceOverdueTiers,
  pendingEntriesForChildBudget,
  runRollingDecisionPipeline,
  scheduleEntryKey,
  takeReadyDecisionLaneEntries,
} from '../../scripts/lib/schedulerPolicy.js';

const epoch = Date.parse('2026-09-05T12:00:00Z'); // 08:00 ET
const laneKey = 'americanfootball_ncaaf';
function game(id, { trigger = 0, start = 240, tier = 1, sport = laneKey } = {}) {
  return {
    gameId: id, sport: { key: sport }, tier, slateDate: '2026-09-05',
    triggerTime: new Date(epoch + trigger * 60_000),
    startTime: new Date(epoch + start * 60_000),
  };
}
function budget(entry, pending, minute) {
  return childExecutionBudget({ entry,
    pendingEntries: pendingEntriesForChildBudget(entry, pending), now: epoch + minute * 60_000 });
}
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
afterEach(() => { vi.useRealTimers(); });

describe('college own-game execution deadlines', () => {
  it('does not let an unrelated 08:30 trigger kill a noon game or deny a queued primary its remaining window', () => {
    const noon = game(457178);
    const ownRetry = game(457178, { trigger: 60, tier: 2 });
    const laterGame = game(457165, { trigger: 30, start: 270 });
    const pending = [laterGame, ownRetry];
    const initial = budget(noon, pending, 0);
    expect(initial.timeoutMs).toBe(45 * 60_000);
    expect(initial.limitingReason).toBe('hard_cap');
    const queued = budget(noon, pending, 24 + 51 / 60);
    expect(queued.timeoutMs).toBe(33 * 60_000 + 9_000);
    expect(queued.deadlineAt.toISOString()).toBe('2026-09-05T12:58:00.000Z');
    expect(queued.limitingReason).toBe('next_trigger');
    expect(budget(noon, pending, 31).timeoutMs).toBe(27 * 60_000);
  });

  it('retains own retry, kickoff and hard-cap protection, including a window that has closed', () => {
    const noon = game(1);
    const retry = game(1, { trigger: 60, tier: 2 });
    expect(budget(noon, [retry], 58 + 5 / 60).timeoutMs).toBe(0);
    const final = game(1, { trigger: 210, tier: 4 });
    const late = budget(final, [], 210);
    expect(late.deadlineAt.toISOString()).toBe('2026-09-05T15:58:00.000Z');
    expect(late.limitingReason).toBe('game_start');
    expect(budget(final, [], 240).timeoutMs).toBe(0);
    expect(budget(noon, [], 0).timeoutMs).toBe(45 * 60_000);
  });
});

describe('bounded rolling college dispatch', () => {
  it('admits a newly due kickoff cluster into a free slot while earlier games continue', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const initial = [game(1), game(2), game(3)];
    const later = game(4, { trigger: 30, start: 270 });
    const ownRetry = game(1, { trigger: 60, tier: 2 });
    const nfl = game(5, { trigger: 0, sport: 'americanfootball_nfl' });
    let pending = [...initial, later, ownRetry, nfl];
    const events = [];
    let active = 0;
    let peak = 0;
    const running = runRollingDecisionPipeline({
      concurrency: 3,
      takeReadyEntries: (occupiedGameKeys, availableSlots) => {
        pending = coalesceOverdueTiers(pending, Date.now()).entries;
        const ready = takeReadyDecisionLaneEntries(pending, { laneKey, occupiedGameKeys, limit: availableSlots });
        pending = ready.remaining;
        return ready.selected;
      },
      runGame: async entry => {
        active += 1;
        peak = Math.max(peak, active);
        events.push(['start', entry.gameId, Date.now()]);
        await wait((entry.gameId === 3 || entry.gameId === 4 ? 5 : 40) * 60_000);
      },
      runProps: async entry => {
        events.push(['props', entry.gameId, Date.now()]);
        active -= 1;
      },
    });
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(events.filter(([kind]) => kind === 'start').map(([, id]) => id)).toEqual([1, 2, 3, 4]);
    expect(events.find(([kind, id]) => kind === 'start' && id === 4)[2]).toBe(epoch + 30 * 60_000);
    expect(events.some(([kind, id]) => kind === 'props' && id === 1)).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await running;
    expect(peak).toBe(3);
    expect(active).toBe(0);
    expect(pending).toContain(ownRetry);
    expect(pending).toContain(nfl);
  });

  it('leaves retries eligible and never admits one while the exact game is still finishing props', async () => {
    const primary = game(1);
    const retry = game(1, { trigger: 60, tier: 2 });
    const later = game(2, { trigger: 30, start: 270 });
    const started = game(3, { trigger: 0, start: 30 });
    const pending = [retry, later, started];
    const locked = takeReadyDecisionLaneEntries(pending, {
      laneKey, now: epoch + 61 * 60_000, occupiedGameKeys: new Set([scheduleEntryKey(primary)]), limit: 3,
    });
    expect(locked.selected).toEqual([later]);
    expect(locked.remaining).toEqual([retry, started]);
    const released = takeReadyDecisionLaneEntries(locked.remaining, { laneKey, now: epoch + 61 * 60_000, limit: 3 });
    expect(released.selected).toEqual([retry]);
    expect(released.remaining).toEqual([started]);
  });

  it('wires only college to its new three-worker queue and records coverage at actual dispatch', () => {
    const source = readFileSync(new URL('../../scripts/scheduler.js', import.meta.url), 'utf8');
    const college = source.slice(source.indexOf('const runNCAAFDecisionLane ='), source.indexOf('const trackedLane ='));
    expect(source).toContain('const NCAAF_GAME_DECISION_CONCURRENCY = 3;');
    expect(college).toContain('pendingEntries.push(...ncaafGames)');
    expect(college).toContain('await runRollingDecisionPipeline({');
    expect(college).toContain("laneKey: 'americanfootball_ncaaf', occupiedGameKeys, limit: availableSlots");
    expect(college).toContain('coverageBatch.push(...ready.selected)');
    expect(college).toContain('runGame: runGameDecision');
    expect(college).toContain('runProps: runPropDecision');
    const nfl = source.slice(source.indexOf('const runNFLDecisionLane ='), source.indexOf('const runNCAAFDecisionLane ='));
    expect(nfl).toContain('await runPerGameDecisionPipeline({');
    expect(nfl).toContain('concurrency: NFL_GAME_DECISION_CONCURRENCY');
  });
});
