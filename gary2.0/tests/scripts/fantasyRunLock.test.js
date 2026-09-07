import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireFantasyRunLock } from '../../scripts/lib/fantasyRunLock.js';

const dirs = [];
const locks = [];
const children = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'gary-fantasy-lock-')); dirs.push(dir); return join(dir, 'worker.pid'); };
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode == null && child.signalCode == null) {
      const ended = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGKILL');
      await ended;
    }
  }
  for (const lock of locks.splice(0)) lock.release();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Fantasy overlap ownership', () => {
  it('fails closed when the lock helper fails, rather than doing duplicate model work', () => {
    expect(() => acquireFantasyRunLock({ path: temp(), run: () => ({ error: new Error('not executable') }) })).toThrow('Cannot acquire');
    expect(() => acquireFantasyRunLock({ path: temp(), run: () => ({ status: 1 }) })).toThrow('Cannot acquire');
    expect(acquireFantasyRunLock({ path: temp(), run: () => ({ status: 75 }) }).acquired).toBe(false);
  });

  it('releases only its descriptor and keeps the shared inode in place', () => {
    const path = temp();
    const lock = acquireFantasyRunLock({ path, run: () => ({ status: 0 }) });
    locks.push(lock);
    writeFileSync(path, 'shared inode\n');
    lock.release();
    expect(readFileSync(path, 'utf8')).toBe('shared inode\n');
  });

  it.skipIf(process.platform !== 'darwin')('excludes a simultaneous Mac run and reclaims a killed owner without an age timeout', async () => {
    const path = temp();
    const module = new URL('../../scripts/lib/fantasyRunLock.js', import.meta.url).href;
    const code = `import {acquireFantasyRunLock} from ${JSON.stringify(module)}; const lock=acquireFantasyRunLock({path:${JSON.stringify(path)}});process.send({acquired:lock.acquired});setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    children.push(child);
    const ready = await new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject); });
    expect(ready.acquired).toBe(true);
    const busy = acquireFantasyRunLock({ path });
    expect(busy.acquired).toBe(false);
    const ended = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await ended;
    const recovered = acquireFantasyRunLock({ path });
    locks.push(recovered);
    expect(recovered.acquired).toBe(true);
    expect(existsSync(path)).toBe(true);
    recovered.release();
    expect(existsSync(path)).toBe(true);
  }, 10_000);
});
