// An opponent's other games in a row's first line read in full by default (Nov 10 2026, founder: nothing is cut because
// Gary did not use it); NBA_OPP_GAMES_DETAIL=0 gives the results only, kept for later.
import { afterEach, describe, expect, it } from 'vitest';
import { otherGameEntry, oppGamesDetail } from '../../src/services/sports/nba/nbaBettorData.js';

const r = { game_id: 9, summary: { ot: true, home: { id: 2, abbr: 'BOS', score: 125 }, away: { id: 5, abbr: 'BKN', score: 124 } } };
const box = { home: { possessions: 99, fgm: 40, fga: 88, fg3m: 12, fg3a: 35, ftm: 33, fta: 40, reb: 45, oreb: 10, turnover: 12 },
  away: { possessions: 99, fgm: 44, fga: 90, fg3m: 10, fg3a: 30, ftm: 26, fta: 30, reb: 40, oreb: 8, turnover: 14 } };
const outWords = (_, side) => (side === 'home' ? 'Jayson Tatum' : 'nobody');
const env = process.env.NBA_OPP_GAMES_DETAIL;
afterEach(() => { if (env === undefined) delete process.env.NBA_OPP_GAMES_DETAIL; else process.env.NBA_OPP_GAMES_DETAIL = env; });

describe("NBA game rows: an opponent's other games", () => {
  const full = 'W 125-124 (OT) vs BKN (their out: Jayson Tatum; BKN out: nobody; about 99 possessions; '
    + '40-88 FG, 12-35 3PT, 33-40 FT, 45 rebounds (10 offensive), 12 turnovers; allowed 44-90 FG, 10-30 3PT, 26-30 FT, 40 rebounds (8 offensive), 14 turnovers)';
  it('prints the full entry by default, the same as NBA_OPP_GAMES_DETAIL=1', () => {
    delete process.env.NBA_OPP_GAMES_DETAIL;
    expect(otherGameEntry(r, 2, 7, { detail: oppGamesDetail(), box, outWords })).toBe(full);
    process.env.NBA_OPP_GAMES_DETAIL = '1';
    expect(otherGameEntry(r, 2, 7, { detail: oppGamesDetail(), box, outWords })).toBe(full);
  });
  it('prints each as its result only with NBA_OPP_GAMES_DETAIL=0', () => {
    process.env.NBA_OPP_GAMES_DETAIL = '0';
    expect(otherGameEntry(r, 2, 7, { detail: oppGamesDetail(), box, outWords })).toBe('W 125-124 (OT) vs BKN');
  });
});
