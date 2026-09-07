// macOS lockf acquires a kernel lock on an inherited descriptor. Node retains
// the same open file description, so the lock survives lockf's exit and lasts
// until release/process death. The file stays in place; no stale-lock deletion
// can steal another worker's lock. Scheduled and manual runs share this inode.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function acquireFantasyRunLock({
  path = resolve(homedir(), '.local/share/gary/locks/fantasy-briefing.lock'),
  run = spawnSync,
} = {}) {
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, 'a', 0o600);
  let result;
  try {
    // stdio[3] duplicates Node's open descriptor into the child as fd 3. This
    // is lockf's documented descriptor mode; it does not launch another worker.
    result = run('/usr/bin/lockf', ['-s', '-t', '0', '3'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe', descriptor] });
  } catch (error) { closeSync(descriptor); throw error; }
  if (result.error || result.status !== 0) {
    closeSync(descriptor);
    if (!result.error && result.status === 75) return { acquired: false, release() {} };
    throw new Error('Cannot acquire the Mac Fantasy process lock');
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener('exit', release);
    closeSync(descriptor);
  };
  process.once('exit', release);
  return { acquired: true, release };
}
