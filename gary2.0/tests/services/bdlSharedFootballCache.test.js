import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isFootballBdlCacheKey,
  isSubstantiveSharedCacheValue,
  readSharedFootballCache,
  writeSharedFootballCache,
} from '../../src/services/bdlSharedFootballCache.js';

let isolatedDir = null;

afterEach(async () => {
  delete process.env.GARY_BDL_SHARED_CACHE_DIR;
  if (isolatedDir) await rm(isolatedDir, { recursive: true, force: true });
  isolatedDir = null;
});

describe('football-only shared BDL cache', () => {
  it('never changes the established MLB/NBA cache path', () => {
    expect(isFootballBdlCacheKey('americanfootball_nfl_teams_{}')).toBe(true);
    expect(isFootballBdlCacheKey('ncaaf_team_players_44')).toBe(true);
    expect(isFootballBdlCacheKey('baseball_mlb_games_today')).toBe(false);
    expect(isFootballBdlCacheKey('basketball_nba_teams')).toBe(false);
  });

  it('does not share empty or missing responses', () => {
    expect(isSubstantiveSharedCacheValue([])).toBe(false);
    expect(isSubstantiveSharedCacheValue({})).toBe(false);
    expect(isSubstantiveSharedCacheValue([{ id: 1 }])).toBe(true);
  });

  it('round-trips an unexpired football response and rejects it after expiry', async () => {
    isolatedDir = await mkdtemp(join(tmpdir(), 'gary-bdl-cache-test-'));
    process.env.GARY_BDL_SHARED_CACHE_DIR = isolatedDir;
    const key = 'americanfootball_nfl_teams_{}';
    const now = 1_000_000;
    expect(await writeSharedFootballCache(key, [{ id: 3 }], 5, now)).toBe(true);
    expect(await readSharedFootballCache(key, now + 1)).toMatchObject({ hit: true, data: [{ id: 3 }] });
    expect(await readSharedFootballCache(key, now + 5 * 60_000 + 1)).toEqual({ hit: false });
  });
});
