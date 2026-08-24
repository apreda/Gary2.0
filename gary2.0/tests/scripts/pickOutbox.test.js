import { describe, it, expect, afterEach, vi } from 'vitest';

// These tests exercise the REAL outbox directory (logs/pick-outbox), isolated
// by a unique per-run date key and cleaned up after each test.
import {
  writeSpool, removeSpool, listSpools, readSpool, flushOutbox,
} from '../../scripts/lib/pickOutbox.js';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();
// Unique per-run date key keeps parallel/repeat runs from colliding in the
// shared outbox directory.
const TEST_DATE = `test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

const pick = (gameId, commence = FUTURE) => ({
  league: 'MLB', pick: 'Phillies -1.5 +100', bdl_game_id: gameId, commence_time: commence,
  homeTeam: 'Phillies', awayTeam: 'Cardinals',
});

const pregameAssert = (picks) => {
  for (const p of picks) {
    if (new Date(p.commence_time).getTime() <= Date.now()) {
      throw new Error('Pregame storage blocked: game has already started');
    }
  }
};

afterEach(() => {
  for (const file of listSpools(TEST_DATE)) removeSpool(file);
});

describe('pick outbox', () => {
  it('spools, lists, reads, and removes a batch', () => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    expect(file).toBeTruthy();
    expect(listSpools(TEST_DATE)).toContain(file);
    const spool = readSpool(file);
    expect(spool.lane).toBe('daily');
    expect(spool.game_ids).toEqual(['101']);
    expect(spool.picks[0].pick).toBe('Phillies -1.5 +100');
    removeSpool(file);
    expect(listSpools(TEST_DATE)).toHaveLength(0);
  });

  it('re-spooling the same game batch overwrites instead of duplicating', () => {
    writeSpool('daily', TEST_DATE, [pick('101')]);
    writeSpool('daily', TEST_DATE, [pick('101')]);
    expect(listSpools(TEST_DATE)).toHaveLength(1);
  });

  it('flush stores pending pregame spools and deletes them', async () => {
    writeSpool('daily', TEST_DATE, [pick('101')]);
    const storeDaily = vi.fn().mockResolvedValue({ success: true });
    const outcome = await flushOutbox({
      dateStr: TEST_DATE,
      assertStillPregame: pregameAssert,
      storeDaily,
      storeNflWeekly: vi.fn(),
    });
    expect(storeDaily).toHaveBeenCalledTimes(1);
    expect(storeDaily.mock.calls[0][1]).toBe(TEST_DATE); // spool date rides through
    expect(outcome.flushed).toEqual(['101']);
    expect(listSpools(TEST_DATE)).toHaveLength(0);
  });

  it('flush drops an expired spool without storing — a bet never posts after first pitch', async () => {
    writeSpool('daily', TEST_DATE, [pick('101', PAST)]);
    const storeDaily = vi.fn();
    const outcome = await flushOutbox({
      dateStr: TEST_DATE,
      assertStillPregame: pregameAssert,
      storeDaily,
      storeNflWeekly: vi.fn(),
    });
    expect(storeDaily).not.toHaveBeenCalled();
    expect(outcome.dropped).toHaveLength(1);
    expect(listSpools(TEST_DATE)).toHaveLength(0);
  });

  it('flush keeps the spool when storage is still down', async () => {
    writeSpool('daily', TEST_DATE, [pick('101')]);
    const storeDaily = vi.fn().mockResolvedValue({ success: false, error: 'upstream request timeout' });
    const outcome = await flushOutbox({
      dateStr: TEST_DATE,
      assertStillPregame: pregameAssert,
      storeDaily,
      storeNflWeekly: vi.fn(),
    });
    expect(outcome.failed).toHaveLength(1);
    expect(listSpools(TEST_DATE)).toHaveLength(1); // survives for the next tier
  });

  it('routes nfl_weekly spools to the weekly writer', async () => {
    writeSpool('nfl_weekly', TEST_DATE, [{ ...pick('202'), league: 'NFL' }]);
    const storeNflWeekly = vi.fn().mockResolvedValue({ success: true });
    const outcome = await flushOutbox({
      dateStr: TEST_DATE,
      assertStillPregame: pregameAssert,
      storeDaily: vi.fn(),
      storeNflWeekly,
    });
    expect(storeNflWeekly).toHaveBeenCalledTimes(1);
    expect(outcome.flushed).toEqual(['202']);
  });

  it('rejects unknown lanes at spool time', () => {
    expect(() => writeSpool('props', TEST_DATE, [pick('1')])).toThrow('Unknown outbox lane');
  });
});
