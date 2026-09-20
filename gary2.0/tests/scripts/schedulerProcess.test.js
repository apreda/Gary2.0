import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSchedulerProcessRunner, SchedulerChildDeadlineError } from '../../scripts/lib/schedulerProcess.js';

let dir, child, spawnProcess, signalProcessGroup, run;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-20T02:00:00Z'));
  dir = mkdtempSync(join(tmpdir(), 'gary-scheduler-process-'));
  child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 123 });
  spawnProcess = vi.fn(() => child);
  signalProcessGroup = vi.fn();
  run = createSchedulerProcessRunner({ projectDir: dir, logDir: dir, spawnProcess, signalProcessGroup });
});
afterEach(() => { vi.useRealTimers(); rmSync(dir, { recursive: true, force: true }); });

describe('scheduler process ownership', () => {
  it('refuses a child with no remaining execution window', async () => {
    await expect(run('fixture.js', [], { timeoutMs: 0 })).rejects.toBeInstanceOf(SchedulerChildDeadlineError);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('passes the exact child deadline, returns output and writes the Eastern-day log', async () => {
    const done = run('fixture.js', ['--mlb'], { timeoutMs: 1200 });
    expect(spawnProcess).toHaveBeenCalledWith('node', ['fixture.js', '--mlb'], expect.objectContaining({
      cwd: dir, detached: true,
      env: expect.objectContaining({ NODE_OPTIONS: '', GARY_CHILD_DEADLINE_AT: '2026-09-20T02:00:01.200Z' }),
    }));
    child.stdout.emit('data', Buffer.from('output\n'));
    child.stderr.emit('data', Buffer.from('diagnostic\n'));
    child.emit('close', 0);
    expect(await done).toBe('output\ndiagnostic\n');
    expect(readFileSync(join(dir, '2026-09-19---mlb.log'), 'utf8')).toBe('output\ndiagnostic\n');
    expect(vi.getTimerCount()).toBe(0);
    expect(signalProcessGroup).not.toHaveBeenCalled();
  });

  it('does not release a timed-out lane before the descendant cleanup grace period', async () => {
    let settled = false;
    const done = run('fixture.js', [], { timeoutMs: 100, limitingReason: 'kickoff' })
      .catch(error => { settled = true; return error; });
    await vi.advanceTimersByTimeAsync(100);
    expect(signalProcessGroup).toHaveBeenLastCalledWith(child, 'SIGTERM');
    child.emit('close', 0); // direct child has exited, descendants may still own work
    child.emit('error', new Error('late close error'));
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signalProcessGroup).toHaveBeenLastCalledWith(child, 'SIGKILL');
    expect(await done).toMatchObject({ code: 'SCHEDULER_CHILD_DEADLINE', retryable: true, limitingReason: 'kickoff' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'nonzero'])('releases timers on an early %s', async event => {
    const done = run('fixture.js');
    const rejected = expect(done).rejects.toThrow(event === 'error' ? 'spawn failed' : 'Exit code 3');
    if (event === 'error') child.emit('error', new Error('spawn failed'));
    else child.emit('close', 3);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(signalProcessGroup).not.toHaveBeenCalled();
  });
});
