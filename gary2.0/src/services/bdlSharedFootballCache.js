/**
 * Small cross-process cache for football BDL reads.
 *
 * NFL Sundays launch one child per game, so the ordinary in-memory cache and
 * single-flight map cannot stop separate Node processes from downloading the
 * same teams, standings, schedule, roster and prior-season baseline rows.
 * This cache is deliberately football-only; MLB and every other established
 * lane retain their existing cache behavior.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_ROOT = join(tmpdir(), 'gary-bdl-football-cache-v1');

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

export function isSubstantiveSharedCacheValue(data) {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') return Object.keys(data).length > 0;
  return data !== null && data !== undefined && data !== '';
}

function cachePath(key) {
  const digest = createHash('sha256').update(String(key)).digest('hex');
  return join(rootDir(), `${digest}.json`);
}

export async function readSharedFootballCache(key, now = Date.now()) {
  if (disabled() || !isFootballBdlCacheKey(key)) return { hit: false };
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

export async function writeSharedFootballCache(key, data, ttlMinutes, now = Date.now()) {
  if (disabled() || !isFootballBdlCacheKey(key) || !isSubstantiveSharedCacheValue(data)) return false;
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
  readSharedFootballCache,
  writeSharedFootballCache,
};
