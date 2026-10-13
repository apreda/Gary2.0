// Write-ups are reused while their facts are unchanged (founder, Sep 24 2026:
// "we're just wasting a lot of usage here"). Every content run and every
// hourly availability refresh sent every row back to Opus, and nearly all of
// those facts were identical to the last pass. A read is keyed by everything
// that shapes it (copy version, model, lane, angle, length, the fact itself),
// so any change to the evidence writes a fresh one. Local files on the
// machine that runs the jobs; a missing or unreadable cache only means a
// fresh write, never a failed lane.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = process.env.GARY_LANE_READ_CACHE_DIR || join(homedir(), 'Library', 'Caches', 'Gary2.0', 'lane-reads');
// Tests set GARY_LANE_READ_CACHE=off so every call reaches the model stub.
const OFF = process.env.GARY_LANE_READ_CACHE === 'off';
// An unchanged fact is rewritten about once a day and a half.
const TTL_MS = 36 * 60 * 60 * 1000;
let pruned = false;

export function laneReadKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function cachedLaneRead(key, now = Date.now()) {
  if (OFF) return null;
  try {
    const path = join(DIR, `${key}.txt`);
    if (now - statSync(path).mtimeMs > TTL_MS) return null;
    const read = readFileSync(path, 'utf8').trim();
    return read || null;
  } catch {
    return null;
  }
}

export function storeLaneRead(key, read) {
  if (OFF) return;
  try {
    mkdirSync(DIR, { recursive: true });
    const tmp = join(DIR, `${key}.${process.pid}.tmp`);
    writeFileSync(tmp, read);
    renameSync(tmp, join(DIR, `${key}.txt`));
  } catch {
    // A read that cannot be cached is written again next pass.
  }
}

/** Drop expired reads once per process. */
export function pruneLaneReads(now = Date.now()) {
  if (pruned || OFF) return;
  pruned = true;
  try {
    for (const name of readdirSync(DIR)) {
      const path = join(DIR, name);
      try { if (now - statSync(path).mtimeMs > TTL_MS) unlinkSync(path); } catch { /* raced another pass */ }
    }
  } catch {
    // No cache directory yet.
  }
}
