import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';

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

const nflFetchersSource = fs.readFileSync(
  path.join(here, '../../../src/services/agentic/tools/statRouters/nflFetchers.js'),
  'utf8'
);

/**
 * Tokens are discovered from source rather than hardcoded so a fetcher added
 * later cannot quietly escape the contract. The count assertion below makes
 * silent shrinkage (a broken regex covering nothing) fail loudly.
 */
function seasonStatsTokens() {
  const starts = [...nflFetchersSource.matchAll(/^ {2}([A-Z][A-Z0-9_]*): *async/gm)]
    .map((m) => ({ token: m[1], index: m.index }));
  const tokens = [];
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1].index : nflFetchersSource.length;
    const body = nflFetchersSource.slice(starts[i].index, end);
    // Any fetcher that pulls a season row is covered. Do NOT narrow this to
    // `homeStats?.field` — TURNOVER_LUCK reads `homeStats.defense_interceptions`
    // without the optional chain and escaped the first audit sweep entirely.
    if (!/getTeamSeasonStats/.test(body)) continue;
    tokens.push(starts[i].token);
  }
  return tokens;
}

const TOKENS = seasonStatsTokens();

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
