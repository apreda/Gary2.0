import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  activeNcaafRecoverySlateDate,
  childExecutionBudget,
  coalesceOverdueTiers,
  gameHasStarted,
  hasUrgentUpcomingTrigger,
  isFinalPendingTier,
  isSportFetchRetryEntry,
  makeSportFetchRetryEntry,
  ncaafClusterConcurrency,
  nextTriggerBatch,
  laneOwnsMlbDriftGuard,
  newScheduleEntries,
  pendingNcaafKickoffRefreshEntries,
  partitionDecisionLaneSchedules,
  pendingEntriesForChildBudget,
  pendingEntriesForDecisionLane,
  partitionNcaafKickoffReadiness,
  partitionStartedEntries,
  reanchorGameSchedule,
  runIndependentDecisionLanes,
  runIndependentScheduleLanes,
  runPerGameDecisionPipeline,
  scheduleEntryKey,
  schedulerChildArgs,
  schedulerSlateDateForSport,
  sportFetchRetryIsCurrent,
  sportFetchRetryDelayMs,
} from '../../scripts/lib/schedulerPolicy.js';

const schedulerSource = readFileSync(new URL('../../scripts/scheduler.js', import.meta.url), 'utf8');
const picksRunnerSource = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');
const propsRunnerSource = readFileSync(new URL('../../scripts/run-agentic-props-cli.js', import.meta.url), 'utf8');

function entry({ sport = 'baseball_mlb', id = 1, start = '2026-08-15T18:00:00Z', lead = 90 } = {}) {
  const startTime = new Date(start);
  return {
    sport: { key: sport },
    gameId: id,
    startTime,
    triggerTime: new Date(startTime.getTime() - lead * 60_000),
    leadMin: lead,
  };
}

describe('scheduler reliability policy', () => {
  it('schedules confirmed NCAAF games while isolating date-only games by exact id', () => {
    const result = partitionNcaafKickoffReadiness([
      { id: 10, date: '2026-08-29T16:00:00Z' },
      { id: 11, date: '2026-08-29' },
      { id: 12 },
      { id: 13, date: '2026-08-30T16:00:00Z' },
      { id: 14, date: '2026-08-30T05:30:00Z' }, // 1:30 AM ET, still Aug 29 slate
      { id: 15, date: '2026-08-30T10:00:00Z' }, // 6:00 AM ET, Aug 30 slate
    ], '2026-08-29');

    expect(result.confirmed.map(({ raw }) => raw.id)).toEqual([10, 14]);
    expect(result.confirmed[0].startTime.toISOString()).toBe('2026-08-29T16:00:00.000Z');
    expect(result.retryGameIds).toEqual(['11', '12']);
    expect(result.pending.map(({ kickoff }) => kickoff.iso)).toEqual([null, null]);
    expect(result.outsideDate.map(({ id }) => id)).toEqual([13, 15]);
    expect(result.retryAll).toBe(false);

    expect(schedulerSource).toContain('confirmed games stay scheduled; unresolved ids retry independently');
    expect(schedulerSource).toContain('retrying this exact id without scheduling a deadline');
    expect(schedulerSource).toContain('gameIds: retry.gameIds');
    expect(schedulerSource).toContain('exactNcaafGameIds.length > 0 ? 0 : 10');
  });

  it('keeps NCAAF retries on the prior slate through 5:59 ET and rolls at 6:00', () => {
    const retry = makeSportFetchRetryEntry({
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-09-05',
      now: new Date('2026-09-06T05:00:00Z'),
    });
    expect(schedulerSlateDateForSport('americanfootball_ncaaf', '2026-09-06T09:59:59Z'))
      .toBe('2026-09-05');
    expect(sportFetchRetryIsCurrent(retry, '2026-09-06T09:59:59Z')).toBe(true);
    expect(activeNcaafRecoverySlateDate('2026-09-06T09:59:59Z')).toBe('2026-09-05');
    const nextSlateRetry = makeSportFetchRetryEntry({
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-09-06',
      now: new Date('2026-09-06T05:00:00Z'),
    });
    expect(sportFetchRetryIsCurrent(nextSlateRetry, '2026-09-06T09:59:59Z')).toBe(true);
    expect(sportFetchRetryIsCurrent(retry, '2026-09-06T10:00:00Z')).toBe(false);
    expect(sportFetchRetryIsCurrent(nextSlateRetry, '2026-09-06T10:00:00Z')).toBe(true);
    expect(activeNcaafRecoverySlateDate('2026-09-06T10:00:00Z')).toBeNull();
  });

  it('passes a stable slate date only to NCAAF children and fails closed without one', () => {
    const ncaaf = { ...entry({ sport: 'americanfootball_ncaaf' }), slateDate: '2026-09-05' };
    expect(schedulerChildArgs(ncaaf, ['--game-id', '1']))
      .toEqual(['--game-id', '1', '--date', '2026-09-05']);
    expect(schedulerChildArgs(entry({ sport: 'americanfootball_nfl' }), ['--game-id', '1']))
      .toEqual(['--game-id', '1']);
    expect(schedulerChildArgs(entry({ sport: 'baseball_mlb' }), ['--game-id', '1']))
      .toEqual(['--game-id', '1']);
    expect(() => schedulerChildArgs(entry({ sport: 'americanfootball_ncaaf' }), []))
      .toThrow(/requires a canonical slateDate/);
  });

  it('keys games by sport and provider game id', () => {
    expect(scheduleEntryKey(entry({ sport: 'baseball_mlb', id: 12 }))).toBe('baseball_mlb:12');
    expect(scheduleEntryKey(entry({ sport: 'americanfootball_nfl', id: 12 }))).toBe('americanfootball_nfl:12');
  });

  it('backs off a failed sport in the dynamic queue without colliding with games', () => {
    const retry = makeSportFetchRetryEntry({
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-08-29',
      attempt: 3,
      now: new Date('2026-08-29T10:00:00Z'),
    });
    expect(isSportFetchRetryEntry(retry)).toBe(true);
    expect(scheduleEntryKey(retry)).toBe('fetch:americanfootball_ncaaf:2026-08-29');
    expect(retry.triggerTime.toISOString()).toBe('2026-08-29T10:04:00.000Z');
    expect(sportFetchRetryDelayMs(8)).toBe(20 * 60_000);
    expect(gameHasStarted(retry, new Date('2026-08-30T00:00:00Z'))).toBe(false);
  });

  it('normalizes and keys exact NCAAF retry ids independently', () => {
    const retry = makeSportFetchRetryEntry({
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-08-29',
      gameIds: [502, '501', 502],
      now: new Date('2026-08-29T10:00:00Z'),
    });
    expect(retry.gameIds).toEqual(['501', '502']);
    expect(scheduleEntryKey(retry)).toBe('fetch:americanfootball_ncaaf:2026-08-29:501,502');
  });

  it('fails closed to a full retry when a pending NCAAF game has no exact id', () => {
    const result = partitionNcaafKickoffReadiness([
      { date: '2026-08-29' },
    ], '2026-08-29');
    expect(result.confirmed).toEqual([]);
    expect(result.retryGameIds).toEqual([]);
    expect(result.retryAll).toBe(true);
  });

  it('rejects a game at or after its official start', () => {
    const game = entry();
    expect(gameHasStarted(game, new Date('2026-08-15T17:59:59Z'))).toBe(false);
    expect(gameHasStarted(game, new Date('2026-08-15T18:00:00Z'))).toBe(true);
    const split = partitionStartedEntries([game, entry({ id: 2, start: '2026-08-15T19:00:00Z' })], new Date('2026-08-15T18:30:00Z'));
    expect(split.stale.map((item) => item.gameId)).toEqual([1]);
    expect(split.runnable.map((item) => item.gameId)).toEqual([2]);
  });

  it('detects an urgent upcoming trigger without treating finished games as urgent', () => {
    const now = new Date('2026-08-15T17:00:00Z');
    const urgent = entry({ id: 1, start: '2026-08-15T18:00:00Z', lead: 45 });
    const later = entry({ id: 2, start: '2026-08-15T21:00:00Z', lead: 90 });
    const started = entry({ id: 3, start: '2026-08-15T16:00:00Z', lead: 15 });
    expect(hasUrgentUpcomingTrigger([urgent, later, started], now)).toBe(true);
    expect(hasUrgentUpcomingTrigger([later, started], now)).toBe(false);
  });

  it('reserves a safety buffer before the next queued trigger', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const current = entry({ id: 1, start: '2026-08-15T20:00:00Z' });
    const next = {
      ...entry({ id: 2, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T18:15:00Z'),
    };
    const budget = childExecutionBudget({ entry: current, pendingEntries: [next], now });
    expect(budget.timeoutMs).toBe(13 * 60_000);
    expect(budget.deadlineAt.toISOString()).toBe('2026-08-15T18:13:00.000Z');
    expect(budget.nextTriggerAt.toISOString()).toBe('2026-08-15T18:15:00.000Z');
    expect(budget.limitingReason).toBe('next_trigger');
  });

  it('stops before the child game starts when that deadline comes first', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const current = entry({ id: 1, start: '2026-08-15T18:10:00Z' });
    const next = {
      ...entry({ id: 2, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T18:30:00Z'),
    };
    const budget = childExecutionBudget({ entry: current, pendingEntries: [next], now });
    expect(budget.timeoutMs).toBe(8 * 60_000);
    expect(budget.limitingReason).toBe('game_start');
  });

  it('fails fast when another still-live trigger is already due', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const current = entry({ id: 1, start: '2026-08-15T20:00:00Z' });
    const overdue = {
      ...entry({ id: 2, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T17:59:00Z'),
    };
    const budget = childExecutionBudget({ entry: current, pendingEntries: [overdue], now });
    expect(budget.timeoutMs).toBe(0);
    expect(budget.limitingReason).toBe('next_trigger');
  });

  it('keeps independent NFL and shared clocks from terminating each other', () => {
    const now = new Date('2026-08-15T18:29:00Z'); // 2:29 PM ET
    const yankeesT60 = {
      ...entry({ sport: 'baseball_mlb', id: 5059619, start: '2026-08-15T19:07:00Z', lead: 60 }),
      triggerTime: new Date('2026-08-15T18:07:00Z'),
    };
    const nflT90 = {
      ...entry({ sport: 'americanfootball_nfl', id: 1393560, start: '2026-08-15T20:00:00Z', lead: 90 }),
      triggerTime: new Date('2026-08-15T18:30:00Z'),
    };
    const yankeesT30 = {
      ...yankeesT60,
      triggerTime: new Date('2026-08-15T18:37:00Z'),
      leadMin: 30,
    };
    const activeLanes = new Set(['shared', 'americanfootball_nfl']);
    const sharedPending = pendingEntriesForDecisionLane(yankeesT60, [yankeesT30, nflT90], activeLanes);
    expect(sharedPending).toEqual([yankeesT30]);
    const sharedBudget = childExecutionBudget({
      entry: yankeesT60,
      pendingEntries: sharedPending,
      now,
    });
    expect(sharedBudget.timeoutMs).toBe(6 * 60_000);
    expect(sharedBudget.nextTriggerAt.toISOString()).toBe('2026-08-15T18:37:00.000Z');

    const nflT60 = {
      ...nflT90,
      triggerTime: new Date('2026-08-15T19:00:00Z'),
      leadMin: 60,
    };
    const unrelatedMlb = {
      ...yankeesT30,
      triggerTime: new Date('2026-08-15T18:32:00Z'),
    };
    const nflPending = pendingEntriesForDecisionLane(nflT90, [unrelatedMlb, nflT60], activeLanes);
    expect(nflPending).toEqual([nflT60]);
    const nflBudget = childExecutionBudget({ entry: nflT90, pendingEntries: nflPending, now });
    expect(nflBudget.timeoutMs).toBe(29 * 60_000);
    expect(nflBudget.nextTriggerAt.toISOString()).toBe('2026-08-15T19:00:00.000Z');
    expect(nflBudget.limitingReason).toBe('next_trigger');
  });

  it('never terminates an MLB child merely because its next retry clock arrives', () => {
    const now = new Date('2026-08-15T19:45:07Z');
    const rockiesT30 = {
      ...entry({ sport: 'baseball_mlb', id: 5059620, start: '2026-08-15T20:05:00Z', lead: 30 }),
      triggerTime: new Date('2026-08-15T19:35:00Z'),
    };
    const rockiesT15 = {
      ...rockiesT30,
      triggerTime: new Date('2026-08-15T19:50:00Z'),
      leadMin: 15,
    };
    const pending = pendingEntriesForChildBudget(
      rockiesT30,
      [rockiesT15],
      new Set(['shared']),
    );
    expect(pending).toEqual([]);

    const budget = childExecutionBudget({
      entry: rockiesT30,
      pendingEntries: pending,
      now,
    });
    expect(budget.limitingReason).toBe('game_start');
    expect(budget.deadlineAt.toISOString()).toBe('2026-08-15T20:03:00.000Z');
    expect(budget.timeoutMs).toBe(17 * 60_000 + 53_000);
  });

  it('still applies the hard cap to an MLB child whose first pitch is distant', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const mlb = entry({ sport: 'baseball_mlb', start: '2026-08-15T23:00:00Z', lead: 90 });
    const budget = childExecutionBudget({
      entry: mlb,
      pendingEntries: pendingEntriesForChildBudget(mlb, [entry({ id: 2 })]),
      now,
    });
    expect(budget.limitingReason).toBe('hard_cap');
    expect(budget.deadlineAt.toISOString()).toBe('2026-08-15T18:45:00.000Z');
  });

  it('retains next-trigger protection for football children', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const nfl = entry({ sport: 'americanfootball_nfl', id: 10, start: '2026-08-15T20:00:00Z' });
    const nextNfl = {
      ...entry({ sport: 'americanfootball_nfl', id: 11, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T18:15:00Z'),
    };
    const pending = pendingEntriesForChildBudget(nfl, [nextNfl], new Set(['americanfootball_nfl']));
    const budget = childExecutionBudget({ entry: nfl, pendingEntries: pending, now });
    expect(pending).toEqual([nextNfl]);
    expect(budget.limitingReason).toBe('next_trigger');
    expect(budget.deadlineAt.toISOString()).toBe('2026-08-15T18:13:00.000Z');
  });

  it('partitions full-day execution into shared, NFL, and NCAAF lanes', () => {
    const mlb = entry({ sport: 'baseball_mlb', id: 1 });
    const nba = entry({ sport: 'basketball_nba', id: 2 });
    const nfl = entry({ sport: 'americanfootball_nfl', id: 3 });
    const ncaaf = entry({ sport: 'americanfootball_ncaaf', id: 4 });
    const lanes = partitionDecisionLaneSchedules([mlb, nfl, nba, ncaaf]);

    expect(lanes).toEqual([
      { laneKey: 'shared', entries: [mlb, nba] },
      { laneKey: 'americanfootball_nfl', entries: [nfl] },
      { laneKey: 'americanfootball_ncaaf', entries: [ncaaf] },
    ]);
    expect(laneOwnsMlbDriftGuard('shared', [mlb, nba])).toBe(true);
    expect(laneOwnsMlbDriftGuard('shared', [nba])).toBe(false);
    expect(laneOwnsMlbDriftGuard('americanfootball_nfl', [mlb])).toBe(false);
  });

  it('starts football schedule lanes without waiting for a blocked MLB lane', async () => {
    const mlb = entry({ sport: 'baseball_mlb', id: 1 });
    const nfl = entry({ sport: 'americanfootball_nfl', id: 2 });
    const ncaaf = entry({ sport: 'americanfootball_ncaaf', id: 3 });
    const events = [];
    let releaseMlb;
    const mlbGate = new Promise((resolve) => { releaseMlb = resolve; });

    const running = runIndependentScheduleLanes([mlb, nfl, ncaaf], async (_entries, laneKey) => {
      events.push(`${laneKey}-start`);
      if (laneKey === 'shared') await mlbGate;
      events.push(`${laneKey}-done`);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual([
      'shared-start',
      'americanfootball_nfl-start',
      'americanfootball_nfl-done',
      'americanfootball_ncaaf-start',
      'americanfootball_ncaaf-done',
    ]);

    releaseMlb();
    await running;
    expect(events.at(-1)).toBe('shared-done');
  });

  it('keeps an un-enrolled lane as a deadline until that lane is active in the batch', () => {
    const now = new Date('2026-08-15T19:20:00Z');
    const mlb = {
      ...entry({ sport: 'baseball_mlb', id: 50, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T19:07:00Z'),
    };
    const nfl = {
      ...entry({ sport: 'americanfootball_nfl', id: 60, start: '2026-08-15T21:00:00Z' }),
      triggerTime: new Date('2026-08-15T19:30:00Z'),
    };
    const activeLanes = new Set(['shared']);

    const blocking = pendingEntriesForDecisionLane(mlb, [nfl], activeLanes);
    expect(blocking).toEqual([nfl]);
    const capped = childExecutionBudget({ entry: mlb, pendingEntries: blocking, now });
    expect(capped.timeoutMs).toBe(8 * 60_000);
    expect(capped.limitingReason).toBe('next_trigger');

    activeLanes.add('americanfootball_nfl');
    expect(pendingEntriesForDecisionLane(mlb, [nfl], activeLanes)).toEqual([]);
    activeLanes.delete('americanfootball_nfl');
    expect(pendingEntriesForDecisionLane(mlb, [nfl], activeLanes)).toEqual([nfl]);
  });

  it('does not reserve child time for an already-started pending game', () => {
    const now = new Date('2026-08-15T18:00:00Z');
    const current = entry({ id: 1, start: '2026-08-15T20:00:00Z' });
    const stale = {
      ...entry({ id: 2, start: '2026-08-15T17:00:00Z' }),
      triggerTime: new Date('2026-08-15T16:45:00Z'),
    };
    const budget = childExecutionBudget({ entry: current, pendingEntries: [stale], now });
    expect(budget.timeoutMs).toBe(45 * 60_000);
    expect(budget.limitingReason).toBe('hard_cap');
    expect(budget.nextTriggerAt).toBeNull();
  });

  it('forms a batch from the first trigger without chaining a dense slate', () => {
    const base = Date.parse('2026-08-15T12:00:00Z');
    const entries = [0, 10, 20].map((minutes, index) => ({
      ...entry({ id: index + 1 }),
      triggerTime: new Date(base + minutes * 60_000),
    }));
    expect(nextTriggerBatch(entries).map((item) => item.gameId)).toEqual([1, 2]);
  });

  it('enrolls an imminent NFL lane beside overdue MLB without pulling same-lane tiers or fetch retries', () => {
    const now = new Date('2026-08-15T19:28:00Z'); // 3:28 PM ET
    const overdueMlb = {
      ...entry({ sport: 'baseball_mlb', id: 51 }),
      triggerTime: new Date('2026-08-15T19:07:00Z'),
    };
    const imminentNfl = {
      ...entry({ sport: 'americanfootball_nfl', id: 61 }),
      triggerTime: new Date('2026-08-15T19:30:00Z'),
    };
    const sameLaneMlb = {
      ...entry({ sport: 'baseball_mlb', id: 52 }),
      triggerTime: new Date('2026-08-15T19:30:00Z'),
    };
    const futureFetchRetry = {
      kind: 'sport_fetch_retry',
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-08-15',
      triggerTime: new Date('2026-08-15T19:29:00Z'),
    };

    const batch = nextTriggerBatch(
      [overdueMlb, imminentNfl, sameLaneMlb, futureFetchRetry],
      { now, crossLaneLookaheadMs: 3 * 60_000 },
    );

    expect(batch).toEqual([overdueMlb, imminentNfl]);
  });

  it('never puts two retry tiers for the same game in one batch', () => {
    const base = Date.parse('2026-08-15T12:00:00Z');
    const first = { ...entry({ id: 1, lead: 30 }), triggerTime: new Date(base) };
    const retry = { ...entry({ id: 1, lead: 15 }), triggerTime: new Date(base + 15 * 60_000) };
    const neighbor = { ...entry({ id: 2, lead: 30 }), triggerTime: new Date(base + 10 * 60_000) };
    expect(nextTriggerBatch([first, retry, neighbor])).toEqual([first, neighbor]);
  });

  it('keeps only the newest overdue tier per game while preserving future retries', () => {
    const tiers = [90, 60, 30, 15].map((lead) => entry({ lead }));
    const result = coalesceOverdueTiers(tiers, new Date('2026-08-15T17:35:00Z'));
    expect(result.entries.map((item) => item.leadMin)).toEqual([30, 15]);
    expect(result.skipped.map((item) => item.leadMin)).toEqual([90, 60]);
  });

  it('coalesces overdue tiers independently for each game', () => {
    const entries = [
      entry({ id: 1, lead: 90 }), entry({ id: 1, lead: 60 }),
      entry({ id: 2, lead: 90 }), entry({ id: 2, lead: 60 }),
    ];
    const result = coalesceOverdueTiers(entries, new Date('2026-08-15T17:30:00Z'));
    expect(result.entries.map((item) => `${item.gameId}:${item.leadMin}`).sort()).toEqual(['1:60', '2:60']);
    expect(result.skipped).toHaveLength(2);
  });

  it('moves every remaining retry tier both earlier and later', () => {
    const tiers = [90, 60, 30, 15].map((lead) => entry({ lead }));
    const originalTriggerRefs = tiers.map((item) => item.triggerTime);
    expect(reanchorGameSchedule(tiers, tiers[0], new Date('2026-08-15T19:00:00Z'))).toBe(4);
    expect(tiers.map((item) => item.startTime.toISOString())).toEqual(Array(4).fill('2026-08-15T19:00:00.000Z'));
    expect(tiers.map((item) => item.triggerTime.toISOString())).toEqual([
      '2026-08-15T17:30:00.000Z',
      '2026-08-15T18:00:00.000Z',
      '2026-08-15T18:30:00.000Z',
      '2026-08-15T18:45:00.000Z',
    ]);
    expect(tiers.map((item) => item.triggerTime)).toEqual(originalTriggerRefs);
  });

  it('does not reinsert recovered game tiers that already existed or fired', () => {
    const existing = [
      { ...entry({ sport: 'americanfootball_ncaaf', id: 71, lead: 90 }), tier: 1 },
      { ...entry({ sport: 'americanfootball_ncaaf', id: 71, lead: 60 }), tier: 2 },
    ];
    const candidates = [
      { ...entry({ sport: 'americanfootball_ncaaf', id: 71, lead: 90 }), tier: 1 },
      { ...entry({ sport: 'americanfootball_ncaaf', id: 71, lead: 60 }), tier: 2 },
      { ...entry({ sport: 'americanfootball_ncaaf', id: 72, lead: 90 }), tier: 1 },
      { ...entry({ sport: 'americanfootball_ncaaf', id: 72, lead: 60 }), tier: 2 },
    ];

    expect(newScheduleEntries(existing, candidates).map((item) => `${item.gameId}:${item.tier}`))
      .toEqual(['72:1', '72:2']);
  });

  it('bounds the NCAAF kickoff refresh to one exact pending entry per game', () => {
    const now = new Date('2026-08-29T14:00:00Z');
    const ncaafFirst = { ...entry({ sport: 'americanfootball_ncaaf', id: 81, start: '2026-08-29T18:00:00Z', lead: 90 }), tier: 1 };
    const ncaafRetry = { ...entry({ sport: 'americanfootball_ncaaf', id: 81, start: '2026-08-29T18:00:00Z', lead: 60 }), tier: 2 };
    const ncaafSecond = { ...entry({ sport: 'americanfootball_ncaaf', id: 82, start: '2026-08-29T20:00:00Z', lead: 90 }), tier: 1 };
    const started = { ...entry({ sport: 'americanfootball_ncaaf', id: 83, start: '2026-08-29T13:00:00Z', lead: 15 }), tier: 4 };
    const nfl = { ...entry({ sport: 'americanfootball_nfl', id: 84, start: '2026-08-29T20:00:00Z', lead: 90 }), tier: 1 };
    const fetchRetry = makeSportFetchRetryEntry({
      sport: { key: 'americanfootball_ncaaf' },
      dateStr: '2026-08-29',
      gameIds: [85],
      now,
    });

    const pending = [ncaafFirst, ncaafRetry, ncaafSecond, started, nfl, fetchRetry];
    expect(pendingNcaafKickoffRefreshEntries(pending, now).map((item) => item.gameId))
      .toEqual([81, 82]);
    expect(pendingNcaafKickoffRefreshEntries(pending, now, 1).map((item) => item.gameId))
      .toEqual([81]);
    expect(schedulerSource).toContain('NCAAF_KICKOFF_CHECK_INTERVAL_MS = 10 * 60 * 1000');
    expect(schedulerSource).toContain("'americanfootball_ncaaf',\n          slateDate,\n          { gameIds }");
    expect(schedulerSource).toContain('reanchorGameSchedule(livePending, entry, nextStart)');
  });

  it('keeps the NCAAF slate key through exact pick, prop, and coverage paths', () => {
    expect(schedulerSource).toContain('schedulerChildArgs(entry, [sport.flag, \'--game-id\'');
    expect(schedulerSource).toContain("schedulerChildArgs(entry, ['--game-id'");
    expect(schedulerSource).toContain('? entry.slateDate');
    expect(schedulerSource).toContain('addActiveNcaafRecovery(schedule)');
    expect(picksRunnerSource).toContain('ncaafSlateDateForInstant(gameTime)');
    expect(propsRunnerSource).toContain('const slateDateFromISO = (iso) =>');
    expect(propsRunnerSource).toContain('requestedSlateDate || ncaafSlateDateForInstant(iso)');
  });

  it('recognizes coverage only after the final pending tier is removed', () => {
    const first = entry({ lead: 90 });
    const final = entry({ lead: 15 });
    expect(isFinalPendingTier(first, [final])).toBe(false);
    expect(isFinalPendingTier(final, [])).toBe(true);
  });

  it('starts football props after football games without waiting for shared MLB games', async () => {
    const events = [];
    let releaseShared;
    const sharedGate = new Promise((resolve) => { releaseShared = resolve; });

    const running = runIndependentDecisionLanes([
      {
        runGames: async () => { events.push('nfl-games'); },
        runProps: async () => { events.push('nfl-props'); },
      },
      {
        runGames: async () => {
          events.push('shared-games-start');
          await sharedGate;
          events.push('shared-games-done');
        },
        runProps: async () => { events.push('shared-props'); },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['nfl-games', 'shared-games-start', 'nfl-props']);
    expect(events).not.toContain('shared-props');

    releaseShared();
    await running;
    expect(events).toEqual([
      'nfl-games',
      'shared-games-start',
      'nfl-props',
      'shared-games-done',
      'shared-props',
    ]);
  });

  it('expands NCAAF cluster workers dynamically but remains bounded', () => {
    expect(ncaafClusterConcurrency(0)).toBe(0);
    expect(ncaafClusterConcurrency(2)).toBe(2);
    expect(ncaafClusterConcurrency(12)).toBe(3);
    expect(ncaafClusterConcurrency(20)).toBe(5);
    expect(ncaafClusterConcurrency(60)).toBe(12);
    expect(ncaafClusterConcurrency(120)).toBe(12);
  });

  it('runs each football game decision before its own props without a full-slate barrier', async () => {
    const events = [];
    let releaseFirstGame;
    const firstGameGate = new Promise((resolve) => { releaseFirstGame = resolve; });

    const running = runPerGameDecisionPipeline({
      entries: [{ id: 1 }, { id: 2 }],
      concurrency: 2,
      runGame: async ({ id }) => {
        events.push(`game-${id}-start`);
        if (id === 1) await firstGameGate;
        events.push(`game-${id}-done`);
      },
      runProps: async ({ id }) => { events.push(`props-${id}`); },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['game-1-start', 'game-2-start', 'game-2-done', 'props-2']);
    expect(events).not.toContain('props-1');

    releaseFirstGame();
    await running;
    expect(events).toEqual([
      'game-1-start',
      'game-2-start',
      'game-2-done',
      'props-2',
      'game-1-done',
      'props-1',
    ]);
  });

  it('keeps a football per-game pipeline inside its requested worker bound', async () => {
    let activeGames = 0;
    let peakGames = 0;
    const completedGames = new Set();

    await runPerGameDecisionPipeline({
      entries: Array.from({ length: 8 }, (_, index) => ({ id: index + 1 })),
      concurrency: 3,
      runGame: async ({ id }) => {
        activeGames += 1;
        peakGames = Math.max(peakGames, activeGames);
        await new Promise((resolve) => setTimeout(resolve, 1));
        completedGames.add(id);
        activeGames -= 1;
      },
      runProps: async ({ id }) => {
        expect(completedGames.has(id)).toBe(true);
      },
    });

    expect(peakGames).toBe(3);
    expect(completedGames.size).toBe(8);
  });
});
