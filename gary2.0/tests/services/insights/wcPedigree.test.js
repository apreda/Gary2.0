// Jul 12 2026 — founder flag from the Hub (sim screenshot): the WC lead read
// "ARGENTINA WON THE 2022 WORLD CUP" under a STREAK badge with W6 — past-edition
// trivia wearing a live-streak costume, five weeks INTO the tournament. His
// logic, encoded here:
//   1. "for WC it's a tournament so every team still in it is on a win streak"
//      → once the CURRENT edition has any completed match, the pedigree lane is
//      SILENT (past-edition streaks are stale trivia mid-tournament; current
//      ones are survivorship). It returns for the next edition's preview phase.
//   2. Even in preview phase, the headline states the DATA (the streak); a won
//      title is context in the detail line, never the headline.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFutures: vi.fn(),
  getMatches: vi.fn(),
}));

// Mock ONLY the network fetchers; the lane also uses the service's pure
// helpers (getRegulationScore, getAdvanceResult) — keep those real.
vi.mock('../../../src/services/fifaWorldCupService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, getFutures: mocks.getFutures, getMatches: mocks.getMatches },
  };
});

import { computeWcPedigree } from '../../../src/services/insights/computers/wcPedigree.js';

// One 2026 fixture so contenders can tag to a real upcoming game.
const FIXTURE = {
  id: 900, datetime: '2026-07-19T19:00:00Z', status: 'scheduled',
  season: { year: 2026 },
  home_team: { id: 37, name: 'Argentina' },
  away_team: { id: 50, name: 'France' },
};

// Argentina's 2022 title run, newest-first when sorted by datetime desc:
// six straight knockout/group wins after two opening losses in the window.
const pastMatch = (i, win) => ({
  id: 100 + i, status: 'completed', datetime: `2022-12-${18 - i}T18:00:00Z`,
  season: { year: 2022 },
  home_team: { id: 37, name: 'Argentina' }, away_team: { id: 60 + i, name: `Opp${i}` },
  home_score: win ? 2 : 0, away_score: win ? 0 : 1,
  home_score_90: win ? 2 : 0, away_score_90: win ? 0 : 1,
  round_name: i === 0 ? 'Final' : 'Group',
});
const PAST = [0, 1, 2, 3, 4, 5].map((i) => pastMatch(i, true))
  .concat([6, 7].map((i) => pastMatch(i, false)));

const FUTURES = [{
  market_type: 'outright', market_name: 'World Cup Winner',
  subject: { id: 2065, name: 'Argentina' }, american_odds: -120,
}];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFutures.mockResolvedValue(FUTURES);
  mocks.getMatches.mockImplementation(async ({ seasons = [] } = {}) => {
    if (seasons.includes(2026)) return mocks.__current ?? [];
    return PAST;
  });
});

describe('wcPedigree goes silent once the current edition is underway', () => {
  it('emits nothing when a completed current-edition match exists', async () => {
    mocks.__current = [{ id: 1, status: 'completed', season: { year: 2026 } }];
    const rows = await computeWcPedigree({ games: [FIXTURE] });
    expect(rows).toEqual([]);
  });

  it('still emits in the preview phase (no completed current-edition matches)', async () => {
    mocks.__current = [{ id: 1, status: 'scheduled', season: { year: 2026 } }];
    const rows = await computeWcPedigree({ games: [FIXTURE] });
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('generator: WC preview mode never tags to completed fixtures', () => {
  it('the preview branch filters the fixture pool to upcoming games', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../../../src/services/insights/generateInsightConnections.js', import.meta.url), 'utf8');
    // The stale-lead bug: games = all (full list incl. completed) — pinned out.
    expect(src).not.toMatch(/games = all;/);
    expect(src).toMatch(/!== 'completed'/);
  });
});

describe('preview-phase headlines state the streak, never the trivia', () => {
  it('a defending champion leads with the streak; the title lives in the detail', async () => {
    mocks.__current = [];
    const rows = await computeWcPedigree({ games: [FIXTURE] });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row.headline).not.toMatch(/won the \d{4} World Cup/i);
    expect(row.headline).toMatch(/unbeaten in their last \d+ World Cup matches/i);
    expect(row.detail).toMatch(/Defending champions/i);
  });
});
