/**
 * Small cross-process cache for selected BDL reads.
 *
 * Gary's scheduler and batch jobs launch fresh Node children all day, so the
 * ordinary in-memory cache and single-flight map cannot stop separate
 * processes from downloading the same rows again and again. This file-backed
 * cache is shared by every local PID.
 *
 * Eligibility is an explicit allowlist, never blanket:
 *  - FOOTBALL keys (the original scope): NFL Sundays launch one child per
 *    game, all needing the same teams/standings/schedule/roster rows.
 *  - MLB PLAYER SPLITS + PLAYER-VS-PLAYER (added Aug 26 2026): season-level
 *    aggregates that barely change intraday, yet the insights lanes walked
 *    hundreds of players per run from a cold in-memory cache — the documented
 *    429 storms (2,758 "Too many requests" during the Aug 24 marathon) were
 *    mostly this repeat traffic. Long TTLs + this shared layer mean the first
 *    run of the day pays for everyone.
 * Every other established lane retains its existing cache behavior.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_ROOT = join(tmpdir(), 'gary-bdl-shared-cache-v1');

function disabled() {
  if (process.env.GARY_BDL_SHARED_CACHE_DISABLED === '1') return true;
  // Unit tests should never inherit live cache state unless a test explicitly
  // supplies its own isolated directory.
  return (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST))
    && !process.env.GARY_BDL_SHARED_CACHE_DIR;
}

function rootDir() {
  return process.env.GARY_BDL_SHARED_CACHE_DIR || DEFAULT_ROOT;
}

export function isFootballBdlCacheKey(key) {
  return /(^|_)(?:americanfootball_)?(?:nfl|ncaaf)(?:_|$)/i.test(String(key || ''));
}

/** The two MLB per-player key families behind the 429 storms — nothing wider. */
export function isMlbSharedBdlCacheKey(key) {
  return /^mlb_(?:player_splits|pvp)_/i.test(String(key || ''));
}

/** A key eligible for the cross-process shared cache. */
export function isSharedBdlCacheKey(key) {
  return isFootballBdlCacheKey(key) || isMlbSharedBdlCacheKey(key);
}

export function isSubstantiveSharedCacheValue(data) {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') return Object.keys(data).length > 0;
  return data !== null && data !== undefined && data !== '';
}

function cachePath(key) {
  const digest = createHash('sha256').update(String(key)).digest('hex');
  return join(rootDir(), `${digest}.json`);
}

export async function readSharedBdlCache(key, now = Date.now()) {
  if (disabled() || !isSharedBdlCacheKey(key)) return { hit: false };
  try {
    const record = JSON.parse(await readFile(cachePath(key), 'utf8'));
    if (record?.key !== key || !Number.isFinite(record?.expiry) || record.expiry <= now) {
      return { hit: false };
    }
    if (!isSubstantiveSharedCacheValue(record.data)) return { hit: false };
    return { hit: true, data: record.data, expiry: record.expiry };
  } catch {
    return { hit: false };
  }
}

export async function writeSharedBdlCache(key, data, ttlMinutes, now = Date.now()) {
  if (disabled() || !isSharedBdlCacheKey(key) || !isSubstantiveSharedCacheValue(data)) return false;
  const ttlMs = Number(ttlMinutes) * 60_000;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
  try {
    const root = rootDir();
    await mkdir(root, { recursive: true });
    const target = cachePath(key);
    const temporary = join(root, `.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
    await writeFile(temporary, JSON.stringify({ version: 1, key, expiry: now + ttlMs, data }), 'utf8');
    await rename(temporary, target);
    return true;
  } catch {
    // Cache coordination is an optimization. The verified provider response
    // remains usable even if the local filesystem is momentarily unavailable.
    return false;
  }
}

export default {
  isFootballBdlCacheKey,
  isMlbSharedBdlCacheKey,
  isSharedBdlCacheKey,
  readSharedBdlCache,
  writeSharedBdlCache,
};
