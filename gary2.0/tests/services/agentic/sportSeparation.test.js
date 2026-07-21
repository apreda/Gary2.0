// Cross-sport contamination guards — July 6 2026 audit (founder directive:
// sports share structure and process, NEVER each other's data paths).
//
// The live bug this pins down: getOddsV2 silently normalized any unrecognized
// sport to 'nba', so WC odds requests hit the NBA endpoint (401 → every WC pick
// stored sportsbook_odds: null; had it returned rows, soccer would have carried
// NBA prices). Same disease existed as an nbaSeason() fallthrough in fetchStats
// and an ungated flat token map that would execute another sport's fetcher.
import { describe, it, expect } from 'vitest';

process.env.BALLDONTLIE_API_KEY ||= 'test-key';

const { nbaFetchers } = await import('../../../src/services/agentic/tools/statRouters/nbaFetchers.js');
const { ncaabFetchers } = await import('../../../src/services/agentic/tools/statRouters/ncaabFetchers.js');
const { ncaafFetchers } = await import('../../../src/services/agentic/tools/statRouters/ncaafFetchers.js');
const { nflFetchers } = await import('../../../src/services/agentic/tools/statRouters/nflFetchers.js');
const { nhlFetchers } = await import('../../../src/services/agentic/tools/statRouters/nhlFetchers.js');
const { mlbFetchers } = await import('../../../src/services/agentic/tools/statRouters/mlbFetchers.js');
const { fetchStats } = await import('../../../src/services/agentic/tools/statRouters/index.js');
const { ballDontLieService } = await import('../../../src/services/ballDontLieService.js');

describe('stat token namespace is collision-free across sports', () => {
  it('no token name is defined by two sports (incl. DEFAULT — neutral DEFAULT lives in the router)', () => {
    const sources = { nba: nbaFetchers, ncaab: ncaabFetchers, ncaaf: ncaafFetchers, nfl: nflFetchers, nhl: nhlFetchers, mlb: mlbFetchers };
    const owner = {};
    const collisions = [];
    for (const [sport, map] of Object.entries(sources)) {
      for (const token of Object.keys(map)) {
        if (owner[token]) collisions.push(`${token} (${owner[token]} + ${sport})`);
        else owner[token] = sport;
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('fetchStats never crosses sport families', () => {
  it('an MLB run cannot execute an NHL fetcher', async () => {
    const res = await fetchStats('baseball_mlb', 'GOALIE_STATS', 'Astros', 'Rays', {});
    expect(res.error).toMatch(/belongs to NHL|not available/i);
  });

  it('an unknown sport hard-fails instead of borrowing the NBA season', async () => {
    await expect(fetchStats('cricket_t20', 'ANYTHING', 'A', 'B', {})).rejects.toThrow(/HARD FAIL/);
  });
});

describe('getOddsV2 never defaults to another sport’s endpoint', () => {
  it('bails loudly (no network) for a sport with no mapped odds route', async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    try {
      const rows = await ballDontLieService.getOddsV2({ game_ids: [166] }, 'soccer_world_cup');
      expect(rows).toEqual([]);
      expect(warns.some(w => /no odds endpoint mapped/i.test(w))).toBe(true);
    } finally {
      console.warn = orig;
    }
  });
});
