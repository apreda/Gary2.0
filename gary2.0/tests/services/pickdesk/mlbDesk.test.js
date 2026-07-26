import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js', () => ({
  buildScoutReport: vi.fn(),
}));
vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: { getOddsV2: vi.fn(), getMlbStandings: vi.fn() },
}));

import { buildScoutReport } from '../../../src/services/agentic/scoutReport/scoutReportBuilder.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { buildMlbDesk, stakesLine, deadlineLine } from '../../../src/services/pickdesk/mlbDesk.js';

const SCOUT_TEXT = `MATCHUP: Reds @ Cardinals

═══ PROBABLE PITCHERS ═══
pitchers here

═══ INJURIES (BDL Structured) ═══
injuries here

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
});

describe('buildMlbDesk', () => {
  const game = { homeTeam: 'Cardinals', awayTeam: 'Reds', bdl_game_id: 99 };

  it('orders the desk BOARD → STAKES → WORLD → shelf', async () => {
    const { deskText } = await buildMlbDesk(game);
    const board = deskText.indexOf('═══ THE BOARD ═══');
    const stakes = deskText.indexOf('═══ THE STAKES ═══');
    const world = deskText.indexOf('═══ THE WORLD ═══');
    const shelf = deskText.indexOf('═══ PROBABLE PITCHERS ═══');
    expect(board).toBe(0);
    expect(stakes).toBeGreaterThan(board);
    expect(world).toBeGreaterThan(stakes);
    expect(shelf).toBeGreaterThan(world);
  });

  it('board carries every book, both ML sides, both RL sides, and the mechanics legend', async () => {
    const { deskText } = await buildMlbDesk(game);
    expect(deskText).toContain('fanduel: ML Reds -112 / Cardinals -104 | Run line Reds 1.5 (-178) / Cardinals -1.5 (148)');
    expect(deskText).toContain('draftkings:');
    expect(deskText).toContain('Bet mechanics (facts):');
  });

  it('stakes carry record, division position, GB, seed, streak, and the deadline', async () => {
    const { deskText } = await buildMlbDesk(game);
    expect(deskText).toContain('Cardinals: 53-51, 2nd in the NL Central, 12 GB, playoff seed 7, streak -2, L10 3-7');
    expect(deskText).toContain('Reds: 48-55, 3rd in the NL Central, 16.5 GB, playoff seed 12');
    expect(deskText).toContain('Trade deadline: July 31');
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
      homeTeam: 'Cardinals', awayTeam: 'Reds',
      moneylineHome: -104, moneylineAway: -112,
      spreadHome: -1.5, spreadHomeOdds: 148, spreadAway: 1.5, spreadAwayOdds: -178,
    });
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
