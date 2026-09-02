/**
 * DESK COMPOSITION pins — rebuilt Aug 10 2026 against the live desk (three
 * shelves + team-first TONIGHT + world split + blind board law; the old
 * file pinned the pre-shelves July order and had been failing since).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({
  buildScoutReport: vi.fn(),
}));
vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getOddsV2: vi.fn(),
    getMlbStandings: vi.fn(),
    getMlbSeasonGameIndex: vi.fn().mockResolvedValue(new Map()),
  },
}));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({ fetchStats: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/orchestratorHelpers.js', () => ({ summarizeStatForContext: vi.fn() }));

import { buildScoutReport } from '../../../src/services/agentic/scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { fetchStats } from '../../../src/services/agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';
import { buildMlbDesk, deadlineLine } from '../../../src/services/pickdesk/mlbDesk.js';

const SCOUT_TEXT = `MATCHUP: Reds @ Cardinals

═══ PROBABLE PITCHERS ═══
pitchers here

═══ INJURIES (BDL Structured) ═══
injuries here

═══ CONFIRMED LINEUPS ═══
lineups here

═══ TODAY'S BREAKING NEWS ═══
fresh news here
— THE STORYLINES —
week narrative here`;

const STANDINGS = [
  { team: { display_name: 'St. Louis Cardinals' }, division_name: 'NL Central', division_short_name: 'NL Cent', wins: 53, losses: 51, streak: '-2', last_ten_games: '3-7', division_games_behind: 12 },
  { team: { display_name: 'Cincinnati Reds' }, division_name: 'NL Central', division_short_name: 'NL Cent', wins: 48, losses: 55, streak: '-1', last_ten_games: '5-5', division_games_behind: 16.5 },
  { team: { display_name: 'Milwaukee Brewers' }, division_name: 'NL Central', division_short_name: 'NL Cent', wins: 65, losses: 39, streak: '1', last_ten_games: '6-4', division_games_behind: 0 },
];

const ODDS = [
  { vendor: 'fanduel', moneyline_home_odds: -104, moneyline_away_odds: -112, spread_home_value: -1.5, spread_home_odds: 148, spread_away_value: 1.5, spread_away_odds: -178 },
  { vendor: 'draftkings', moneyline_home_odds: -105, moneyline_away_odds: -110, spread_home_value: -1.5, spread_home_odds: 150, spread_away_value: 1.5, spread_away_odds: -180 },
];

beforeEach(() => {
  vi.clearAllMocks();
  ballDontLieService.getMlbSeasonGameIndex.mockResolvedValue(new Map());
  buildScoutReport.mockResolvedValue({
    text: SCOUT_TEXT,
    verifiedTaleOfTape: { rows: [{ name: 'Record' }] },
    recentScores: { some: 'scores' },
  });
  ballDontLieService.getOddsV2.mockResolvedValue(ODDS);
  ballDontLieService.getMlbStandings.mockResolvedValue(STANDINGS);
  fetchStats.mockResolvedValue({ homeValue: 'x', awayValue: 'y' });
  summarizeStatForContext.mockReturnValue('MATCHUP DATA LINES LONG ENOUGH TO PASS THE FLOOR');
});

describe('buildMlbDesk — the three shelves, blind', () => {
  const game = { homeTeam: 'Cardinals', awayTeam: 'Reds', bdl_game_id: 99 };

  it('the blind desk carries no board; the stored deskText leads with ONE standard book', async () => {
    const { deskText, deskTextBlind, meta, runLineGame } = await buildMlbDesk(game);
    expect(runLineGame).toBe(false);
    expect(deskTextBlind).not.toContain('═══ THE LINES');
    expect(deskText.indexOf('═══ THE LINES (DraftKings) ═══')).toBe(0);
    expect(deskText).toContain('Reds ML -110 | Cardinals ML -105');
    expect(meta.moneylineHome).toBe(-105);
  });

  it('asks the scout for the LEGACY grammar its shelves are cut from (the game lane defaults to buckets since Sep 2)', async () => {
    await buildMlbDesk(game);
    expect(buildScoutReport).toHaveBeenCalledWith(game, 'baseball_mlb', expect.objectContaining({ deskLayout: 'legacy', keepSeasonBlocks: true }));
  });

  it('shelf order (founder GO, Aug 13 — the anchoring lever): THE CLUBS → THE MATCHUP → THE PITCHING → THE WEEK; no arm appears before both clubs and the matchup are read', async () => {
    const { deskTextBlind } = await buildMlbDesk(game);
    const clubs = deskTextBlind.indexOf('THE CLUBS ━');
    const matchup = deskTextBlind.indexOf('THE MATCHUP ━');
    const pitching = deskTextBlind.indexOf('THE PITCHING ━');
    const week = deskTextBlind.indexOf('THE WEEK ━');
    expect(clubs).toBeGreaterThan(-1);
    expect(matchup).toBeGreaterThan(clubs);
    expect(pitching).toBeGreaterThan(matchup);
    expect(week).toBeGreaterThan(pitching);
    const lineups = deskTextBlind.indexOf('═══ CONFIRMED LINEUPS ═══');
    const starters = deskTextBlind.indexOf('═══ PROBABLE PITCHERS ═══');
    const pen = deskTextBlind.indexOf('═══ THE PEN — every arm, newest work first ═══');
    expect(lineups).toBeGreaterThan(clubs);
    expect(lineups).toBeLessThan(matchup);
    expect(starters).toBeGreaterThan(pitching);
    expect(pen).toBeGreaterThan(starters); // the whole 9, unified and late
  });

  it('the world split: breaking news pins to the top of THE CLUBS; the storylines stay in THE WEEK', async () => {
    const { deskTextBlind } = await buildMlbDesk(game);
    const news = deskTextBlind.indexOf(`═══ TODAY'S BREAKING NEWS ═══\nfresh news here`);
    const matchup = deskTextBlind.indexOf('THE MATCHUP ━');
    const stories = deskTextBlind.indexOf('═══ THE WORLD — STORYLINES ═══');
    expect(news).toBeGreaterThan(-1);
    expect(news).toBeLessThan(matchup);
    expect(stories).toBeGreaterThan(matchup);
    expect(deskTextBlind.slice(stories)).toContain('week narrative here');
  });

  it('THE STAKES carry record, streak, L10, the division clause, and the deadline — nothing else', async () => {
    const { deskTextBlind } = await buildMlbDesk(game);
    expect(deskTextBlind).toContain('Cardinals: 53-51, streak -2, L10 3-7, 2nd NL Cent (−12)');
    expect(deskTextBlind).toContain('Reds: 48-55, streak -1, L10 5-5, 3rd NL Cent (−16.5)');
    expect(deskTextBlind).toContain(deadlineLine());
    expect(deskTextBlind).not.toMatch(/seed|one-run record/i);
  });

  it('the matchup lab layers reach the desk ahead of the lineups', async () => {
    const { deskTextBlind } = await buildMlbDesk(game);
    const lab = deskTextBlind.indexOf('═══ SP PITCH TYPES');
    expect(lab).toBeGreaterThan(-1);
  });
});
