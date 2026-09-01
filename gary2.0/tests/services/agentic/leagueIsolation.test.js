import { describe, expect, it, vi } from 'vitest';
import { resolveTokenForSport } from '../../../src/services/agentic/tools/statRouters/index.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';
import { ncaafFetchers } from '../../../src/services/agentic/tools/statRouters/ncaafFetchers.js';

// THE CHARGERS-ON-WAKE-FOREST PIN (Sep 1 2026): BDL numbers teams per league
// from small integers, so an NCAAF team id sent into an NFL endpoint files
// some NFL team's rows under the college team — silently, plausibly, with no
// error. fetchInjuries did exactly that until the Sep 1 audit caught NFL
// linemen on a college desk. The service is mocked so this runs offline; the
// pin is that the NCAAF branch NEVER reaches the NFL injuries endpoint.
vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getNflPlayerInjuries: vi.fn(async () => { throw new Error('NFL injuries endpoint reached from a test'); }),
    getTeamByNameGeneric: vi.fn(async () => ({ id: 58 })),
    initialize: () => {},
  },
}));
// The NCAAF branch consults the grounded narrative — kill the live rungs.
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({
  codexCliWebSearch: vi.fn(async () => ({ success: false, data: '', raw: null })),
  isCodexCliModel: (m) => typeof m === 'string' && m.startsWith('codex-'),
}));
vi.mock('../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js', () => ({
  anthropicWebSearchRaw: vi.fn(async () => ({ success: false, data: '', error: 'mocked' })),
}));

/**
 * LEAGUE ISOLATION — the NFL and college football never touch (Aug 25 2026).
 *
 * THE FOUNDER'S RULING: these two are to be as separate as the NFL and
 * baseball. Same sport, different league, different players, nothing shared
 * in either direction.
 *
 * THE HOLE IT CLOSES. The dispatcher's guard was FAMILY-granular, and both
 * leagues map to "americanfootball". Two effects followed:
 *
 *   1. Declared. NCAAF's checklist asked for OL_RANKINGS and DL_RANKINGS,
 *      no NCAAF_ variant existed, and college matchups therefore executed the
 *      NFL implementation. Real, shipped, and live.
 *   2. Undeclared. Thirty-nine unprefixed NFL tokens (WEATHER, QB_STATS,
 *      RED_ZONE_OFFENSE and the rest) were reachable from an NCAAF run, so a
 *      mis-routed or hallucinated token name would have handed a college game
 *      the NFL stadium table and NFL field names against college rows.
 *
 * Both are closed by a league-granular guard. This file is what stops them
 * reopening: a shared implementation with an `if (ncaaf)` branch inside it is
 * not isolation, it is one blast radius wearing two labels.
 */

const NFL = 'americanfootball_nfl';
const NCAAF = 'americanfootball_ncaaf';

// (The "declared checklist" half of this guard died with the researcher's
// factor checklist, deleted Sep 1 2026 — ownership at the dispatcher is now
// the only doorway, and the guards below cover every token name.)

describe('NCAAF injuries never ride the NFL feed (the Chargers-on-Wake-Forest pin)', () => {
  it('the NCAAF branch returns without touching getNflPlayerInjuries, sourceOk from the narrative', async () => {
    const { ballDontLieService } = await import('../../../src/services/ballDontLieService.js');
    const { fetchInjuries } = await import('../../../src/services/agentic/scoutReport/shared/dataFetchers.js');
    const res = await fetchInjuries('Wake Forest Demon Deacons', 'Akron Zips', 'NCAAF', 'Thursday, September 3, 2026');
    expect(ballDontLieService.getNflPlayerInjuries).not.toHaveBeenCalled();
    expect(res.home).toEqual([]);
    expect(res.away).toEqual([]);
    // Both grounded rungs are mocked dead → the source did NOT answer, and a
    // failed fetch is not an empty report (the NCAAF desk gate hard-fails).
    expect(res.sourceOk).toBe(false);
  });
});

describe('no token can cross the league line', () => {
  /**
   * The checklist is not the only way a token name reaches the dispatcher —
   * a research pass can ask for one by name. Ownership, not the checklist,
   * has to be what refuses it.
   */
  it('every NFL fetcher is unreachable from an NCAAF run', () => {
    const reachable = Object.keys(nflFetchers).filter((token) => {
      const r = resolveTokenForSport(NCAAF, token);
      return r.allowed && r.owner === 'nfl';
    });
    expect(reachable).toEqual([]);
  });

  it('every NCAAF fetcher is unreachable from an NFL run', () => {
    const reachable = Object.keys(ncaafFetchers).filter((token) => {
      const r = resolveTokenForSport(NFL, token);
      return r.allowed && r.owner === 'ncaaf';
    });
    expect(reachable).toEqual([]);
  });

  it('names the league line in the refusal, so a silent miss is not mistaken for no data', () => {
    const r = resolveTokenForSport(NCAAF, 'WEATHER');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/isolated leagues/);
  });
});

describe('the NFL module holds no college code, and the reverse', () => {
  /**
   * A branch is not a boundary. If the NFL token module can EXECUTE a college
   * data source, the two leagues share a failure mode again.
   *
   * Comments are stripped before checking: these files necessarily DISCUSS
   * the other league in the docs explaining why they are separated, and a
   * test that fails on prose would push those explanations out of the code.
   * What matters is that no statement can reach across.
   */
  const codeOf = async (relPath) => {
    const fs = await import('node:fs');
    return fs.readFileSync(relPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/(^|[^:])\/\/.*$/gm, '$1');  // line comments, sparing "http://"
  };

  it('the ledger-backed NFL tokens never reach CollegeFootballData', async () => {
    const code = await codeOf('src/services/agentic/tools/statRouters/footballAdvancedTokens.js');
    expect(code).not.toMatch(/cfbd/i);
    expect(code).not.toMatch(/ncaaf/i);
  });

  it('the NCAAF module never reaches nflverse, PFR charting or the NFL play ledger', async () => {
    const code = await codeOf('src/services/agentic/tools/statRouters/ncaafFetchers.js');
    expect(code).not.toMatch(/nflverse/i);
    expect(code).not.toMatch(/nflPlayLedger/i);
    expect(code).not.toMatch(/getPassRushAndCoverage|getQbPressureProfile/);
  });

  it('NCAAF owns its own trench lanes rather than borrowing the NFL ones', () => {
    expect(typeof ncaafFetchers.NCAAF_OL_RANKINGS).toBe('function');
    expect(typeof ncaafFetchers.NCAAF_DL_RANKINGS).toBe('function');
    for (const token of ['OL_RANKINGS', 'DL_RANKINGS', 'PRESSURE_RATE']) {
      const r = resolveTokenForSport(NCAAF, token);
      expect(r.owner).toBe('ncaaf');
      expect(r.allowed).toBe(true);
    }
  });
});
