import { describe, it, expect, vi } from 'vitest';
import { busySchedulerProcesses, recoverLaunchdJob } from '../../scripts/lib/launchdRecovery.js';

const config = { label: 'com.gary.scheduler', domain: 'gui/501', plist: '/jobs/scheduler.plist', ageSeconds: 600, staleSeconds: 300, protectPickWorkers: true };
const loaded = { status: 0, stdout: 'state = running\n pid = 10\n' };
const absent = { status: 113, stderr: 'Could not find service' };

function harness({ busy = '1 0 /sbin/launchd', bootstrapFailures = 0, unloadFailure = false, initiallyLoaded = true } = {}) {
  let present = initiallyLoaded;
  const run = vi.fn((file, args) => {
    if (file === '/bin/ps') return { status: 0, stdout: busy };
    if (args[0] === 'print') return present ? loaded : absent;
    if (args[0] === 'bootout') { if (unloadFailure) return { status: 1 }; present = false; return { status: 0 }; }
    if (args[0] === 'bootstrap') { if (bootstrapFailures-- > 0) return { status: 5 }; present = true; return { status: 0 }; }
    throw new Error('Unexpected destructive command');
  });
  return { run, sleep: vi.fn().mockResolvedValue() };
}

describe('bounded launchd recovery', () => {
  it('does nothing while the current worker freshness marker is healthy', async () => {
    const deps = harness();
    expect(await recoverLaunchdJob({ ...config, ageSeconds: 20 }, deps)).toEqual({ action: 'fresh' });
    expect(deps.run).not.toHaveBeenCalled();
  });
  it('waits for attached writers and detects detached writers after the scheduler dies', async () => {
    for (const busy of ['11 10 node scripts/run-agentic-picks.js --mlb', '11 1 /runtime/node scripts/run-agentic-mlb-props.js --game-id 8']) {
      const deps = harness({ busy });
      expect(await recoverLaunchdJob(config, deps)).toEqual({ action: 'deferred', active_process_ids: [11] });
      expect(deps.run.mock.calls.map(([, args]) => args[0])).not.toContain('bootout');
    }
  });
  it('keeps descendant model work protected without returning its sensitive process title', () => {
    const output = '10 1 node scheduler.js\n11 10 /usr/bin/caffeinate -i\n12 10 node snapshot.js\n13 12 codex TOKEN=secret\n14 1 node unrelated.js';
    expect(busySchedulerProcesses(output, 10)).toEqual([12, 13]);
    expect(busySchedulerProcesses('15 1 node scripts/run-agentic-nfl-props.js', null)).toEqual([15]);
  });
  it('reloads once without force-restarting the newly launched worker', async () => {
    const deps = harness({ busy: '11 10 /usr/bin/caffeinate -i -s' });
    expect(await recoverLaunchdJob(config, deps)).toEqual({ action: 'reloaded', attempts: 1 });
    expect(deps.run.mock.calls.filter(([, args]) => args[0] === 'bootstrap')).toHaveLength(1);
    expect(deps.run.mock.calls.flat(2)).not.toContain('kickstart');
  });
  it('retries the bootout/bootstrap transition without killing a replacement', async () => {
    const deps = harness({ bootstrapFailures: 2 });
    expect(await recoverLaunchdJob(config, deps)).toEqual({ action: 'reloaded', attempts: 3 });
    expect(deps.sleep).toHaveBeenCalledTimes(2);
    expect(deps.run.mock.calls.filter(([, args]) => args[0] === 'bootout')).toHaveLength(1);
  });
  it('fails visibly after bounded reload failures', async () => {
    const deps = harness({ bootstrapFailures: 10 });
    await expect(recoverLaunchdJob(config, deps)).rejects.toThrow('three attempts');
    expect(deps.run.mock.calls.filter(([, args]) => args[0] === 'bootstrap')).toHaveLength(3);
  });
  it('does not bootstrap another owner when unloading fails', async () => {
    const deps = harness({ unloadFailure: true });
    await expect(recoverLaunchdJob(config, deps)).rejects.toThrow('replacement withheld');
    expect(deps.run.mock.calls.filter(([, args]) => args[0] === 'bootstrap')).toHaveLength(0);
  });
  it('refuses recovery when process inspection cannot establish safety', async () => {
    const deps = harness();
    const run = deps.run;
    deps.run = (file, args) => file === '/bin/ps' ? { status: 1 } : run(file, args);
    await expect(recoverLaunchdJob(config, deps)).rejects.toThrow('Cannot inspect active writers');
  });
  it('restores an unloaded interval job using RunAtLoad', async () => {
    const deps = harness({ initiallyLoaded: false });
    expect(await recoverLaunchdJob({ ...config, protectPickWorkers: false }, deps)).toEqual({ action: 'reloaded', attempts: 1 });
    expect(deps.run.mock.calls.map(([, args]) => args[0])).not.toContain('bootout');
  });
  it('withholds recovery on an empty or unreadable process snapshot', async () => {
    for (const busy of ['', 'unexpected output']) {
      const deps = harness({ busy });
      await expect(recoverLaunchdJob(config, deps)).rejects.toThrow('empty process snapshot');
      expect(deps.run.mock.calls.map(([, args]) => args[0])).not.toContain('bootout');
    }
  });
});
