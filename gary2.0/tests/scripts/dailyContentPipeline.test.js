import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { collegeCardStages, dailyContentStages, runContentStage, runDailyContent, selectContentStages } from '../../scripts/lib/dailyContentPipeline.js';

const dirs = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'gary-content-test-')); dirs.push(path); return path; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function until(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('fixture readiness timed out'); await delay(20); }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

describe('daily content orchestration', () => {
  it('selects only explicitly requested recovery stages in normal order and rejects typos or duplicates', () => {
    const all = dailyContentStages('2026-09-05', {});
    expect(selectContentStages(all, 'morning-health,ncaaf-insights,card-watch').map(stage => stage.id)).toEqual(['ncaaf-insights', 'card-watch', 'morning-health']);
    for (const invalid of ['', 'wire,wire', 'ncaaf-insight', '--plan']) expect(() => selectContentStages(all, invalid)).toThrow('Expected unique --stages');
  });
  it('reserves the early phase for checkpointed college cards with bounded capacity and no model stages', () => {
    expect(collegeCardStages('2026-09-06', {})).toEqual([{
      id: 'overnight-football-cards', timeoutMs: 180 * 60_000,
      env: { GARY_NCAAF_LANE_BUDGET_MS: String(165 * 60_000) },
      args: ['run-insight-connections.js', '--date', '2026-09-06', '--league', 'NFL,NCAAF', '--cards-only'],
    }]);
  });
  it('gives independent Home stages and college packs their turn before long football insights', () => {
    const stages = dailyContentStages('2026-09-05', {});
    expect(stages.slice(0, 2).map(s => s.id)).toEqual(['board', 'wire']);
    expect(stages.findIndex(s => s.id === 'ncaaf-cards')).toBeLessThan(stages.findIndex(s => s.id === 'ncaaf-insights'));
    expect(stages.filter(s => s.args.includes('--skip-cards'))).toHaveLength(3);
    expect(stages.filter(s => s.id === 'ncaaf-cards')).toHaveLength(1);
  });
  it('fills subjects introduced by the later college insight stage before checking card coverage', async () => {
    const subjects = new Set(['base-leader']);
    const cards = new Set();
    const visited = [];
    const stages = dailyContentStages('2026-09-05', {});
    await runDailyContent(stages, {
      runStage: async stage => {
        visited.push(stage.id);
        if (stage.args.includes('NCAAF') && stage.args.includes('--cards-only')) {
          for (const subject of subjects) cards.add(subject);
        }
        if (stage.id === 'ncaaf-insights') subjects.add('later-named-player');
        if (stage.id === 'card-watch') expect([...subjects].every(subject => cards.has(subject))).toBe(true);
        return { stage: stage.id, status: 'ok' };
      },
    });
    expect(visited.slice(visited.indexOf('ncaaf-insights'), visited.indexOf('card-watch') + 1))
      .toEqual(['ncaaf-insights', 'ncaaf-card-subjects', 'card-watch']);
    expect(stages.find(stage => stage.id === 'ncaaf-card-subjects').timeoutMs).toBe(900_000);
    expect(dailyContentStages('2026-09-05', { GARY_CAP_CARDS_NCAAF: '30' })
      .find(stage => stage.id === 'ncaaf-card-subjects').timeoutMs).toBe(30_000);
  });
  it('continues remaining stages after a timeout or failed writer, preserving the failed status', async () => {
    const visited = [];
    const results = await runDailyContent([{ id: 'board' }, { id: 'wire' }, { id: 'cards' }], {
      runStage: async stage => { visited.push(stage.id); return { stage: stage.id, status: stage.id === 'board' ? 'timeout' : 'ok' }; },
    });
    expect(visited).toEqual(['board', 'wire', 'cards']);
    expect(results[0].status).toBe('timeout');
  });
  it('caps an active process once, with timestamped failure evidence and no startup retry', async () => {
    const events = [];
    const result = await runContentStage({ id: 'hung', args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }, { stdio: 'ignore', graceMs: 40, startupRetryMs: 1, onEvent: row => events.push(row) });
    expect(result).toMatchObject({ status: 'timeout', exit_code: 124, attempt: 1 });
    expect(events.map(e => e.event)).toEqual(['stage-start', 'stage-end']);
    expect(Date.parse(result.at)).toBeGreaterThan(0);
  });
  it('does not hammer a quota or configuration failure with immediate whole-stage retries', async () => {
    const result = await runContentStage({ id: 'quota', args: ['-e', 'process.exit(1)'], timeoutMs: 5000 }, { stdio: 'ignore', startupRetryMs: 1 });
    expect(result).toMatchObject({ status: 'failed', attempt: 1 });
  });
  it('retains the targeted launchd Node EINTR startup workaround', async () => {
    const dir = temp(); const ready = join(dir, 'attempt');
    const code = `const fs=require('fs');if(!fs.existsSync(${JSON.stringify(ready)})){fs.writeFileSync(${JSON.stringify(ready)},'1');console.error('Error: EINTR: process.cwd failed uv_cwd');process.exit(1);}`;
    const result = await runContentStage({ id: 'startup', args: ['-e', code], timeoutMs: 5000 }, { stdio: ['ignore', 'ignore', 'pipe'], startupRetryMs: 1 });
    expect(result).toMatchObject({ status: 'ok', attempt: 2 });
  });
  it('cancellation clears the descendant group even after its direct parent exits on TERM', async () => {
    const dir = temp(); const ready = join(dir, 'ready');
    const controller = new AbortController();
    const grandchild = `require('fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
    const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
    const running = runContentStage({ id: 'tree', args: ['-e', parent], timeoutMs: 20_000 }, { signal: controller.signal, stdio: 'ignore', graceMs: 60 });
    // Handle rejection before waiting for the fixture to avoid an unhandled promise.
    const result = running.catch(error => error);
    await until(() => existsSync(ready));
    const pid = Number(readFileSync(ready, 'utf8'));
    expect(alive(pid)).toBe(true);
    controller.abort(new Error('stop content'));
    expect((await result).message).toBe('stop content');
    await until(() => !alive(pid));
  }, 20_000);
  it('a successful child cannot leave a background grandchild consuming provider capacity', async () => {
    const dir = temp(); const ready = join(dir, 'ready');
    const grandchild = `require('fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));process.send('ready');setInterval(()=>{},1000);`;
    const parent = `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','ignore','ignore','ipc']});c.once('message',()=>process.exit(0));`;
    const result = await runContentStage({ id: 'clean', args: ['-e', parent], timeoutMs: 15_000 }, { stdio: 'ignore' });
    expect(result.status).toBe('ok');
    const pid = Number(readFileSync(ready, 'utf8'));
    await until(() => !alive(pid));
  }, 20_000);
});
