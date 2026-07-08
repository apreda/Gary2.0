// WC injury-timing port (Jul 7 2026, founder-approved — NBA semantics).
//
// The WC report had NO structured availability: injuries reached Gary as
// grounded news prose with no freshness anchor, so every known absence read
// as "tonight's edge" (Jul 7 Argentina card: "sudden and severe defensive
// crisis" about absences the line had priced for days). Port of the NBA
// system's core: compute participation from real lineups — FRESH means the
// player STARTED the team's most recent match and is flagged now (the market
// may still be settling); PRICED IN means he already missed it (every book
// set tonight's line knowing).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.API_FOOTBALL_KEY ||= 'test-key';

const { getAvailabilityTiming, clearApiFootballCache } = await import('../../src/services/apiFootballService.js');

const TEAM_ID = 880001;

const fixturesPayload = {
  response: [
    { fixture: { id: 21, status: { short: 'FT' } }, teams: { home: { id: TEAM_ID, name: 'Testland' }, away: { id: 7, name: 'Oppo A' } }, goals: { home: 1, away: 0 } },
    { fixture: { id: 20, status: { short: 'FT' } }, teams: { home: { id: 8, name: 'Oppo B' }, away: { id: TEAM_ID, name: 'Testland' } }, goals: { home: 2, away: 2 } },
  ],
};

const lineups = {
  21: { response: [{ team: { id: TEAM_ID }, startXI: [{ player: { name: 'Fresh Fullback' } }, { player: { name: 'Ever Present' } }] }] },
  20: { response: [{ team: { id: TEAM_ID }, startXI: [{ player: { name: 'Fresh Fullback' } }, { player: { name: 'Stale Striker' } }, { player: { name: 'Ever Present' } }] }] },
};

const injuriesPayload = {
  response: [
    { player: { name: 'Fresh Fullback', reason: 'Hamstring', type: 'Missing Fixture' } },
    { player: { name: 'Stale Striker', reason: 'Knee', type: 'Missing Fixture' } },
  ],
};

describe('getAvailabilityTiming tags absences by real lineup participation', () => {
  beforeEach(() => {
    clearApiFootballCache();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/fixtures/lineups')) {
        const fid = Number(u.match(/fixture=(\d+)/)?.[1]);
        return { ok: true, json: async () => (lineups[fid] || { response: [] }) };
      }
      if (u.includes('/injuries')) return { ok: true, json: async () => injuriesPayload };
      if (u.includes('/fixtures')) return { ok: true, json: async () => fixturesPayload };
      return { ok: true, json: async () => ({ response: [] }) };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('FRESH when the player started the most recent match; PRICED IN when he already missed it', async () => {
    const out = await getAvailabilityTiming(TEAM_ID, 2);
    const fresh = out.find(x => x.player === 'Fresh Fullback');
    const stale = out.find(x => x.player === 'Stale Striker');
    expect(fresh.tag).toBe('FRESH');
    expect(fresh.missedOfLastN).toBe(0);
    expect(stale.tag).toBe('PRICED IN');
    expect(stale.missedOfLastN).toBe(1);
    expect(stale.reason).toBe('Knee');
  });
});
