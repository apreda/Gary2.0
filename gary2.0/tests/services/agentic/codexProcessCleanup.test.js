import { describe, it, expect } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

const adapter = new URL('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', import.meta.url).href;
const active = (pid) => {
  try { return !/^\s*Z/.test(execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return false; }
};

describe.skipIf(process.platform === 'win32')('actual local subprocess cleanup (no model calls)', () => {
  it.each(['cancel', 'parent SIGTERM'])('removes wrapper and TERM-resistant descendant after %s', async (mode) => {
    const dir = mkdtempSync(join(tmpdir(), 'gary-cancel-test-'));
    const fixture = join(dir, 'fake-codex');
    const pidFile = join(dir, 'pids.json');
    const workerFile = join(dir, 'worker.mjs');
    writeFileSync(fixture, `#!/usr/bin/env node
const {spawn}=require('node:child_process');
const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); process.stdout.write('READY'); setInterval(()=>{},1000)"],{stdio:['ignore','pipe','ignore']});
child.stdout.once('data',()=>writeFileSync(process.env.GARY_CANCEL_TEST_PID_FILE,JSON.stringify([process.pid,child.pid])));
setInterval(()=>{},1000);
`, { mode: 0o755 });
    writeFileSync(workerFile, `
import {createCodexCliSession,sendToCodexCliSession} from ${JSON.stringify(adapter)};
process.on('SIGTERM',()=>process.exit(0));
const controller=new AbortController();
const session=await createCodexCliSession({signal:controller.signal});
process.stdin.on('data',()=>controller.abort());
sendToCodexCliSession(session,'harmless local fixture').catch(()=>setTimeout(()=>process.exit(0),1300));
`);
    const worker = spawn(process.execPath, [workerFile], { env: { ...process.env, CODEX_CLI_PATH: fixture, GARY_CANCEL_TEST_PID_FILE: pidFile }, stdio: ['pipe', 'ignore', 'pipe'] });
    const exited = once(worker, 'exit');
    let pids = [];
    try {
      for (let i = 0; i < 150 && !existsSync(pidFile); i++) await sleep(20);
      expect(existsSync(pidFile)).toBe(true);
      pids = JSON.parse(readFileSync(pidFile, 'utf8'));
      expect(pids.every(active)).toBe(true);
      if (mode === 'cancel') worker.stdin.write('abort');
      else worker.kill('SIGTERM');
      await exited;
      for (let i = 0; i < 100 && pids.some(active); i++) await sleep(20);
      expect(pids.filter(active)).toEqual([]);
    } finally {
      for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
      worker.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
