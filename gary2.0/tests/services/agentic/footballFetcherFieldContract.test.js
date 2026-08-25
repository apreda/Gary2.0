import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { nflFetchers, seasonSampleTokens } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';

/**
 * FIELD-NAME CONTRACT (Aug 24 2026 audit).
 *
 * A fetcher that reads a BDL field which does not exist never throws: the
 * request is a clean HTTP 200, the JSON is valid, the row count is right, and
 * the one key it asked for simply is not there. `fmtNum`/`fmtPct` turn that
 * `undefined` into the string 'N/A', so the lane goes quiet for every game
 * forever and the scout still reports itself healthy.
 *
 * Nine of twenty-one NFL season-stat fetchers were reading invented field
 * names when this test was written — SUCCESS_RATE_DEFENSE, PRESSURE_RATE and
 * DEFENSIVE_PLAYMAKERS were returning nothing at all, so Gary had never seen
 * an opponent third-down rate or a pass-rush number for an NFL game.
 *
 * The guard: hand every fetcher a row containing EXACTLY the keys BDL really
 * returns (captured live, see tests/fixtures/bdlFootballFields.json), then
 * assert nothing comes back 'N/A'. A field name that drifts from the payload
 * fails here instead of going silent in production.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(here, '../../fixtures/bdlFootballFields.json'), 'utf8')
);
const NFL_SEASON_FIELDS = fixture.nfl_team_season_stats;

/**
 * BOTH modules are scanned (Aug 25 2026).
 *
 * Fifteen season-stat fetchers moved to footballAdvancedTokens.js when the
 * play ledger landed. Scanning only nflFetchers.js would have quietly dropped
 * them from this contract — the guard would still pass, covering four fewer
 * tokens than before, which is exactly the silent-shrinkage failure the count
 * assertion below exists to catch. It caught it.
 */
const SOURCES = [
  '../../../src/services/agentic/tools/statRouters/nflFetchers.js',
  '../../../src/services/agentic/tools/statRouters/footballAdvancedTokens.js'
].map((rel) => fs.readFileSync(path.join(here, rel), 'utf8'));

const nflFetchersSource = SOURCES[0];

/**
 * Tokens are discovered from source rather than hardcoded so a fetcher added
 * later cannot quietly escape the contract. The count assertion below makes
 * silent shrinkage (a broken regex covering nothing) fail loudly.
 */
function tokensIn(fullSource, openingLiteral) {
  // Bound the search to the map literal. The LAST fetcher's body otherwise ran
  // to end-of-file and swallowed the module-level code beneath it, which reads
  // as a seasonPair() call and produced a phantom season-stat token.
  const mapStart = fullSource.indexOf(openingLiteral);
  if (mapStart === -1) return [];
  const mapEnd = fullSource.indexOf('\n};', mapStart);
  const source = fullSource.slice(mapStart, mapEnd === -1 ? undefined : mapEnd);

  const starts = [...source.matchAll(/^ {2}([A-Z][A-Z0-9_]*): *async/gm)]
    .map((m) => ({ token: m[1], index: m.index }));
  const tokens = [];
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    const body = source.slice(starts[i].index, end);
    // Any fetcher that pulls a season row is covered — whether it calls
    // getTeamSeasonStats directly or goes through the shared seasonPair()
    // helper. Do NOT narrow this to `homeStats?.field`: TURNOVER_LUCK reads
    // `homeStats.defense_interceptions` without the optional chain and escaped
    // the first audit sweep entirely.
    // bdlPair() is footballAdvancedTokens.js's equivalent of seasonPair().
    if (!/getTeamSeasonStats|seasonPair\(|bdlPair\(/.test(body)) continue;
    tokens.push(starts[i].token);
  }
  return tokens;
}

const TOKENS = [...new Set([
  ...tokensIn(SOURCES[0], 'export const nflFetchers = {'),
  ...tokensIn(SOURCES[1], 'export const footballAdvancedTokens = {')
])];

/**
 * A BDL row carrying every real key and nothing else, wrapped so that reading
 * a key BDL does not return is RECORDED rather than silently undefined.
 *
 * Checking the rendered output for 'N/A' is not enough on its own: a fetcher
 * that writes `stats?.invented_field || 0` turns a missing key into a hard
 * zero and reports it as a fetched fact (FUMBLE_LUCK claimed "0 forced
 * fumbles, 50.0% recovery rate" for every NFL team this way). Catching the
 * read itself covers both the silent-N/A and the fabricated-zero classes.
 */
function bdlSeasonRow(teamId, misses) {
  const row = { team: { id: teamId } };
  for (const key of NFL_SEASON_FIELDS) row[key] = 7;
  // games_played must be a sane divisor for per-game derivations.
  row.games_played = 17;

  return new Proxy(row, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !(key in target)) misses.add(key);
      return Reflect.get(target, key, receiver);
    }
  });
}

const home = { id: 11, name: 'Home Team', full_name: 'Home Team' };
const away = { id: 22, name: 'Away Team', full_name: 'Away Team' };

describe('NFL fetcher → BDL field-name contract', () => {
  let original;
  let misses;

  beforeEach(() => {
    misses = new Set();
    original = {
      getTeamSeasonStats: ballDontLieService.getTeamSeasonStats,
      getGames: ballDontLieService.getGames
    };
    ballDontLieService.getTeamSeasonStats = async (_sport, { teamId } = {}) => [
      bdlSeasonRow(teamId, misses)
    ];
    ballDontLieService.getGames = async () => [];
  });

  afterEach(() => {
    ballDontLieService.getTeamSeasonStats = original.getTeamSeasonStats;
    ballDontLieService.getGames = original.getGames;
  });

  it('discovers the season-stat fetchers it is meant to guard', () => {
    // Nineteen at the time of the audit. A drop means the discovery regex
    // broke and the contract silently stopped covering anything.
    expect(TOKENS.length).toBeGreaterThanOrEqual(19);
  });

  it.each(TOKENS)('%s reads only fields BDL actually returns', async (token) => {
    const result = await nflFetchers[token]('americanfootball_nfl', home, away, 2025);

    // Every key the fetcher asked for must exist in the real payload.
    expect([...misses]).toEqual([]);

    // And nothing may render as 'N/A' — a field that resolved to undefined
    // for any other reason is the same blind lane by a different route.
    expect(JSON.stringify(result)).not.toContain('N/A');
  });
});

describe('season stats carry the sample behind them', () => {
  let original;
  let misses;

  beforeEach(() => {
    misses = new Set();
    original = ballDontLieService.getTeamSeasonStats;
    ballDontLieService.getTeamSeasonStats = async (_sport, { teamId } = {}) => [
      bdlSeasonRow(teamId, misses)
    ];
  });

  afterEach(() => {
    ballDontLieService.getTeamSeasonStats = original;
  });

  it('stamps every season-stat fetcher, and the list has not drifted', () => {
    // The stamp list is explicit; this keeps it equal to the set of fetchers
    // that actually read a season row, so a new one cannot ship unstamped.
    expect(seasonSampleTokens().sort()).toEqual([...TOKENS].sort());
  });

  it('states the games behind the rate, not just the rate', async () => {
    const result = await nflFetchers.OFFENSIVE_EPA('americanfootball_nfl', home, away, 2025);
    expect(result.sample).toContain('17 games');
    expect(result.sample).toContain('2025 season');
    expect(result.sample).toContain('Home Team');
    expect(result.sample).toContain('Away Team');
  });

  it('says so plainly when the game count is not reported', async () => {
    ballDontLieService.getTeamSeasonStats = async (_sport, { teamId } = {}) => {
      const row = bdlSeasonRow(teamId, misses);
      return [{ ...row, games_played: null }];
    };
    const result = await nflFetchers.OFFENSIVE_EPA('americanfootball_nfl', home, away, 2025);
    expect(result.sample === undefined || result.sample.includes('not reported')).toBe(true);
  });

  it('never loses the stat if provenance cannot be built', async () => {
    ballDontLieService.getTeamSeasonStats = async () => { throw new Error('BDL down'); };
    const result = await nflFetchers.OFFENSIVE_EPA('americanfootball_nfl', home, away, 2025)
      .catch(() => null);
    // The inner fetcher shares the same failure, so either it threw or it
    // returned — what must never happen is a stamped-but-empty result.
    if (result) expect(result.category).toBeTruthy();
  });
});
