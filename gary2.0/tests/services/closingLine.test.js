import { describe, it, expect } from 'vitest';
import {
  impliedProb, fairProb, pickTeamOf, pickSideOf, pickPointOf, ticketPrices, pickOpenAndClose, readPick, summarizeClosingLine,
} from '../../src/services/closingLine.js';

describe('closingLine — price math', () => {
  it('implied and vig-free probabilities', () => {
    expect(impliedProb(-150)).toBeCloseTo(0.6, 5);
    expect(impliedProb(130)).toBeCloseTo(0.4348, 3);
    expect(impliedProb(0)).toBeNull();
    expect(impliedProb('x')).toBeNull();
    // -144 / +122: implied 0.590 / 0.450 → fair 0.567
    expect(fairProb(-144, 122)).toBeCloseTo(0.5673, 3);
    expect(fairProb(-144, null)).toBeNull();
  });

  it('reads the team, the side and the point off a pick', () => {
    expect(pickTeamOf('Red Sox ML -144')).toBe('Red Sox');
    expect(pickTeamOf('Dodgers -1.5 +120')).toBe('Dodgers');
    expect(pickTeamOf('Utah Jazz +4.5 +100')).toBe('Utah Jazz');
    const p = { pick: 'Red Sox ML -144', homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners' };
    expect(pickSideOf(p)).toBe('home');
    expect(pickSideOf({ ...p, pick: 'Mariners ML +122' })).toBe('away');
    expect(pickSideOf({ ...p, pick: 'Yankees ML -120' })).toBeNull();
    expect(pickPointOf({ pick: 'Dodgers -1.5 +120', type: 'spread' })).toBe(-1.5);
    expect(pickPointOf({ pick: 'Padres +1.5 -140', type: 'spread' })).toBe(1.5);
    expect(pickPointOf({ pick: 'Red Sox ML -144', type: 'moneyline' })).toBeNull();
  });

  it('ticket prices come off the row for the right side, and a moved spread point is a different ticket', () => {
    const row = { moneyline_home: -144, moneyline_away: 122, spread_home: -1.5, spread_home_odds: 120, spread_away: 1.5, spread_away_odds: -140 };
    expect(ticketPrices(row, 'home', 'moneyline')).toEqual({ mine: -144, theirs: 122 });
    expect(ticketPrices(row, 'away', 'moneyline')).toEqual({ mine: 122, theirs: -144 });
    expect(ticketPrices(row, 'home', 'spread', -1.5)).toEqual({ mine: 120, theirs: -140 });
    expect(ticketPrices(row, 'home', 'spread', -2.5)).toBeNull();
    expect(ticketPrices({ moneyline_home: -144 }, 'home', 'moneyline')).toBeNull();
  });
});

describe('closingLine — open, close and the read', () => {
  const T = (h, m = 0) => `2026-09-02T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  const first = T(20, 10); // 4:10 PM ET
  const snaps = [
    { seen_at: T(9), line_vendor: 'fanduel', moneyline_home: -134, moneyline_away: 116, spread_home: -1.5, spread_home_odds: 155, spread_away: 1.5, spread_away_odds: -180 },
    { seen_at: T(9), line_vendor: 'draftkings', moneyline_home: -130, moneyline_away: 110, spread_home: -1.5, spread_home_odds: 150, spread_away: 1.5, spread_away_odds: -175 },
    { seen_at: T(18, 40), line_vendor: 'fanduel', moneyline_home: -144, moneyline_away: 122, spread_home: -1.5, spread_home_odds: 150, spread_away: 1.5, spread_away_odds: -175 },
    { seen_at: T(20, 9), line_vendor: 'fanduel', moneyline_home: -155, moneyline_away: 130, spread_home: -1.5, spread_home_odds: 140, spread_away: 1.5, spread_away_odds: -165 },
    { seen_at: T(20, 30), line_vendor: 'fanduel', moneyline_home: -170, moneyline_away: 145, spread_home: -1.5, spread_home_odds: 130, spread_away: 1.5, spread_away_odds: -155 }, // after first pitch: ignored
  ];

  it('prefers the pick\'s book, takes the day\'s first board as the open and the last pre-pitch board as the close', () => {
    const { open, close, book } = pickOpenAndClose(snaps, { book: 'FanDuel', commenceTime: first });
    expect(book).toBe('fanduel');
    expect(open.moneyline_home).toBe(-134);
    expect(close.moneyline_home).toBe(-155);
    const any = pickOpenAndClose(snaps, { book: 'caesars', commenceTime: first });
    expect(any.book).toBe('fanduel'); // no caesars rows → any book, earliest first
    expect(pickOpenAndClose([], {})).toEqual({ open: null, close: null, book: null });
  });

  it('a moneyline pick: the world moved toward Gary after he took -144, and from open to close', () => {
    const pick = { game_date: '2026-09-02', league: 'MLB', game_id: '5059863', pick: 'Red Sox ML -144', type: 'moneyline', odds: -144, moneylineHome: -144, moneylineAway: 122, homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', bestLineBook: 'FanDuel', result: 'lost' };
    const r = readPick(pick, snaps, { commenceTime: first });
    expect(r.side).toBe('home');
    expect(r.book).toBe('fanduel');
    expect(r.price_pick).toBe(-144);
    expect(r.price_close).toBe(-155);
    expect(r.price_open).toBe(-134);
    expect(r.prob_pick).toBeCloseTo(fairProb(-144, 122), 6);
    expect(r.prob_close).toBeCloseTo(fairProb(-155, 130), 6);
    expect(r.clv_pts).toBeGreaterThan(0);
    expect(r.open_to_close_pts).toBeGreaterThan(0);
    expect(r.right_side_pick).toBe(true);
    expect(r.right_side_open).toBe(true);
    expect(r.result).toBe('lost'); // a good bet can lose
    expect(r.notes).toBe('');
  });

  it('a dog pick on the wrong side of the move reads negative', () => {
    const pick = { game_date: '2026-09-02', league: 'MLB', game_id: '5059863', pick: 'Mariners ML +122', type: 'moneyline', odds: 122, moneylineHome: -144, moneylineAway: 122, homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', bestLineBook: 'fanduel' };
    const r = readPick(pick, snaps, { commenceTime: first });
    expect(r.side).toBe('away');
    expect(r.price_close).toBe(130);
    expect(r.clv_pts).toBeLessThan(0);
    expect(r.right_side_pick).toBe(false);
  });

  it('a run-line pick reads its own ticket, with the pick-time board taken near T-90', () => {
    const pick = { game_date: '2026-09-02', league: 'MLB', game_id: '5059863', pick: 'Red Sox -1.5 +150', type: 'spread', odds: 150, spread: -1.5, homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', bestLineBook: 'fanduel' };
    const r = readPick(pick, snaps, { commenceTime: first });
    expect(r.bet_type).toBe('spread');
    expect(r.point).toBe(-1.5);
    expect(r.price_pick).toBe(150);
    expect(r.price_close).toBe(140);
    expect(r.clv_pts).toBeGreaterThan(0);
  });

  it('an unrecognised side or a missing board is recorded, never guessed', () => {
    const r = readPick({ pick: 'Yankees ML -120', homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', odds: -120 }, snaps, { commenceTime: first });
    expect(r.side).toBeNull();
    expect(r.clv_pts).toBeNull();
    expect(r.notes).toContain('side unrecognised');
    const r2 = readPick({ pick: 'Red Sox ML -144', type: 'moneyline', odds: -144, moneylineHome: -144, moneylineAway: 122, homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners' }, [], {});
    expect(r2.prob_pick).not.toBeNull();
    expect(r2.close_seen_at).toBeNull();
    expect(r2.clv_pts).toBeNull();
  });

  it('summarizes right-side rates and mean points, split by favorites and dogs', () => {
    const rows = [
      { clv_pts: 1.2, open_to_close_pts: 2.0, price_pick: -144 },
      { clv_pts: -0.4, open_to_close_pts: -1.0, price_pick: -120 },
      { clv_pts: 0.8, open_to_close_pts: null, price_pick: 130 },
      { clv_pts: null, open_to_close_pts: null, price_pick: 110 },
    ];
    const s = summarizeClosingLine(rows);
    expect(s.pickToClose).toEqual({ n: 3, right: 2, rate: 66.7, mean_pts: 0.53 });
    expect(s.openToClose).toEqual({ n: 2, right: 1, rate: 50, mean_pts: 0.5 });
    expect(s.favorites.pickToClose.n).toBe(2);
    expect(s.dogs.pickToClose).toEqual({ n: 1, right: 1, rate: 100, mean_pts: 0.8 });
    expect(s.unread).toBe(1);
  });
});
