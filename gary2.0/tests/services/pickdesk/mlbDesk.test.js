import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({
  buildScoutReport: vi.fn(),
}));
vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getOddsV2: vi.fn(),
    getMlbStandings: vi.fn(),
    // One-run records compute from the season game index (Jul 30); an empty
    // index = no one-run bit on the stakes lines, never an error.
    getMlbSeasonGameIndex: vi.fn().mockResolvedValue(new Map()),
  },
}));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({ fetchStats: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/orchestratorHelpers.js', () => ({ summarizeStatForContext: vi.fn() }));

import { buildScoutReport } from '../../../src/services/agentic/scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { fetchStats } from '../../../src/services/agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';
import { buildMlbDesk, stakesLine, deadlineLine, morningBoardLine } from '../../../src/services/pickdesk/mlbDesk.js';

const SCOUT_TEXT = `MATCHUP: Reds @ Cardinals

═══ PROBABLE PITCHERS ═══
pitchers here

═══ INJURIES (BDL Structured) ═══
injuries here

═══ CONFIRMED LINEUPS ═══
lineups here

═══ TODAY'S BREAKING NEWS ═══
fresh news here`;

const STANDINGS = [
  { team: { display_name: 'St. Louis Cardinals' }, division_name: 'NL Central', wins: 53, losses: 51, playoff_seed: 7, streak: '-2', last_ten_games: '3-7', division_games_behind: 12 },
  { team: { display_name: 'Cincinnati Reds' }, division_name: 'NL Central', wins: 48, losses: 55, playoff_seed: 12, streak: '-1', last_ten_games: '5-5', division_games_behind: 16.5 },
  { team: { display_name: 'Milwaukee Brewers' }, division_name: 'NL Central', wins: 65, losses: 39, playoff_seed: 2, streak: '1', last_ten_games: '6-4', division_games_behind: 0 },
];

const ODDS = [
  { vendor: 'fanduel', moneyline_home_odds: -104, moneyline_away_odds: -112, spread_home_value: -1.5, spread_home_odds: 148, spread_away_value: 1.5, spread_away_odds: -178 },
  { vendor: 'draftkings', moneyline_home_odds: -105, moneyline_away_odds: -110, spread_home_value: -1.5, spread_home_odds: 150, spread_away_value: 1.5, spread_away_odds: -180 },
];

beforeEach(() => {
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

describe('buildMlbDesk', () => {
  const game = { homeTeam: 'Cardinals', awayTeam: 'Reds', bdl_game_id: 99 };

  it('orders the desk BOARD → STAKES → WORLD → shelf', async () => {
    const { deskText } = await buildMlbDesk(game);
    const board = deskText.indexOf('═══ THE LINES');
    const stakes = deskText.indexOf('═══ THE STAKES ═══');
    const world = deskText.indexOf('═══ THE WORLD ═══');
    const shelf = deskText.indexOf('═══ PROBABLE PITCHERS ═══');
    expect(board).toBe(0);
    expect(stakes).toBeGreaterThan(board);
    expect(world).toBeGreaterThan(stakes);
    expect(shelf).toBeGreaterThan(world);
  });

  it('the lines are ONE standard book — DraftKings preferred, four options, no board', async () => {
    const { deskText, meta } = await buildMlbDesk(game);
    expect(deskText).toContain('═══ THE LINES (DraftKings) ═══');
    expect(deskText).toContain('Reds ML -110 | Cardinals ML -105');
    expect(deskText).toContain('Reds +1.5 (-180) | Cardinals -1.5 (+150)');
    expect(deskText).not.toContain('fanduel:');
    expect(deskText).not.toContain('Bet mechanics');
    expect(meta).toMatchObject({ book: 'draftkings', moneylineHome: -105, moneylineAway: -110, spreadHomeOdds: 150, spreadAwayOdds: -180 });
  });

  it('falls back down the book preference when DraftKings is missing', async () => {
    ballDontLieService.getOddsV2.mockResolvedValue([
      { vendor: 'betrivers', moneyline_home_odds: -108, moneyline_away_odds: -102 },
      { vendor: 'fanduel', moneyline_home_odds: -104, moneyline_away_odds: -112 },
    ]);
    const { deskText, meta } = await buildMlbDesk(game);
    expect(deskText).toContain('═══ THE LINES (FanDuel) ═══');
    expect(meta.book).toBe('fanduel');
  });

  it('stakes carry record, division position, GB, seed, streak, and the deadline', async () => {
    const { deskText } = await buildMlbDesk(game);
    expect(deskText).toContain('Cardinals: 53-51, 2nd in the NL Central, 12 GB, playoff seed 7, streak -2, L10 3-7');
    expect(deskText).toContain('Reds: 48-55, 3rd in the NL Central, 16.5 GB, playoff seed 12');
    // Phase-agnostic (Jul 31: the old exact pin broke ON deadline day when
    // the line correctly read "TODAY (July 31)"). The three phase forms are
    // pinned explicitly in the deadlineLine() test below.
    expect(deskText).toMatch(/Trade deadline: (July 31|TODAY \(July 31\)|passed \(July 31\))/);
  });

  it('moves the news into THE WORLD and out of the shelf tail', async () => {
    const { deskText } = await buildMlbDesk(game);
    const world = deskText.indexOf('fresh news here');
    const shelf = deskText.indexOf('═══ PROBABLE PITCHERS ═══');
    expect(world).toBeGreaterThan(-1);
    expect(world).toBeLessThan(shelf);
    expect(deskText).not.toContain(`═══ TODAY'S BREAKING NEWS ═══`);
  });

  it('inserts the injury tag legend under the injuries header', async () => {
    const { deskText } = await buildMlbDesk(game);
    const header = deskText.indexOf('═══ INJURIES (BDL Structured) ═══');
    const legend = deskText.indexOf('Tags: [NEW]');
    const body = deskText.indexOf('injuries here');
    expect(legend).toBeGreaterThan(header);
    expect(legend).toBeLessThan(body);
  });

  it('returns tape rows, recentScores, and consensus meta for the chassis', async () => {
    const out = await buildMlbDesk(game);
    expect(out.tapeRows).toHaveLength(1);
    expect(out.recentScores).toEqual({ some: 'scores' });
    expect(out.meta).toMatchObject({
      homeTeam: 'Cardinals', awayTeam: 'Reds', book: 'draftkings',
      moneylineHome: -105, moneylineAway: -110,
      spreadHome: -1.5, spreadHomeOdds: 150, spreadAway: 1.5, spreadAwayOdds: -180,
    });
  });
});

describe('buildMlbDesk matchup lab', () => {
  const game = { homeTeam: 'Cardinals', awayTeam: 'Reds', bdl_game_id: 99 };

  it('adds the four tool-lane layers as desk sections ahead of the lineups', async () => {
    const { deskText } = await buildMlbDesk(game);
    const lab = deskText.indexOf('═══ SP PITCH TYPES');
    const lineups = deskText.indexOf('═══ CONFIRMED LINEUPS ═══');
    expect(lab).toBeGreaterThan(-1);
    expect(lab).toBeLessThan(lineups);
    expect(deskText).toContain('═══ HITTERS vs PITCH TYPES ═══');
    expect(deskText).toContain("═══ BATTER vs PITCHER — career vs tonight's starters ═══");
    expect(deskText).toContain('═══ HITTER L/R SPLITS ═══');
  });

  it('a failed fetcher drops its section silently, never the desk', async () => {
    fetchStats.mockResolvedValue({ error: 'nope' });
    const { deskText } = await buildMlbDesk(game);
    expect(deskText).not.toContain('═══ SP PITCH TYPES');
    expect(deskText).toContain('═══ CONFIRMED LINEUPS ═══');
  });
});

describe('morningBoardLine (founder GO Jul 31 — open→now on THE LINES)', () => {
  it('renders MLs, home spread, total, and the ET as-of time — facts only, no lean language', () => {
    const line = morningBoardLine({
      ml_away: 142, ml_home: -168, spread: -1.5, total: 9,
      created_at: '2026-07-31T09:34:00Z',
    }, 'Dodgers', 'Mariners');
    expect(line).toBe("This morning's board (5:34 AM ET): Mariners ML +142 | Dodgers ML -168 · Dodgers -1.5 · Total 9");
    expect(line).not.toMatch(/steam|sharp|trap|lean|value/i);
  });

  it('omits missing pieces and returns empty for a null/bare row', () => {
    expect(morningBoardLine(null, 'A', 'B')).toBe('');
    expect(morningBoardLine({ created_at: '2026-07-31T09:34:00Z' }, 'A', 'B')).toBe('');
    const noSpread = morningBoardLine({ ml_away: 100, ml_home: -120, total: 8.5 }, 'Homers', 'Aways');
    expect(noSpread).toContain('Aways ML +100 | Homers ML -120 · Total 8.5');
    expect(noSpread).not.toContain('·  ·');
  });
});

describe('deadlineLine', () => {
  it('counts days to July 31 from an ET date', () => {
    expect(deadlineLine('2026-07-26')).toBe('Trade deadline: July 31 (5 days away).');
    expect(deadlineLine('2026-07-31')).toBe('Trade deadline: TODAY (July 31).');
    expect(deadlineLine('2026-08-02')).toBe('Trade deadline: passed (July 31).');
  });
});

describe('stakesLine', () => {
  it('handles a team missing from standings', () => {
    expect(stakesLine([], 'Cardinals')).toBe('Cardinals: standings unavailable.');
  });
});

describe('sanitizeBoardRows', () => {
  it('drops a frozen/glitch moneyline row and keeps honest books', async () => {
    const { sanitizeBoardRows } = await import('../../../src/services/pickdesk/mlbDesk.js');
    const rows = [
      { vendor: 'fanduel', moneyline_home_odds: -104, moneyline_away_odds: -112 },
      { vendor: 'draftkings', moneyline_home_odds: -105, moneyline_away_odds: -110 },
      { vendor: 'betmgm', moneyline_home_odds: -102, moneyline_away_odds: -115 },
      { vendor: 'frozen', moneyline_home_odds: -20000, moneyline_away_odds: 5000 },
    ];
    const out = sanitizeBoardRows(rows);
    expect(out.map(r => r.vendor)).toEqual(['fanduel', 'draftkings', 'betmgm']);
  });

  it('keeps run-line-only rows and tolerates normal book-to-book spread', async () => {
    const { sanitizeBoardRows } = await import('../../../src/services/pickdesk/mlbDesk.js');
    const rows = [
      { vendor: 'a', moneyline_home_odds: -130, moneyline_away_odds: 110 },
      { vendor: 'b', moneyline_home_odds: -138, moneyline_away_odds: 116 },
      { vendor: 'c', spread_home_value: -1.5, spread_home_odds: 150 },
    ];
    expect(sanitizeBoardRows(rows)).toHaveLength(3);
  });
});
