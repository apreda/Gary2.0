import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Real filesystem semantics in a private directory. Production pending
// decisions are never touched, including malformed-file and crash fixtures.
import { createPickOutbox } from '../../scripts/lib/pickOutbox.js';
let directory;
let writeSpool, removeSpool, listSpools, readSpool, flushOutbox;

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

beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), 'gary-pick-outbox-'));
  ({ writeSpool, removeSpool, listSpools, readSpool, flushOutbox } = createPickOutbox({ directory }));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

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

  it('keeps the complete pending decision visible during an interrupted replacement write', () => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    const original = fs.readFileSync(file);
    const faulty = createPickOutbox({ directory, fs: {
      ...fs,
      writeFileSync(descriptor, payload) {
        fs.writeSync(descriptor, payload.slice(0, 12));
        expect(fs.readFileSync(file)).toEqual(original);
        throw Object.assign(new Error('simulated full disk during write'), { code: 'ENOSPC' });
      },
    } });
    expect(faulty.writeSpool('daily', TEST_DATE, [{ ...pick('101'), pick: 'New decision -110' }])).toBeNull();
    expect(fs.readFileSync(file)).toEqual(original);
    expect(listSpools(TEST_DATE)).toEqual([file]);
    expect(fs.readdirSync(directory).some((name) => name.endsWith('.tmp'))).toBe(true);
  });

  it('publishes only after file sync and keeps the prior spool if rename fails', () => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    const original = fs.readFileSync(file);
    let synced = false;
    const faulty = createPickOutbox({ directory, fs: {
      ...fs,
      fsyncSync(descriptor) { fs.fsyncSync(descriptor); synced = true; },
      renameSync(source, destination) {
        expect(synced).toBe(true);
        expect(destination).toBe(file);
        expect(JSON.parse(fs.readFileSync(source, 'utf8')).picks[0].pick).toBe('New decision -110');
        expect(fs.readFileSync(file)).toEqual(original);
        throw new Error('simulated rename failure');
      },
    } });
    expect(faulty.writeSpool('daily', TEST_DATE, [{ ...pick('101'), pick: 'New decision -110' }])).toBeNull();
    expect(fs.readFileSync(file)).toEqual(original);
    expect(listSpools(TEST_DATE)).toEqual([file]);
  });

  it.skipIf(process.platform === 'win32')('survives real process death mid-write without truncating its pending decision', async () => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    const original = fs.readFileSync(file);
    const module = new URL('../../scripts/lib/pickOutbox.js', import.meta.url).href;
    const worker = spawn(process.execPath, ['--input-type=module', '-e', `
      import * as fs from 'node:fs';
      import { createPickOutbox } from ${JSON.stringify(module)};
      const outbox = createPickOutbox({directory: process.argv[1], fs: {...fs,
        writeFileSync(descriptor, payload) {
          fs.writeSync(descriptor, payload.slice(0, 10));
          process.kill(process.pid, 'SIGKILL');
        }
      }});
      outbox.writeSpool('daily', process.argv[2], JSON.parse(process.argv[3]));
    `, directory, TEST_DATE, JSON.stringify([{ ...pick('101'), pick: 'Interrupted decision -110' }])], { stdio: 'ignore' });
    try {
      const [, signal] = await once(worker, 'exit');
      expect(signal).toBe('SIGKILL');
      expect(fs.readFileSync(file)).toEqual(original);
      expect(readSpool(file).picks[0].pick).toBe('Phillies -1.5 +100');
      expect(listSpools(TEST_DATE)).toEqual([file]);
    } finally { worker.kill('SIGKILL'); }
  });

  it('quarantines malformed bytes and payloads while still replaying valid pending picks', async () => {
    const damaged = join(directory, `${TEST_DATE}__damaged.json`);
    const invalid = join(directory, `${TEST_DATE}__invalid.json`);
    fs.writeFileSync(damaged, '{"picks":[');
    fs.writeFileSync(invalid, JSON.stringify({ lane: 'daily', picks: [pick('99')] }));
    writeSpool('daily', TEST_DATE, [pick('101')]);
    const storeDaily = vi.fn().mockResolvedValue({ success: true });
    const outcome = await flushOutbox({ dateStr: TEST_DATE, assertStillPregame: pregameAssert, storeDaily });
    expect(outcome.quarantined).toHaveLength(2);
    expect(outcome.dropped).toEqual([]);
    expect(outcome.failed).toEqual([]);
    expect(outcome.flushed).toEqual(['101']);
    expect(storeDaily).toHaveBeenCalledTimes(1);
    expect(outcome.quarantined.map((file) => fs.readFileSync(file, 'utf8')).sort()).toEqual([
      '{"picks":[', JSON.stringify({ lane: 'daily', picks: [pick('99')] }),
    ].sort());
    expect(listSpools(TEST_DATE)).toEqual([]);
    const again = await flushOutbox({ dateStr: TEST_DATE, assertStillPregame: pregameAssert, storeDaily });
    expect(again.quarantined).toEqual([]);
    expect(storeDaily).toHaveBeenCalledTimes(1);
  });

  it.each(['read', 'quarantine'])('retains the original spool when %s is unavailable', async (failure) => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    if (failure === 'quarantine') fs.writeFileSync(file, '{"truncated":');
    const original = fs.readFileSync(file);
    const faulty = createPickOutbox({ directory, fs: {
      ...fs,
      readFileSync: failure === 'read' ? () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); } : fs.readFileSync,
      renameSync: failure === 'quarantine' ? () => { throw new Error('permission denied'); } : fs.renameSync,
    } });
    const storeDaily = vi.fn();
    const outcome = await faulty.flushOutbox({ dateStr: TEST_DATE, assertStillPregame: pregameAssert, storeDaily });
    expect(outcome.failed).toEqual([file]);
    expect(outcome.dropped).toEqual([]);
    expect(outcome.quarantined).toEqual([]);
    expect(fs.readFileSync(file)).toEqual(original);
    expect(storeDaily).not.toHaveBeenCalled();
  });

  it('does not replace an already-published first decision when replay is acknowledged as a guarded skip', async () => {
    writeSpool('daily', TEST_DATE, [pick('101')]);
    const published = { pick: 'Original published ticket -110' };
    const storeDaily = vi.fn(async () => ({ success: true, skipped: true, picks: [published] }));
    const outcome = await flushOutbox({ dateStr: TEST_DATE, assertStillPregame: pregameAssert, storeDaily });
    expect(published.pick).toBe('Original published ticket -110');
    expect(outcome.flushed).toEqual(['101']);
    expect(listSpools(TEST_DATE)).toEqual([]);
  });

  it('keeps the runner production-only guards around replay and test/dry-run storage', async () => {
    const runner = fs.readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');
    const replayGuard = runner.slice(runner.indexOf('  // OUTBOX FLUSH'), runner.indexOf("const { flushOutbox }"))
      .match(/if \((.+)\) \{/)[1];
    const canReplay = new Function('shouldStore', 'useTestTable', 'process', `return ${replayGuard}`);
    expect(canReplay(true, false, { argv: [] })).toBe(true);
    expect(canReplay(false, false, { argv: [] })).toBe(false);
    expect(canReplay(true, true, { argv: [] })).toBe(false);
    expect(canReplay(true, false, { argv: ['--dry-run'] })).toBe(false);

    const start = runner.indexOf('async function storePicks(picks) {');
    const end = runner.indexOf('\n}', start);
    const body = runner.slice(runner.indexOf('{', start) + 1, end)
      .replace(/\bimport\(/g, 'unexpectedImport(');
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const store = new AsyncFunction('picks', 'useTestTable', 'process', 'picksService', 'testName', 'assertPicksStillPregame', 'unexpectedImport', 'console', 'dateFilter', body);
    const unexpected = vi.fn(() => { throw new Error('Production outbox reached from dry/test mode'); });
    const storeTestPicks = vi.fn().mockResolvedValue({ success: true, count: 1 });
    const logger = { log: vi.fn() };
    await store([pick('101')], false, { argv: ['--dry-run'] }, { storeTestPicks }, 'fixture', unexpected, unexpected, logger);
    expect(storeTestPicks).not.toHaveBeenCalled();
    await store([pick('101')], true, { argv: [], env: {} }, { storeTestPicks }, 'fixture', unexpected, unexpected, logger);
    expect(storeTestPicks).toHaveBeenCalledTimes(1);
    expect(unexpected).not.toHaveBeenCalled();
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

  it.each(['upstream request timeout', 'Invalid atomic pick publication receipt: missing durable acknowledgement'])('flush keeps the spool when the writer rejects publication: %s', async (error) => {
    writeSpool('daily', TEST_DATE, [pick('101')]);
    const storeDaily = vi.fn().mockResolvedValue({ success: false, error });
    const outcome = await flushOutbox({
      dateStr: TEST_DATE,
      assertStillPregame: pregameAssert,
      storeDaily,
      storeNflWeekly: vi.fn(),
    });
    expect(outcome.failed).toHaveLength(1);
    expect(listSpools(TEST_DATE)).toHaveLength(1); // survives for the next tier
  });

  it('retains the identical valid bytes when the writer throws', async () => {
    const file = writeSpool('daily', TEST_DATE, [pick('101')]);
    const before = fs.readFileSync(file);
    const outcome = await flushOutbox({ dateStr: TEST_DATE, assertStillPregame: pregameAssert,
      storeDaily: vi.fn().mockRejectedValue(new Error('connection reset')) });
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.flushed).toEqual([]);
    expect(fs.readFileSync(file)).toEqual(before);
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
