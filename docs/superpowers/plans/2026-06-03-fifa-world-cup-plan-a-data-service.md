# FIFA World Cup — Plan A: Data Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `fifaWorldCupService.js` — the standalone data layer that fetches 2026 FIFA World Cup teams, matches, odds, standings, lineups, and per-match stats from the BALLDONTLIE FIFA API, plus the pure grading/normalization helpers every later plan depends on.

**Architecture:** A single isolated service module that reuses only `bdlCore.js`'s API-key resolution and array-aware query builder. Network methods are thin cached wrappers over one `fifaFetch` primitive (Authorization header + cursor pagination). All decision logic — 90′-regulation scoring, knockout advance resolution, team resolution, consensus-odds selection, pipeline normalization — lives in **pure, unit-tested functions** so nothing here depends on a live network to verify.

**Tech Stack:** Node 22 (global `fetch`), ES modules, Vitest 4 (`vi.stubGlobal` for fetch mocking). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-03-fifa-world-cup-sport-design.md` (Layer 1, plus the verified field semantics in §5.3 / Layer 8).

---

## File Structure

- **Create:** `gary2.0/src/services/fifaWorldCupService.js` — the entire data layer (one responsibility: talk to the FIFA API + expose pure soccer helpers).
- **Create:** `gary2.0/tests/services/fifaWorldCupService.test.js` — unit tests (mocked fetch + pure-function fixtures).

Both files are net-new and additive. No existing file is modified in Plan A — zero blast radius on the six live sports.

### Verified field semantics (from live 2022 shootout data — do not re-derive)

- `home_score` / `away_score` = **cumulative incl. extra time** (`first_half + second_half + extra_time`), **excluding** penalties.
- **90′ regulation** score = `first_half_* + second_half_*`.
- Penalties = `home_score_penalties` / `away_score_penalties`.
- Real cases used as fixtures: Japan 1-1 Croatia (pens 1-3), Croatia 1-1 Brazil (ET 1-1, pens 4-2), Netherlands 2-2 Argentina (pens 3-4).

### Final exported surface (function names are contract — keep consistent across tasks)

Pure: `getRegulationScore`, `getAdvanceResult`, `resolveTeam`, `selectConsensusOdds`, `filterMatchesByDate`, `formatMatchForPipeline`, `clearFifaCache`.
Network: `getTeams`, `getStadiums`, `getGroupStandings`, `getMatches`, `getMatchesForDate`, `getOdds`, `getFutures`, `getRosters`, `getPlayers`, `getMatchLineups`, `getMatchEvents`, `getTeamMatchStats`, `getPlayerMatchStats`, `getMatchShots`, `getMatchTeamForm`, `getMatchBestPlayers`.
Constants: `DEFAULT_SEASON`, `PREFERRED_VENDORS`.

---

## Task 1: Scaffold module + cache + `fifaFetch` primitive (with cursor pagination)

**Files:**
- Create: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Create `gary2.0/tests/services/fifaWorldCupService.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTeams,
  getMatches,
  clearFifaCache,
} from '../../src/services/fifaWorldCupService.js';

function mockFetchOnce(jsonBody) {
  return vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => jsonBody });
}

beforeEach(() => clearFifaCache());
afterEach(() => vi.unstubAllGlobals());

describe('fifaFetch via getTeams (single page)', () => {
  it('calls the FIFA teams endpoint with seasons[] and returns data[]', async () => {
    const fetchMock = mockFetchOnce({ data: [{ id: 1, name: 'Argentina' }] });
    vi.stubGlobal('fetch', fetchMock);

    const teams = await getTeams([2026]);

    expect(teams).toEqual([{ id: 1, name: 'Argentina' }]);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/fifa/worldcup/v1/teams');
    expect(calledUrl).toContain('seasons[]=2026');
    // Authorization header is passed
    expect(fetchMock.mock.calls[0][1]).toHaveProperty('headers.Authorization');
  });

  it('throws on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }));
    await expect(getTeams([2026])).rejects.toThrow(/FIFA API 401/);
  });
});

describe('fifaFetch cursor pagination via getMatches', () => {
  it('follows meta.next_cursor and accumulates every page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: 1 }], meta: { next_cursor: 1 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: 2 }], meta: { next_cursor: null } }) });
    vi.stubGlobal('fetch', fetchMock);

    const matches = await getMatches({ seasons: [2026] });

    expect(matches).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('cursor=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js`
Expected: FAIL — `Failed to resolve import "../../src/services/fifaWorldCupService.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `gary2.0/src/services/fifaWorldCupService.js`:

```js
/**
 * FIFA World Cup Service — 2026 (with 2018/2022 historical editions).
 *
 * BALLDONTLIE FIFA World Cup API: https://api.balldontlie.io/fifa/worldcup/v1
 * GOAT tier. Auth via existing BALLDONTLIE_API_KEY (Authorization header).
 * Seasons: 2018, 2022, 2026 (default 2026). Cursor-paginated list endpoints.
 *
 * Standalone by design — does NOT touch ballDontLieService.js shared core.
 * Reuses bdlCore only for API-key resolution + the array-aware query builder.
 */
import { API_KEY, BALLDONTLIE_API_BASE_URL, buildQuery } from './ballDontLie/bdlCore.js';

const FIFA_BASE = `${BALLDONTLIE_API_BASE_URL}/fifa/worldcup/v1`;
export const DEFAULT_SEASON = 2026;

// Sportsbooks in priority order for single-book consensus odds.
export const PREFERRED_VENDORS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'betrivers', 'fanatics'];

// TTLs by volatility.
const TTL_STATIC = 24 * 60 * 60 * 1000; // teams, stadiums
const TTL_SLOW = 30 * 60 * 1000;        // standings, rosters, form, futures
const TTL_FAST = 60 * 1000;             // matches, odds, lineups, live stats

const cache = new Map();
function getCached(key) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < e.ttl) return e.data;
  return null;
}
function setCache(key, data, ttl) {
  cache.set(key, { data, ts: Date.now(), ttl });
}
export function clearFifaCache() {
  cache.clear();
}

function n(v) {
  return typeof v === 'number' ? v : 0;
}

/**
 * Low-level FIFA API call. Adds the Authorization header, builds an array-aware
 * query string (seasons[]=, team_ids[]=), and—when paginate is true—follows
 * meta.next_cursor accumulating each page's data[]. Returns data[] (or the
 * accumulated array when paginating).
 */
async function fifaFetch(path, params = {}, { paginate = false } = {}) {
  let cursor = params.cursor;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const qs = buildQuery({ ...params, cursor });
    const url = `${FIFA_BASE}${path}${qs}`;
    const res = await fetch(url, { headers: { Authorization: API_KEY } });
    if (!res.ok) throw new Error(`FIFA API ${res.status}: ${path}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (!paginate) return rows;
    all.push(...rows);
    const next = json?.meta?.next_cursor;
    if (next == null || next === cursor || rows.length === 0) break;
    cursor = next;
  }
  return all;
}

export async function getTeams(seasons = [DEFAULT_SEASON]) {
  const key = `teams_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/teams', { seasons });
  setCache(key, data, TTL_STATIC);
  return data;
}

export async function getMatches({ seasons = [DEFAULT_SEASON], teamIds, matchIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (teamIds) params.team_ids = teamIds;
  if (matchIds) params.match_ids = matchIds;
  const key = `matches_${JSON.stringify(params)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/matches', params, { paginate: true });
  setCache(key, data, TTL_FAST);
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): scaffold fifaWorldCupService with paginated fifaFetch"
```

---

## Task 2: Pure helper `getRegulationScore` (90′ score, excludes ET)

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append to the test file:

```js
import { getRegulationScore } from '../../src/services/fifaWorldCupService.js';

describe('getRegulationScore (90 minutes, excludes extra time)', () => {
  it('sums first + second half for a group game', () => {
    const m = { first_half_home_score: 2, second_half_home_score: 1, first_half_away_score: 0, second_half_away_score: 1, has_extra_time: false, home_score: 3, away_score: 1 };
    expect(getRegulationScore(m)).toEqual({ home: 3, away: 1 });
  });

  it('ignores extra time in knockouts (Croatia 1-1 Brazil: ET 1-1, reg 0-0)', () => {
    const m = { first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 1, extra_time_away_score: 1, has_extra_time: true, home_score: 1, away_score: 1 };
    expect(getRegulationScore(m)).toEqual({ home: 0, away: 0 });
  });

  it('falls back to home_score/away_score when halves are missing and no extra time', () => {
    const m = { first_half_home_score: null, second_half_home_score: null, first_half_away_score: null, second_half_away_score: null, has_extra_time: false, home_score: 2, away_score: 0 };
    expect(getRegulationScore(m)).toEqual({ home: 2, away: 0 });
  });

  it('returns nulls for missing match', () => {
    expect(getRegulationScore(null)).toEqual({ home: null, away: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "getRegulationScore"`
Expected: FAIL — `getRegulationScore is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
/**
 * 90-minute regulation score = first half + second half (EXCLUDES extra time).
 * home_score/away_score include ET in knockouts, so never use them directly for
 * 90' settlement. Falls back to home_score/away_score only when half data is
 * absent AND no extra time was played (safe for not-yet-started/partial rows).
 */
export function getRegulationScore(match) {
  if (!match) return { home: null, away: null };
  const halvesMissing =
    match.first_half_home_score == null && match.second_half_home_score == null &&
    match.first_half_away_score == null && match.second_half_away_score == null;
  if (halvesMissing) {
    if (!match.has_extra_time && match.home_score != null) {
      return { home: n(match.home_score), away: n(match.away_score) };
    }
    return { home: null, away: null };
  }
  return {
    home: n(match.first_half_home_score) + n(match.second_half_home_score),
    away: n(match.first_half_away_score) + n(match.second_half_away_score),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "getRegulationScore"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): getRegulationScore (90' score, excludes extra time)"
```

---

## Task 3: Pure helper `getAdvanceResult` (knockout progression)

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append to the test file (fixtures use synthetic ids: home=10, away=20):

```js
import { getAdvanceResult } from '../../src/services/fifaWorldCupService.js';

describe('getAdvanceResult (who advances in a knockout)', () => {
  const teams = { home_team: { id: 10 }, away_team: { id: 20 } };

  it('regulation winner advances', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 1, second_half_home_score: 1, first_half_away_score: 0, second_half_away_score: 0, has_extra_time: false, home_score: 2, away_score: 0 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'regulation' });
  });

  it('extra-time winner advances (reg 0-0, ET 2-1)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 2, extra_time_away_score: 1, has_extra_time: true, home_score: 2, away_score: 1 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'extra_time' });
  });

  it('penalty winner advances (Croatia 1-1 Brazil, pens 4-2 → home)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 1, extra_time_away_score: 1, has_extra_time: true, home_score: 1, away_score: 1, has_penalty_shootout: true, home_score_penalties: 4, away_score_penalties: 2 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'penalties' });
  });

  it('penalty winner advances (Japan 1-1 Croatia, pens 1-3 → away)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 1, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 1, extra_time_home_score: 0, extra_time_away_score: 0, has_extra_time: true, home_score: 1, away_score: 1, has_penalty_shootout: true, home_score_penalties: 1, away_score_penalties: 3 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 20, method: 'penalties' });
  });

  it('returns null when not completed', () => {
    const m = { ...teams, status: 'scheduled' };
    expect(getAdvanceResult(m)).toBeNull();
  });

  it('returns null when teams are TBD', () => {
    const m = { status: 'completed', home_team: null, away_team: null, home_score: 1, away_score: 0 };
    expect(getAdvanceResult(m)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "getAdvanceResult"`
Expected: FAIL — `getAdvanceResult is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
/**
 * Determine the advancing team of a COMPLETED knockout match.
 * Order: 90' regulation → full-time incl. extra time (home_score/away_score) →
 * penalty shootout. Returns { teamId, method } or null if incomplete / still level.
 */
export function getAdvanceResult(match) {
  if (!match || match.status !== 'completed') return null;
  const homeId = match.home_team?.id ?? null;
  const awayId = match.away_team?.id ?? null;
  if (homeId == null || awayId == null) return null;

  const reg = getRegulationScore(match);
  if (reg.home != null && reg.home !== reg.away) {
    return { teamId: reg.home > reg.away ? homeId : awayId, method: 'regulation' };
  }
  const fh = n(match.home_score), fa = n(match.away_score); // incl. ET
  if (fh !== fa) {
    return { teamId: fh > fa ? homeId : awayId, method: 'extra_time' };
  }
  if (match.has_penalty_shootout) {
    const ph = n(match.home_score_penalties), pa = n(match.away_score_penalties);
    if (ph !== pa) return { teamId: ph > pa ? homeId : awayId, method: 'penalties' };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "getAdvanceResult"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): getAdvanceResult (regulation -> ET -> penalties)"
```

---

## Task 4: Pure helpers `resolveTeam` + `filterMatchesByDate`

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { resolveTeam, filterMatchesByDate } from '../../src/services/fifaWorldCupService.js';

describe('resolveTeam', () => {
  const teams = [
    { id: 1, name: 'Argentina', abbreviation: 'ARG', country_code: 'ARG' },
    { id: 8, name: 'Mexico', abbreviation: 'MEX', country_code: 'MEX' },
  ];
  it('matches by full name (case-insensitive)', () => {
    expect(resolveTeam('argentina', teams)).toEqual(teams[0]);
  });
  it('matches by abbreviation', () => {
    expect(resolveTeam('MEX', teams)).toEqual(teams[1]);
  });
  it('matches by partial name', () => {
    expect(resolveTeam('Mex', teams)).toEqual(teams[1]);
  });
  it('returns null for no match or bad input', () => {
    expect(resolveTeam('Brazil', teams)).toBeNull();
    expect(resolveTeam('', teams)).toBeNull();
    expect(resolveTeam('Argentina', null)).toBeNull();
  });
});

describe('filterMatchesByDate', () => {
  const matches = [
    { id: 1, datetime: '2026-06-11T19:00:00.000Z' },
    { id: 2, datetime: '2026-06-12T02:00:00.000Z' },
    { id: 3, datetime: '2026-06-12T19:00:00.000Z' },
  ];
  it('keeps only matches whose UTC date matches', () => {
    expect(filterMatchesByDate(matches, '2026-06-12').map(m => m.id)).toEqual([2, 3]);
  });
  it('returns [] for no matches or bad input', () => {
    expect(filterMatchesByDate(matches, '2026-07-01')).toEqual([]);
    expect(filterMatchesByDate(null, '2026-06-12')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "resolveTeam"`
Expected: FAIL — `resolveTeam is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
/**
 * Match a country name / abbreviation / ISO code to a team object.
 * Exact name/abbr/code first, then partial-name contains. Null on no match.
 */
export function resolveTeam(nameOrCode, teams) {
  if (!nameOrCode || !Array.isArray(teams)) return null;
  const q = String(nameOrCode).toLowerCase().trim();
  if (!q) return null;
  return teams.find(t =>
    (t.name || '').toLowerCase() === q ||
    (t.abbreviation || '').toLowerCase() === q ||
    (t.country_code || '').toLowerCase() === q
  ) || teams.find(t => (t.name || '').toLowerCase().includes(q)) || null;
}

/** Keep matches whose UTC calendar date equals dateStr (YYYY-MM-DD). */
export function filterMatchesByDate(matches, dateStr) {
  if (!Array.isArray(matches)) return [];
  return matches.filter(m => typeof m.datetime === 'string' && m.datetime.slice(0, 10) === dateStr);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "resolveTeam"` then `-t "filterMatchesByDate"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): resolveTeam + filterMatchesByDate pure helpers"
```

---

## Task 5: Pure helper `selectConsensusOdds`

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { selectConsensusOdds } from '../../src/services/fifaWorldCupService.js';

describe('selectConsensusOdds', () => {
  it('prefers the highest-priority available vendor (draftkings over fanduel)', () => {
    const rows = [
      { vendor: 'fanduel', moneyline_home_odds: 270, moneyline_draw_odds: 180, moneyline_away_odds: 130, spread_home_value: null, total_value: null },
      { vendor: 'draftkings', moneyline_home_odds: 260, moneyline_draw_odds: 175, moneyline_away_odds: 135, spread_home_value: null, total_value: null },
    ];
    const c = selectConsensusOdds(rows);
    expect(c.vendor).toBe('draftkings');
    expect(c.moneyline).toEqual({ home: 260, draw: 175, away: 135 });
    expect(c.spread).toBeNull();
    expect(c.total).toBeNull();
  });

  it('surfaces spread + total when present', () => {
    const rows = [{
      vendor: 'fanduel',
      moneyline_home_odds: -115, moneyline_draw_odds: 250, moneyline_away_odds: 320,
      spread_home_value: '-0.5', spread_home_odds: -110, spread_away_value: '+0.5', spread_away_odds: -110,
      total_value: '2.5', total_over_odds: -120, total_under_odds: 100,
    }];
    const c = selectConsensusOdds(rows);
    expect(c.spread).toEqual({ homeValue: '-0.5', homeOdds: -110, awayValue: '+0.5', awayOdds: -110 });
    expect(c.total).toEqual({ line: '2.5', over: -120, under: 100 });
  });

  it('falls back to the first row when no preferred vendor present', () => {
    const rows = [{ vendor: 'pinnacle', moneyline_home_odds: 100, moneyline_draw_odds: 200, moneyline_away_odds: 300, spread_home_value: null, total_value: null }];
    expect(selectConsensusOdds(rows).vendor).toBe('pinnacle');
  });

  it('returns null for empty input', () => {
    expect(selectConsensusOdds([])).toBeNull();
    expect(selectConsensusOdds(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "selectConsensusOdds"`
Expected: FAIL — `selectConsensusOdds is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
/**
 * Reduce a match's odds rows (one per vendor) to a single consensus quote,
 * preferring the highest-priority available sportsbook. Spread/total are only
 * surfaced when the book actually offers them (null otherwise).
 */
export function selectConsensusOdds(oddsRows, vendors = PREFERRED_VENDORS) {
  if (!Array.isArray(oddsRows) || oddsRows.length === 0) return null;
  let row = null;
  for (const v of vendors) {
    row = oddsRows.find(o => o.vendor === v);
    if (row) break;
  }
  if (!row) row = oddsRows[0];
  return {
    vendor: row.vendor,
    moneyline: {
      home: row.moneyline_home_odds ?? null,
      draw: row.moneyline_draw_odds ?? null,
      away: row.moneyline_away_odds ?? null,
    },
    spread: row.spread_home_value != null ? {
      homeValue: row.spread_home_value,
      homeOdds: row.spread_home_odds ?? null,
      awayValue: row.spread_away_value ?? null,
      awayOdds: row.spread_away_odds ?? null,
    } : null,
    total: row.total_value != null ? {
      line: row.total_value,
      over: row.total_over_odds ?? null,
      under: row.total_under_odds ?? null,
    } : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "selectConsensusOdds"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): selectConsensusOdds (preferred-book 3-way/spread/total)"
```

---

## Task 6: Remaining read wrappers + `getMatchesForDate`

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
import {
  getOdds,
  getMatchesForDate,
  getTeamMatchStats,
} from '../../src/services/fifaWorldCupService.js';

describe('getOdds (paginated)', () => {
  it('returns odds rows for the requested matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 1, match_id: 11, vendor: 'fanduel', moneyline_home_odds: 270 }], meta: { next_cursor: null } }),
    }));
    const odds = await getOdds({ seasons: [2026], matchIds: [11] });
    expect(odds).toHaveLength(1);
    expect(odds[0].match_id).toBe(11);
    expect(fetch.mock.calls[0][0]).toContain('match_ids[]=11');
  });
});

describe('getMatchesForDate', () => {
  it('fetches matches then filters to the given UTC date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [
        { id: 1, datetime: '2026-06-11T19:00:00.000Z' },
        { id: 2, datetime: '2026-06-12T02:00:00.000Z' },
      ], meta: { next_cursor: null } }),
    }));
    const games = await getMatchesForDate('2026-06-11', [2026]);
    expect(games.map(g => g.id)).toEqual([1]);
  });
});

describe('getTeamMatchStats (match-scoped)', () => {
  it('requests team_match_stats with match_ids[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [{ match_id: 1, team_id: 8, possession_pct: 60 }], meta: { next_cursor: null } }),
    }));
    const stats = await getTeamMatchStats([1]);
    expect(stats[0].possession_pct).toBe(60);
    expect(fetch.mock.calls[0][0]).toContain('/fifa/worldcup/v1/team_match_stats');
    expect(fetch.mock.calls[0][0]).toContain('match_ids[]=1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "getOdds"`
Expected: FAIL — `getOdds is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
export async function getStadiums(seasons = [DEFAULT_SEASON]) {
  const key = `stadiums_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/stadiums', { seasons });
  setCache(key, data, TTL_STATIC);
  return data;
}

export async function getGroupStandings(seasons = [DEFAULT_SEASON]) {
  const key = `standings_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/group_standings', { seasons });
  setCache(key, data, TTL_SLOW);
  return data;
}

export async function getOdds({ seasons = [DEFAULT_SEASON], matchIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (matchIds) params.match_ids = matchIds;
  const key = `odds_${JSON.stringify(params)}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/odds', params, { paginate: true });
  setCache(key, data, TTL_FAST);
  return data;
}

export async function getFutures(seasons = [DEFAULT_SEASON]) {
  const key = `futures_${seasons.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch('/odds/futures', { seasons }, { paginate: true });
  setCache(key, data, TTL_SLOW);
  return data;
}

export async function getRosters({ seasons = [DEFAULT_SEASON], teamIds } = {}) {
  const params = { seasons, per_page: 100 };
  if (teamIds) params.team_ids = teamIds;
  return fifaFetch('/rosters', params, { paginate: true });
}

export async function getPlayers({ search, seasons, teamIds } = {}) {
  const params = { per_page: 100 };
  if (search) params.search = search;
  if (seasons) params.seasons = seasons;
  if (teamIds) params.team_ids = teamIds;
  return fifaFetch('/players', params, { paginate: true });
}

export async function getMatchesForDate(dateStr, seasons = [DEFAULT_SEASON]) {
  const matches = await getMatches({ seasons });
  return filterMatchesByDate(matches, dateStr);
}

// Match-scoped stat endpoints share one helper.
async function matchScoped(path, matchIds, ttl = TTL_FAST) {
  const ids = Array.isArray(matchIds) ? matchIds : [matchIds];
  const key = `${path}_${ids.join(',')}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await fifaFetch(path, { match_ids: ids, per_page: 100 }, { paginate: true });
  setCache(key, data, ttl);
  return data;
}

export const getMatchLineups = (matchIds) => matchScoped('/match_lineups', matchIds);
export const getMatchEvents = (matchIds) => matchScoped('/match_events', matchIds);
export const getTeamMatchStats = (matchIds) => matchScoped('/team_match_stats', matchIds);
export const getPlayerMatchStats = (matchIds) => matchScoped('/player_match_stats', matchIds);
export const getMatchShots = (matchIds) => matchScoped('/match_shots', matchIds);
export const getMatchTeamForm = (matchIds) => matchScoped('/match_team_form', matchIds);
export const getMatchBestPlayers = (matchIds) => matchScoped('/match_best_players', matchIds);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js`
Expected: PASS (all tasks so far).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): odds/standings/rosters/players + match-scoped stat fetchers"
```

---

## Task 7: `formatMatchForPipeline` (normalize match → pipeline game shape)

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`
- Test: `gary2.0/tests/services/fifaWorldCupService.test.js`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { formatMatchForPipeline } from '../../src/services/fifaWorldCupService.js';

describe('formatMatchForPipeline', () => {
  const match = {
    id: 1, datetime: '2026-06-11T19:00:00.000Z', status: 'scheduled',
    stage: { name: 'Group Stage' }, group: { name: 'Group A' }, round_name: null,
    stadium: { name: 'Estadio Azteca' },
    home_team: { id: 1, name: 'Mexico', abbreviation: 'MEX' },
    away_team: { id: 2, name: 'South Africa', abbreviation: 'RSA' },
  };

  it('maps to the pipeline game shape with soccer fields embedded', () => {
    const consensus = { moneyline: { home: -115, draw: 250, away: 320 }, vendor: 'fanduel' };
    const g = formatMatchForPipeline(match, consensus);
    expect(g.id).toBe(1);
    expect(g.soccer_match_id).toBe(1);
    expect(g.home_team).toBe('Mexico');
    expect(g.away_team).toBe('South Africa');
    expect(g.home_team_data).toEqual({ id: 1, full_name: 'Mexico', abbreviation: 'MEX' });
    expect(g.commence_time).toBe('2026-06-11T19:00:00.000Z');
    expect(g.venue).toBe('Estadio Azteca');
    expect(g.soccer_competition).toBe('FIFA World Cup 2026');
    expect(g.soccer_stage).toBe('Group Stage');
    expect(g.soccer_group).toBe('Group A');
    expect(g.soccer_three_way_ml).toEqual({ home: -115, draw: 250, away: 320 });
  });

  it('handles TBD knockout teams (null home/away) without throwing', () => {
    const tbd = { ...match, home_team: null, away_team: null, group: null, stage: { name: 'Round of 32' }, round_name: 'Round of 32' };
    const g = formatMatchForPipeline(tbd, null);
    expect(g.home_team).toBeNull();
    expect(g.home_team_data).toBeNull();
    expect(g.soccer_three_way_ml).toBeNull();
    expect(g.soccer_round).toBe('Round of 32');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "formatMatchForPipeline"`
Expected: FAIL — `formatMatchForPipeline is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `fifaWorldCupService.js`:

```js
/**
 * Normalize a FIFA match (+ optional consensus odds) into the pipeline's game
 * shape (id/home_team/away_team/home_team_data/commence_time/status/venue),
 * with soccer-specific fields embedded for the storage layer (Plan B).
 */
export function formatMatchForPipeline(match, consensus = null) {
  const teamData = (t) => (t ? { id: t.id, full_name: t.name, abbreviation: t.abbreviation } : null);
  return {
    id: match.id,
    soccer_match_id: match.id,
    home_team: match.home_team?.name ?? null,
    away_team: match.away_team?.name ?? null,
    home_team_data: teamData(match.home_team),
    away_team_data: teamData(match.away_team),
    commence_time: match.datetime,
    start_time: match.datetime,
    status: match.status,
    venue: match.stadium?.name ?? null,
    soccer_competition: 'FIFA World Cup 2026',
    soccer_stage: match.stage?.name ?? null,
    soccer_round: match.round_name ?? null,
    soccer_group: match.group?.name ?? null,
    soccer_three_way_ml: consensus?.moneyline ?? null,
    description: `FIFA World Cup — ${match.stage?.name ?? ''}${match.group ? ` (${match.group.name})` : ''}`.trim(),
    _raw: match,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js -t "formatMatchForPipeline"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js gary2.0/tests/services/fifaWorldCupService.test.js
git commit -m "feat(wc): formatMatchForPipeline normalizer"
```

---

## Task 8: Default export + full suite green + live smoke check

**Files:**
- Modify: `gary2.0/src/services/fifaWorldCupService.js`

- [ ] **Step 1: Add the default export aggregate**

Append to the very end of `fifaWorldCupService.js`:

```js
export default {
  DEFAULT_SEASON,
  PREFERRED_VENDORS,
  clearFifaCache,
  getTeams,
  getStadiums,
  getGroupStandings,
  getMatches,
  getMatchesForDate,
  getOdds,
  getFutures,
  getRosters,
  getPlayers,
  getMatchLineups,
  getMatchEvents,
  getTeamMatchStats,
  getPlayerMatchStats,
  getMatchShots,
  getMatchTeamForm,
  getMatchBestPlayers,
  getRegulationScore,
  getAdvanceResult,
  resolveTeam,
  filterMatchesByDate,
  selectConsensusOdds,
  formatMatchForPipeline,
};
```

- [ ] **Step 2: Run the full unit suite**

Run: `cd gary2.0 && npx vitest run tests/services/fifaWorldCupService.test.js`
Expected: PASS — all describe blocks green (Tasks 1-7).

- [ ] **Step 3: Run a live smoke check against the real API (network)**

This confirms the wrappers work end-to-end against GOAT-tier data. Requires `BALLDONTLIE_API_KEY` in the environment.

Run:
```bash
cd gary2.0 && node --input-type=module -e "
import './src/loadEnv.js';
import wc from './src/services/fifaWorldCupService.js';
const today = new Date().toISOString().slice(0,10);
const teams = await wc.getTeams([2026]);
const odds = await wc.getOdds({ seasons:[2026] });
const consensus = wc.selectConsensusOdds(odds.filter(o => o.match_id === odds[0]?.match_id));
console.log('teams:', teams.length, '| odds rows:', odds.length, '| sample consensus:', JSON.stringify(consensus?.moneyline));
"
```
Expected: non-zero team count (48 nations), non-zero odds rows, and a sample consensus moneyline object with `home`/`draw`/`away`. If it prints `teams: 0` or throws `FIFA API 401`, the key lacks FIFA GOAT access — stop and resolve before later plans.

- [ ] **Step 4: Run the whole repo test suite (no regressions)**

Run: `cd gary2.0 && npx vitest run`
Expected: PASS — Plan A added only new tests; no existing suite changes.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/src/services/fifaWorldCupService.js
git commit -m "feat(wc): default export + finalize Plan A data service"
```

---

## Self-Review (completed)

- **Spec coverage:** Plan A implements spec Layer 1 (data service) plus the pure helpers Layers 6/8 import (`getRegulationScore`, `getAdvanceResult`) and the normalizer the pipeline/storage need. ✓
- **Placeholder scan:** No TBD/TODO; every code step shows full code; every test step shows full test + exact run command + expected result. ✓
- **Type/name consistency:** Function names match across tasks and the final default export (`getRegulationScore`, `getAdvanceResult`, `resolveTeam`, `filterMatchesByDate`, `selectConsensusOdds`, `formatMatchForPipeline`, all network wrappers). ✓
- **Verified semantics:** ET/penalty field behavior locked from real 2022 shootout data; regulation = halves sum. ✓

## Downstream (later plans, not this one)

- **Plan B** consumes `getMatchesForDate`, `getOdds` + `selectConsensusOdds`, `formatMatchForPipeline`, and the stat fetchers for scout/Flash/constitution/pass-builders/parser + `--wc` registration + pick storage.
- **Plan C** imports `getRegulationScore` + `getAdvanceResult` into `run-all-results.js` for 3-way/totals/handicap and `to_advance` grading.
- **Plan D** renders the stored soccer pick shape (3-way + Draw) in the iOS WC lane.
