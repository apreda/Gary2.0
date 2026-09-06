import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { publishSchedulerSnapshot } from '../../scripts/lib/schedulerSnapshots.js';
import { runContentStage } from '../../scripts/lib/dailyContentPipeline.js';

describe('scheduler publication process isolation', () => {
  it('reaps a detached snapshot before the scheduler exits on SIGTERM', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-snapshot-stop-'));
    let parent; let childPid;
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'scripts/run-tomorrow-board.js'), `const fs=require('fs');fs.writeFileSync('ready',String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
      const helper = pathToFileURL(resolve('scripts/lib/schedulerSnapshots.js')).href;
      writeFileSync(join(dir, 'parent.mjs'), `import {publishSchedulerSnapshot} from ${JSON.stringify(helper)};await publishSchedulerSnapshot('board','2026-09-06',{cwd:process.cwd()});`);
      parent = spawn(process.execPath, ['parent.mjs'], { cwd: dir, stdio: 'ignore', detached: true });
      const exited = new Promise(resolve => parent.once('exit', code => resolve(code)));
      const deadline = Date.now() + 10_000;
      while (!existsSync(join(dir, 'ready')) && Date.now() < deadline) await delay(20);
      childPid = Number(readFileSync(join(dir, 'ready'), 'utf8'));
      parent.kill('SIGTERM');
      expect(await exited).toBe(143);
      let alive = true;
      while (alive && Date.now() < deadline) {
        try { process.kill(childPid, 0); await delay(20); } catch { alive = false; }
      }
      expect(alive).toBe(false);
    } finally {
      if (parent?.pid) try { process.kill(-parent.pid, 'SIGKILL'); } catch { /* exited */ }
      if (childPid) try { process.kill(-childPid, 'SIGKILL'); } catch { /* reaped */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
  it('survives exactly the missing-export failure in a stale parent module graph', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-snapshot-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'market.mjs'), 'export const old = true;');
      writeFileSync(join(dir, 'scripts/run-tomorrow-board.js'), `import { isAmericanPrice } from '../market.mjs'; import { writeFileSync } from 'node:fs'; writeFileSync('published', String(isAmericanPrice(110)));`);
      const helper = pathToFileURL(resolve('scripts/lib/schedulerSnapshots.js')).href;
      const fixture = `import { writeFileSync } from 'node:fs';
        import { publishSchedulerSnapshot } from ${JSON.stringify(helper)};
        await import('./market.mjs');
        writeFileSync('market.mjs', 'export const isAmericanPrice = n => Math.abs(n) >= 100;');
        try { await import('./scripts/run-tomorrow-board.js'); process.exit(2); }
        catch (error) { if (!error.message.includes('isAmericanPrice')) throw error; }
        const result = await publishSchedulerSnapshot('board', '2026-09-06', { cwd: process.cwd() });
        process.exit(result.ok ? 0 : 3);`;
      writeFileSync(join(dir, 'parent.mjs'), fixture);
      const result = await runContentStage({ id: 'stale-parent', args: ['parent.mjs'], timeoutMs: 15_000 }, { cwd: dir, stdio: 'ignore' });
      expect(result.status).toBe('ok');
      expect(readFileSync(join(dir, 'published'), 'utf8')).toBe('true');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);
  it('keeps a failed/partial or capped publication non-fatal without calling it published', async () => {
    const log = vi.fn();
    for (const status of ['failed', 'timeout']) {
      expect(await publishSchedulerSnapshot('board', '2026-09-06', { log, runStage: async () => ({ status, exit_code: 1 }) })).toMatchObject({ ok: false });
    }
    expect(log.mock.calls.every(([line]) => line.startsWith('⚠️'))).toBe(true);
  });
});
