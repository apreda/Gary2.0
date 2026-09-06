import { describe, expect, it, vi } from 'vitest';
import { createContentDatabaseGate, probeContentDatabase } from '../../scripts/lib/contentDatabaseGate.js';
import { runDailyContent } from '../../scripts/lib/dailyContentPipeline.js';

const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-secret' };
const down = { ok: false, retryable: true, error: 'Database REST HTTP 503' };
function gate(results, options = {}) {
  let time = 0;
  const probe = vi.fn(async () => results.length > 1 ? results.shift() : results[0]);
  const onEvent = vi.fn();
  return { probe, onEvent, ready: createContentDatabaseGate({ probe, onEvent, clock: () => time, wait: async ms => { time += ms; }, retryMs: 30, maxWaitMs: 90, ...options }) };
}

describe('content storage recovery', () => {
  it('waits out an outage before any provider stage and resumes the serial pipeline once', async () => {
    const { ready, onEvent } = gate([down, down, { ok: true }]);
    const runStage = vi.fn(async stage => ({ stage: stage.id, status: 'ok' }));
    const result = await runDailyContent([{ id: 'board' }, { id: 'insights' }], { databaseReady: ready, runStage });
    expect(result.map(row => row.status)).toEqual(['ok', 'ok']);
    expect(runStage.mock.calls.map(([stage]) => stage.id)).toEqual(['board', 'insights']);
    expect(onEvent.mock.calls.map(([row]) => row.event)).toEqual(['database-wait', 'database-wait', 'database-recovered']);
  });
  it('retries a failed writer after observed database recovery without rerunning its successful predecessor', async () => {
    const { ready } = gate([{ ok: true }, { ok: true }, down, { ok: true }]);
    let failed = false;
    const runStage = vi.fn(async stage => {
      if (stage.id === 'insights' && !failed) { failed = true; return { stage: stage.id, status: 'failed' }; }
      return { stage: stage.id, status: 'ok' };
    });
    const result = await runDailyContent([{ id: 'board' }, { id: 'insights' }], { databaseReady: ready, runStage });
    expect(result.every(row => row.status === 'ok')).toBe(true);
    expect(runStage.mock.calls.map(([stage]) => stage.id)).toEqual(['board', 'insights', 'insights']);
  });
  it('does not repeat model/quota failures when storage is healthy', async () => {
    const { ready } = gate([{ ok: true }]);
    const runStage = vi.fn(async () => ({ status: 'failed' }));
    await runDailyContent([{ id: 'wire' }], { databaseReady: ready, runStage });
    expect(runStage).toHaveBeenCalledTimes(1);
  });
  it('shares the outage budget across stages and stops before further provider work', async () => {
    const { ready } = gate([down, down, { ok: true }, down], { maxWaitMs: 60 });
    await ready({ id: 'board' });
    await expect(ready({ id: 'insights' })).rejects.toThrow('wait budget exhausted');
  });
  it('stops immediately on permission/configuration failure', async () => {
    const { ready, onEvent } = gate([{ ok: false, retryable: false, error: 'Database REST HTTP 401' }]);
    await expect(ready({ id: 'board' })).rejects.toThrow('configuration requires repair');
    expect(onEvent).not.toHaveBeenCalled();
  });
  it('cancellation stops recovery waits and prevents the next writer', async () => {
    const controller = new AbortController();
    const runStage = vi.fn();
    const { ready } = gate([down], { signal: controller.signal, wait: async () => { controller.abort(new Error('stop recovery')); } });
    await expect(runDailyContent([{ id: 'board' }], { databaseReady: ready, signal: controller.signal, runStage })).rejects.toThrow('stop recovery');
    expect(runStage).not.toHaveBeenCalled();
  });
});

describe('actual app database probe', () => {
  it('checks REST rows and refuses misleading successful HTML/project status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [] }));
    expect(await probeContentDatabase({ env, fetchImpl })).toEqual({ ok: true });
    const [url] = fetchImpl.mock.calls[0];
    expect(url.pathname).toBe('/rest/v1/daily_slate');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(await probeContentDatabase({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ACTIVE_HEALTHY' }) }) })).toMatchObject({ ok: false, retryable: false });
  });
  it('distinguishes a recoverable outage from auth failure without logging secrets', async () => {
    for (const [status, retryable] of [[503, true], [504, true], [521, true], [429, true], [401, false], [403, false]]) {
      const result = await probeContentDatabase({ env, fetchImpl: async () => ({ ok: false, status }) });
      expect(result).toMatchObject({ ok: false, retryable });
      expect(JSON.stringify(result)).not.toContain('fixture-secret');
    }
  });
  it('propagates cancellation to an in-flight transport', async () => {
    const controller = new AbortController();
    const promise = probeContentDatabase({ env, signal: controller.signal, fetchImpl: (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
    controller.abort(new Error('stop probe'));
    await expect(promise).rejects.toThrow('stop probe');
  });
});
