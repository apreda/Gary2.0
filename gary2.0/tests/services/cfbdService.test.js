import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSpPlus, getFbsTeams, rowFor, fbsVenueFor, cfbdTeamMatches,
  cfbdRequestCount, _clearCfbdCache
} from '../../src/services/cfbdService.js';

/**
 * CFBD backs the five NCAAF factors BDL cannot: SP+, FPI, strength of
 * schedule, conference strength and quality of opposition — plus the venue
 * coordinates that make college weather possible at all.
 *
 * THE FREE TIER IS 1,000 REQUESTS PER CALENDAR MONTH. A single Saturday slate
 * would burn it if anything called per-game, so every endpoint returns the
 * whole league in one request and everything is cached. These tests assert
 * that budget discipline, not just correctness.
 */

const SP_ROWS = [
  { year: 2025, team: 'Ohio State', conference: 'Big Ten', rating: 30.1, ranking: 2, offense: { ranking: 13 }, defense: { ranking: 1 } },
  { year: 2025, team: 'Michigan', conference: 'Big Ten', rating: 12.4, ranking: 25, offense: { ranking: 48 }, defense: { ranking: 15 } },
  { year: 2025, team: 'Ohio', conference: 'MAC', rating: 1.0, ranking: 90, offense: { ranking: 88 }, defense: { ranking: 92 } }
];

const TEAM_ROWS = [
  { school: 'Ohio State', mascot: 'Buckeyes', location: { name: 'Ohio Stadium', latitude: 40.0016, longitude: -83.0197, elevation: '216.68', timezone: 'America/New_York', dome: false, grass: false } },
  { school: 'Ohio', mascot: 'Bobcats', location: { name: 'Peden Stadium', latitude: 39.32, longitude: -82.10, elevation: '200', timezone: 'America/New_York', dome: false, grass: false } },
  { school: 'Syracuse', mascot: 'Orange', location: { name: 'JMA Wireless Dome', latitude: 43.036, longitude: -76.136, elevation: '150', timezone: 'America/New_York', dome: true, grass: false } }
];

function fakeFetch(rowsByPath, counter = { n: 0 }) {
  return async (url) => {
    counter.n += 1;
    const path = url.replace('https://api.collegefootballdata.com', '');
    const entry = Object.entries(rowsByPath).find(([p]) => path.startsWith(p));
    if (!entry) return { status: 404, ok: false };
    const body = entry[1];
    if (typeof body === 'number') return { status: body, ok: false };
    return { status: 200, ok: true, json: async () => body };
  };
}

beforeEach(() => { _clearCfbdCache(); process.env.CFBD_API_KEY = 'test-key'; });
afterEach(() => { _clearCfbdCache(); });

describe('request budget', () => {
  it('serves the whole league from ONE request', async () => {
    const counter = { n: 0 };
    const fetchImpl = fakeFetch({ '/ratings/sp': SP_ROWS }, counter);
    const sp = await getSpPlus(2025, { fetchImpl });
    expect(sp.rows).toHaveLength(3);
    expect(counter.n).toBe(1);
  });

  it('caches, so repeated lookups cost nothing more', async () => {
    const counter = { n: 0 };
    const fetchImpl = fakeFetch({ '/ratings/sp': SP_ROWS }, counter);
    await getSpPlus(2025, { fetchImpl });
    await getSpPlus(2025, { fetchImpl });
    await getSpPlus(2025, { fetchImpl });
    expect(counter.n).toBe(1);
    expect(cfbdRequestCount()).toBe(1);
  });
});

describe('failures are stated, never empty', () => {
  it('says so when the key is missing — a 401 must not look like "no ratings"', async () => {
    delete process.env.CFBD_API_KEY;
    const r = await getSpPlus(2025, { fetchImpl: fakeFetch({ '/ratings/sp': SP_ROWS }) });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/CFBD_API_KEY is not set/);
    expect(r.rows).toBeUndefined();
  });

  it('names the monthly cap on a 429 rather than degrading quietly', async () => {
    const r = await getSpPlus(2025, { fetchImpl: fakeFetch({ '/ratings/sp': 429 }) });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/1,000 requests per calendar month/);
  });

  it('a failed fetch is not an empty result', async () => {
    const boom = async () => { throw new Error('network down'); };
    const r = await getSpPlus(2025, { fetchImpl: boom });
    expect(r.unavailable).toBe(true);
    expect(r.rows).toBeUndefined();
  });
});

describe('team matching refuses to guess', () => {
  it('joins BDL full names to CFBD schools', () => {
    expect(cfbdTeamMatches('Ohio State', 'Ohio State Buckeyes')).toBe(true);
    expect(cfbdTeamMatches('Michigan', 'Michigan Wolverines')).toBe(true);
  });

  it('does not let "Ohio" match "Ohio State"', () => {
    // The shared-prefix trap: two real, different FBS programs.
    expect(cfbdTeamMatches('Ohio State', 'Ohio Bobcats')).toBe(false);
  });

  it('picks the right row when both schools exist', async () => {
    const sp = await getSpPlus(2025, { fetchImpl: fakeFetch({ '/ratings/sp': SP_ROWS }) });
    expect(rowFor(sp, 'Ohio State Buckeyes').ranking).toBe(2);
    expect(rowFor(sp, 'Ohio Bobcats').ranking).toBe(90);
  });
});

describe('venue resolution — what makes college weather possible', () => {
  it('resolves coordinates, elevation and surface', async () => {
    const teams = await getFbsTeams(2025, { fetchImpl: fakeFetch({ '/teams/fbs': TEAM_ROWS }) });
    const v = fbsVenueFor(teams, 'Ohio State Buckeyes');
    expect(v.venue).toBe('Ohio Stadium');
    expect(v.lat).toBeCloseTo(40.0016, 3);
    expect(v.surface).toBe('turf');
  });

  it('marks a dome as a dome so no forecast is fetched for it', async () => {
    const teams = await getFbsTeams(2025, { fetchImpl: fakeFetch({ '/teams/fbs': TEAM_ROWS }) });
    expect(fbsVenueFor(teams, 'Syracuse Orange').roof).toBe('dome');
  });

  it('never asserts an open roof it cannot confirm', async () => {
    // CFBD publishes no retractable flag, so non-dome is reported as
    // open_or_unconfirmed rather than claimed to be open.
    const teams = await getFbsTeams(2025, { fetchImpl: fakeFetch({ '/teams/fbs': TEAM_ROWS }) });
    expect(fbsVenueFor(teams, 'Ohio State Buckeyes').roof).toBe('open_or_unconfirmed');
  });

  it('returns null for an unknown school rather than a stadium in the wrong state', async () => {
    const teams = await getFbsTeams(2025, { fetchImpl: fakeFetch({ '/teams/fbs': TEAM_ROWS }) });
    expect(fbsVenueFor(teams, 'Some FCS School')).toBeNull();
  });
});
