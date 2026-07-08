// Naked-aggregate fix (Jul 7 2026): getRecentTeamStats returned per-match
// averages (xG, shots, possession) with NO record of who the sample was
// compiled against — so the scout report's RECENT PERFORMANCE row handed Gary
// "2.03 xG/match" earned against group-stage minnows as a context-free fact.
// The fetcher has the fixtures in hand; it now returns sampleOpponents
// (result + opponent per sampled fixture) and the tape renders them inline.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.API_FOOTBALL_KEY ||= 'test-key';

const { getRecentTeamStats, clearApiFootballCache } = await import('../../src/services/apiFootballService.js');

const TEAM_ID = 990001; // number input skips name resolution; unique to dodge cache

function fixturesPayload() {
  return {
    response: [
      {
        fixture: { id: 11, status: { short: 'FT' } },
        teams: { home: { id: TEAM_ID, name: 'Testland' }, away: { id: 5, name: 'Oppo A' } },
        goals: { home: 2, away: 1 },
      },
      {
        fixture: { id: 12, status: { short: 'AET' } },
        teams: { home: { id: 6, name: 'Oppo B' }, away: { id: TEAM_ID, name: 'Testland' } },
        goals: { home: 3, away: 3 },
      },
      { fixture: { id: 13, status: { short: 'NS' } }, teams: {}, goals: {} }, // unplayed — excluded
    ],
  };
}

function statsPayload(fid) {
  return {
    response: [
      { team: { id: TEAM_ID }, statistics: [{ type: 'expected_goals', value: fid === 11 ? '2.0' : '1.0' }, { type: 'Total Shots', value: 12 }] },
      { team: { id: 999 }, statistics: [{ type: 'expected_goals', value: '0.5' }] },
    ],
  };
}

describe('getRecentTeamStats carries the sample opponents behind its averages', () => {
  beforeEach(() => {
    clearApiFootballCache();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/fixtures/statistics')) {
        const fid = Number(String(url).match(/fixture=(\d+)/)?.[1]);
        return { ok: true, json: async () => statsPayload(fid) };
      }
      if (String(url).includes('/fixtures')) {
        return { ok: true, json: async () => fixturesPayload() };
      }
      return { ok: true, json: async () => ({ response: [] }) };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns result + opponent per sampled fixture alongside the averages', async () => {
    const out = await getRecentTeamStats(TEAM_ID, 2);
    expect(out.xg).toBe(1.5);
    expect(out.sampleMatches).toBe(2);
    expect(out.sampleOpponents).toEqual(['W 2-1 v Oppo A', 'D 3-3 aet v Oppo B']);
  });
});
