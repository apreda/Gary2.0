/**
 * Cross-process Ball Don't Lie request gate.
 *
 * Gary's scheduler launches one Node child per game. An in-memory limiter in
 * ballDontLieService therefore cannot protect a five-requests/minute API key:
 * three simultaneous NFL children each believe they own the full allowance.
 * This tiny file-backed clock is shared by every local child PID and spaces
 * request starts evenly. Four local starts/minute deliberately reserve the
 * fifth account slot for the deployed live-score function.
 */
import { mkdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// The cloud live-score poll can consume two starts/minute when MLB and
// football overlap. Keep local workers to the remaining three slots on the
// five-request trial instead of racing the cloud function for the fifth.
export const BDL_LOCAL_REQUESTS_PER_MINUTE = 3;
export const BDL_LOCAL_REQUEST_INTERVAL_MS = Math.ceil(60_000 / BDL_LOCAL_REQUESTS_PER_MINUTE) + 100;

const DEFAULT_GATE_DIR = join(tmpdir(), 'gary-bdl-request-gate');
const LOCK_STALE_MS = 20_000;
const LOCK_TIMEOUT_MS = 30_000;
const MAX_REASONABLE_BACKLOG_MS = 5 * 60_000;

function sleep(ms, signal) {
  return signal ? delay(ms, undefined, { signal }) : new Promise((resolve) => setTimeout(resolve, ms));
}

function gateDisabled() {
  return process.env.GARY_BDL_RATE_GATE_DISABLED === '1' ||
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.VITEST);
}

function paths() {
  const root = process.env.GARY_BDL_RATE_GATE_DIR || DEFAULT_GATE_DIR;
  return {
    root,
    lock: join(root, 'lock'),
    state: join(root, 'state.json'),
  };
}

export function reserveBdlSlot(state, now = Date.now(), intervalMs = BDL_LOCAL_REQUEST_INTERVAL_MS) {
  const recordedNext = Number(state?.nextAt);
  const validRecordedNext = Number.isFinite(recordedNext) &&
    recordedNext >= now - intervalMs &&
    recordedNext <= now + MAX_REASONABLE_BACKLOG_MS;
  const slotAt = validRecordedNext ? Math.max(now, recordedNext) : now;
  return {
    slotAt,
    state: { version: 1, nextAt: slotAt + intervalMs, updatedAt: now },
  };
}

async function acquireLock(lockPath, signal) {
  const started = Date.now();
  for (;;) {
    signal?.throwIfAborted();
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          await rmdir(lockPath);
          continue;
        }
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error('Timed out acquiring the shared BDL request gate');
      }
      await sleep(40 + Math.floor(Math.random() * 40), signal);
    }
  }
}

async function readState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeState(root, statePath, state) {
  const temporary = join(root, `state.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, JSON.stringify(state), 'utf8');
  await rename(temporary, statePath);
}

/**
 * Reserve and wait for one account-wide local BDL request start.
 * Throws on coordination failure so callers fail closed instead of bursting.
 */
export async function waitForBdlRequestSlot(label = 'request', { signal } = {}) {
  signal?.throwIfAborted();
  if (gateDisabled()) return 0;

  const gate = paths();
  await mkdir(gate.root, { recursive: true });
  const started = Date.now();
  let announced = false;

  // Do not book a chain of future slots. Promise.all callers can disappear
  // while waiting (child timeout/restart); advance the shared clock only when
  // a caller is actually ready to start a transport. This avoids phantom
  // multi-minute backlogs after a cancelled desk.
  for (;;) {
    signal?.throwIfAborted();
    await acquireLock(gate.lock, signal);
    let waitMs = 0;
    let claimed = false;
    try {
      signal?.throwIfAborted();
      const now = Date.now();
      const current = await readState(gate.state);
      signal?.throwIfAborted();
      const recordedNext = Number(current?.nextAt);
      const validNext = Number.isFinite(recordedNext)
        && recordedNext >= now - BDL_LOCAL_REQUEST_INTERVAL_MS
        && recordedNext <= now + BDL_LOCAL_REQUEST_INTERVAL_MS * 2;
      const nextAt = validNext ? recordedNext : now;

      if (nextAt <= now) {
        await writeState(gate.root, gate.state, {
          version: 2,
          nextAt: now + BDL_LOCAL_REQUEST_INTERVAL_MS,
          updatedAt: now,
        });
        claimed = true;
      } else {
        waitMs = nextAt - now;
      }
    } finally {
      try { await rmdir(gate.lock); } catch {}
    }

    signal?.throwIfAborted();
    if (claimed) return Date.now() - started;
    if (!announced && waitMs > 250) {
      console.log(`[Ball Don't Lie] Shared rate gate: ${label} waits ${(waitMs / 1000).toFixed(1)}s`);
      announced = true;
    }
    await sleep(Math.max(50, waitMs + Math.floor(Math.random() * 50)), signal);
  }
}

export default { waitForBdlRequestSlot, reserveBdlSlot };
