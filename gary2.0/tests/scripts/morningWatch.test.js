import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMorningWatch } from '../../scripts/lib/morningWatch.js';
import { runContentStage } from '../../scripts/lib/dailyContentPipeline.js';
const dirs = [];
function marker() { const dir = mkdtempSync(join(tmpdir(), 'gary-health-watch-')); dirs.push(dir); return join(dir, 'last.json'); }
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const now = new Date('2026-09-05T11:02:00Z');
describe('existing watchdog morning check', () => {
  it('runs once in the ET window and retains a failed check rather than recording health as OK', async () => {
    const markerPath = marker();
    const runStage = vi.fn(async () => ({ status: 'failed', exit_code: 1 }));
    const result = await runMorningWatch({ now, markerPath, runStage });
    expect(result.status).toBe('failed');
    expect(JSON.parse(readFileSync(markerPath, 'utf8')).exit_code).toBe(1);
    expect((await runMorningWatch({ now, markerPath, runStage })).skipped).toBe('already checked');
    expect(runStage).toHaveBeenCalledTimes(1);
  });
  it('does no database/process work outside the window and retries a crashed wrapper after its deadline', async () => {
    const markerPath = marker(); const runStage = vi.fn(async () => ({ status: 'ok', exit_code: 0 }));
    await runMorningWatch({ now: new Date('2026-09-05T12:00:00Z'), markerPath, runStage });
    expect(runStage).not.toHaveBeenCalled();
    writeFileSync(markerPath, JSON.stringify({ date: '2026-09-05', status: 'running', attempted_at: '2026-09-05T11:00:00Z' }));
    expect((await runMorningWatch({ now, markerPath, runStage })).status).toBe('ok');
  });
  it('bounds an actual stuck child and records timeout evidence', async () => {
    const markerPath = marker();
    const result = await runMorningWatch({ now, markerPath, timeoutMs: 100,
      runStage: (stage, options) => runContentStage({ ...stage, args: ['-e', 'setInterval(()=>{},1000)'] }, { ...options, stdio: 'ignore', graceMs: 20 }),
    });
    expect(result).toMatchObject({ status: 'timeout', exit_code: 124 });
    expect(JSON.parse(readFileSync(markerPath, 'utf8')).completed_at).toBeTruthy();
  });
  it('does not mark a wrapper crash as a completed successful check', async () => {
    const markerPath = marker();
    await expect(runMorningWatch({ now, markerPath, runStage: async () => { throw new Error('wrapper crash'); } })).rejects.toThrow('wrapper crash');
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toMatchObject({ status: 'running' });
    expect(JSON.parse(readFileSync(markerPath, 'utf8')).completed_at).toBeUndefined();
  });
});
