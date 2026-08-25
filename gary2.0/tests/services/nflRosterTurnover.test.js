import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRosterTurnover, _clearNflverseCache } from '../../src/services/nflverseService.js';

/**
 * WHAT LAST SEASON'S NUMBERS NO LONGER DESCRIBE.
 *
 * On Sep 9 2026 there is no 2026 play-by-play, so every situational split is
 * computed from 2025 and labelled as 2025. That label alone is not enough: it
 * says the roster MAY have changed without saying what, leaving the desk
 * unable to judge how much of last year's profile still applies.
 *
 * Measured on the real files: Detroit's 2025 and 2026 rosters differ by 55
 * players, and twenty of them took 30% or more of a game's snaps — including
 * the entire starting offensive line. Any 2025 Detroit short-yardage or
 * pressure-allowed rate describes a unit that will not take the field.
 *
 * The trap guarded below: nflverse's roster release TAG is "rosters" but the
 * files are named roster_YYYY.csv. Deriving the tag from the filename 404s,
 * and loadRelease reports a 404 as "the season has not started" — a wrong,
 * entirely believable message that would have made this lane silently empty
 * on exactly the weekend it exists for.
 */

const ROSTER_HEADER = 'season,team,position,depth_chart_position,jersey_number,status,full_name,gsis_id,years_exp';
const SNAP_HEADER = 'game_id,season,week,player,team,position,offense_snaps,offense_pct,defense_snaps,defense_pct';

const ROSTER_2025 = [
  ROSTER_HEADER,
  '2025,DET,T,T,68,ACT,Taylor Decker,00-0032triple,10',
  '2025,DET,WR,WR,11,ACT,Kalif Raymond,00-0033kali,8',
  '2025,DET,QB,QB,16,ACT,Jared Goff,00-0033goff,10',
  '2025,DET,WR,WR,88,ACT,Camp Body,00-0039camp,0',
  '2025,DET,DL,DL,99,DEV,No Id Player,,1'
].join('\n');

const ROSTER_2026 = [
  ROSTER_HEADER,
  '2026,DET,QB,QB,16,ACT,Jared Goff,00-0033goff,11',
  '2026,DET,QB,QB,5,ACT,Teddy Bridgewater,00-0031tedd,12',
  '2026,DET,WR,WR,17,ACT,Rookie Guy,00-0040rook,0'
].join('\n');

const SNAPS_2025 = [
  SNAP_HEADER,
  '2025_01_DET_X,2025,1,Taylor Decker,DET,T,70,1.0,0,0',
  '2025_01_DET_X,2025,1,Kalif Raymond,DET,WR,30,0.42,0,0',
  '2025_01_DET_X,2025,1,Jared Goff,DET,QB,70,1.0,0,0',
  '2025_01_DET_X,2025,1,Camp Body,DET,WR,4,0.05,0,0'
].join('\n');

function fakeFetch(byFile) {
  return async (url) => {
    for (const [name, body] of Object.entries(byFile)) {
      if (url.includes(name)) {
        if (typeof body === 'number') return { ok: false, status: body };
        return { ok: true, status: 200, text: async () => body };
      }
    }
    return { ok: false, status: 404 };
  };
}

const ALL = {
  'rosters/roster_2025.csv': ROSTER_2025,
  'rosters/roster_2026.csv': ROSTER_2026,
  'snap_counts/snap_counts_2025.csv': SNAPS_2025
};

beforeEach(() => _clearNflverseCache());
afterEach(() => _clearNflverseCache());

describe('the release tag is not the filename', () => {
  it('requests rosters/ (plural) for roster_YYYY.csv (singular)', async () => {
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      return fakeFetch(ALL)(url);
    };
    await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl });
    expect(seen.some((u) => u.includes('/rosters/roster_2025.csv'))).toBe(true);
    // The wrong URL would 404, and a 404 reads as "season not started".
    expect(seen.some((u) => u.includes('/roster/roster_2025.csv'))).toBe(false);
  });
});

describe('departures are weighted by who actually played', () => {
  it('names a departed starter and counts but does not name a camp body', async () => {
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    const named = r.departed_significant.map((p) => p.player);

    expect(named).toContain('Taylor Decker');      // 100% of snaps
    expect(named).toContain('Kalif Raymond');      // 42% of snaps
    expect(named).not.toContain('Camp Body');      // 5% of snaps
    // The total still reflects everyone who left, so nothing is hidden.
    expect(r.departed_total).toBeGreaterThan(r.departed_significant.length);
  });

  it('ranks departures by snap share, biggest loss first', async () => {
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.departed_significant[0].player).toBe('Taylor Decker');
  });

  it('does not report a retained player as departed', async () => {
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.departed_significant.map((p) => p.player)).not.toContain('Jared Goff');
  });

  it('never matches players by name across seasons', async () => {
    // A row with no gsis_id cannot be matched, and guessing by name would
    // silently merge two different people. It is counted, not reported.
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.departed_significant.map((p) => p.player)).not.toContain('No Id Player');
    expect(r.unmatched_prior_rows).toBe(1);
  });

  it('ranks arrivals by experience, so a signed veteran leads a rookie', async () => {
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.arrived_notable[0].player).toBe('Teddy Bridgewater');
  });

  it('states what the departures mean for last season rates', async () => {
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.note).toMatch(/no longer on the roster/);
    expect(r.note).toMatch(/describes a unit that included them/);
  });

  it('says so plainly when continuity is intact rather than implying churn', async () => {
    const same = { ...ALL, 'rosters/roster_2026.csv': ROSTER_2025.replace(/2025,DET/g, '2026,DET') };
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(same) });
    expect(r.departed_significant).toEqual([]);
    expect(r.note).toMatch(/substantially the same personnel/);
  });
});

describe('missing inputs are stated, never silently empty', () => {
  it('a missing snap file leaves departures unranked and SAYS they are unranked', async () => {
    const noSnaps = { ...ALL, 'snap_counts/snap_counts_2025.csv': 404 };
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(noSnaps) });
    // Losing the weighting must not turn a real departure list into nothing.
    expect(r.departed_significant.length).toBeGreaterThan(0);
    expect(r.snap_note).toMatch(/could not be weighted by playing time/);
  });

  it('a missing roster season is reported as unpublished', async () => {
    const missing = { ...ALL, 'rosters/roster_2026.csv': 404 };
    const r = await getRosterTurnover('Detroit Lions', 2025, 2026, { fetchImpl: fakeFetch(missing) });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/roster_2026\.csv/);
  });

  it('an unknown team is named rather than returning an empty roster', async () => {
    const r = await getRosterTurnover('Some Fake Team', 2025, 2026, { fetchImpl: fakeFetch(ALL) });
    expect(r.unavailable).toBe(true);
    expect(r.reason).toMatch(/No nflverse team code/);
  });
});
