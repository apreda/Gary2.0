import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isFootballBdlCacheKey,
  isMlbSharedBdlCacheKey,
  isSharedBdlCacheKey,
  isSubstantiveSharedCacheValue,
  readSharedBdlCache,
  writeSharedBdlCache,
} from '../../src/services/bdlSharedCache.js';

let isolatedDir = null;

afterEach(async () => {
  delete process.env.GARY_BDL_SHARED_CACHE_DIR;
  if (isolatedDir) await rm(isolatedDir, { recursive: true, force: true });
  isolatedDir = null;
});

describe('shared BDL cache eligibility', () => {
  it('keeps the football predicate football-only (the 3/min gate depends on it)', () => {
    expect(isFootballBdlCacheKey('americanfootball_nfl_teams_{}')).toBe(true);
    expect(isFootballBdlCacheKey('ncaaf_team_players_44')).toBe(true);
    expect(isFootballBdlCacheKey('baseball_mlb_games_today')).toBe(false);
    expect(isFootballBdlCacheKey('mlb_player_splits_716_2026')).toBe(false);
    expect(isFootballBdlCacheKey('basketball_nba_teams')).toBe(false);
  });

  it('shares exactly the two MLB 429-storm key families, nothing wider', () => {
    expect(isMlbSharedBdlCacheKey('mlb_player_splits_716_2026')).toBe(true);
    expect(isMlbSharedBdlCacheKey('mlb_pvp_745_vs_24')).toBe(true);
    expect(isMlbSharedBdlCacheKey('mlb_games_2026-08-26')).toBe(false);
    expect(isMlbSharedBdlCacheKey('mlb_game_stats_{"game_ids":[1]}')).toBe(false);
    expect(isMlbSharedBdlCacheKey('mlb_player_props_5059762_{}')).toBe(false);
    expect(isSharedBdlCacheKey('mlb_player_splits_716_2026')).toBe(true);
    expect(isSharedBdlCacheKey('americanfootball_nfl_teams_{}')).toBe(true);
    expect(isSharedBdlCacheKey('basketball_nba_teams')).toBe(false);
  });

  it('round-trips an MLB splits record across the shared layer', async () => {
    isolatedDir = await mkdtemp(join(tmpdir(), 'gary-bdl-cache-test-'));
    process.env.GARY_BDL_SHARED_CACHE_DIR = isolatedDir;
    const key = 'mlb_player_splits_716_2026';
    const now = 2_000_000;
    expect(await writeSharedBdlCache(key, { byBreakdown: [{ split_name: 'vs LHP' }] }, 720, now)).toBe(true);
    expect(await readSharedBdlCache(key, now + 1)).toMatchObject({ hit: true });
    expect(await readSharedBdlCache(key, now + 721 * 60_000)).toEqual({ hit: false });
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
    expect(await writeSharedBdlCache(key, [{ id: 3 }], 5, now)).toBe(true);
    expect(await readSharedBdlCache(key, now + 1)).toMatchObject({ hit: true, data: [{ id: 3 }] });
    expect(await readSharedBdlCache(key, now + 5 * 60_000 + 1)).toEqual({ hit: false });
  });
});
