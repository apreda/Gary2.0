import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildToolStats } from '../../scripts/lib/picks/stats.js';
import { createPickStorage } from '../../scripts/lib/picks/storage.js';
import { createPickOutbox } from '../../scripts/lib/pickOutbox.js';

let directory;
afterEach(() => {
  vi.useRealTimers();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('pick card stat shaping', () => {
  it('deduplicates aliases and omits unavailable, nested and tracking-only values', () => {
    const result = { toolCallHistory: [
      { token: 'POINTS', homeValue: { team: 'Home', points_per_game: 25, nested: {}, note: 'ignore' }, awayValue: { team: 'Away', points_per_game: 23 } },
      { token: 'POINTS_ALIAS', homeValue: { ppg: 25 }, awayValue: { ppg: 23 } },
      { token: 'MISSING', quality: 'unavailable', homeValue: 10, awayValue: 20 },
      { token: 'TRACKED' },
    ] };
    const saved = structuredClone(result);
    expect(buildToolStats(result, { key: 'basketball_nba' })).toEqual([
      { name: 'PPG', token: 'POINTS_PER_GAME', home: { team: 'Home', points_per_game: 25 }, away: { team: 'Away', points_per_game: 23 } },
    ]);
    expect(result).toEqual(saved);
  });

  it('retains ordinary measured zero while preserving the existing football display filter', () => {
    const result = { toolCallHistory: [{ token: 'SCORE', homeValue: 0, awayValue: 0 }] };
    expect(buildToolStats(result, { key: 'baseball_mlb' })).toEqual([{ name: 'SCORE', token: 'SCORE', home: 0, away: 0 }]);
    expect(buildToolStats(result, { key: 'americanfootball_nfl' })).toEqual([]);
  });
});

describe('the actual pick storage boundary', () => {
  function fixture(picksService) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T20:00:00Z'));
    directory = mkdtempSync(join(tmpdir(), 'gary-pick-storage-'));
    const outbox = createPickOutbox({ directory });
    const storage = createPickStorage({ picksService, dateFilter: '2026-09-19', loadOutbox: async () => outbox,
      process: { argv: [], env: {} }, console: { log() {} } });
    const pick = league => ({ league, pick: 'Home ML -110', odds: -110,
      bdl_game_id: league === 'NFL' ? 99 : 100, commence_time: '2026-09-19T21:00:00Z' });
    return { ...storage, outbox, pick };
  }

  it('spools before each write, removes confirmed weekly writes and retains a failed daily write', async () => {
    let h;
    const service = {
      storeWeeklyNFLPicks: vi.fn(async (_picks, { beforeRetry }) => {
        expect(h.outbox.listSpools('2026-09-19')).toHaveLength(1);
        beforeRetry();
        return { success: true, count: 1 };
      }),
      storeDailyPicksInDatabase: vi.fn(async (_picks, date, { beforeRetry }) => {
        expect(date).toBe('2026-09-19');
        expect(h.outbox.listSpools(date)).toHaveLength(1);
        beforeRetry();
        return { success: false, error: 'fixture storage outage' };
      }),
    };
    h = fixture(service);
    await expect(h.storePicks([h.pick('NFL'), h.pick('NBA')])).rejects.toThrow('Daily-picks storage failed: fixture storage outage');
    const pending = h.outbox.listSpools('2026-09-19');
    expect(pending).toHaveLength(1);
    expect(h.outbox.readSpool(pending[0])).toMatchObject({ lane: 'daily', game_ids: ['100'] });
    service.storeDailyPicksInDatabase.mockResolvedValueOnce({ success: true, count: 1 });
    await expect(h.storePicks([h.pick('NBA')])).resolves.toEqual({ success: true, count: 1 });
    expect(h.outbox.listSpools('2026-09-19')).toEqual([]);
  });

  it('rechecks kickoff before retrying a write and keeps the durable decision after rejection', async () => {
    const h = fixture({ storeWeeklyNFLPicks: async (_picks, { beforeRetry }) => {
      vi.setSystemTime(new Date('2026-09-19T21:00:01Z'));
      beforeRetry();
      throw new Error('unreachable successful-write path');
    } });
    await expect(h.storePicks([h.pick('NFL')])).rejects.toThrow(/pregame|started/i);
    expect(h.outbox.listSpools('2026-09-19')).toHaveLength(1);
  });
});
