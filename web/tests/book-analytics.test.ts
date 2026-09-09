import { describe, expect, it } from 'vitest';
import {
  addTag, breakdownRows, canMoveForward, cleanTag, leanTier, marketLabel, marketShort, monthGrid,
  parseTags, periodContaining, periodContains, periodKicker, periodLabel, popularTags, rollingWindows,
  shiftDays, shiftPeriod, summaryOf, weekday,
} from '@/lib/book/analytics';
import type { UserBet } from '@/lib/book/model';

const bet = (over: Partial<UserBet> & { id: string; game_date: string; status: string }): UserBet => ({
  kind: 'tail', pick_type: 'game', league: 'MLB', pick_text: 'Mets ML -120', matchup: null,
  player_name: null, prop_type: null, description: null, odds_american: -120, odds_estimated: false,
  stake_units: 1, gary_confidence: null, streak_pick: false, units_net: null, lock_at: null,
  placed_at: null, graded_by: 'system', ...over,
});

describe('dates', () => {
  it('weekday and shifting follow the Eastern calendar day', () => {
    expect(weekday('2026-09-06')).toBe(1);
    expect(weekday('2026-09-09')).toBe(4);
    expect(shiftDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('periods', () => {
  const today = '2026-09-09';
  it('weeks run Sunday to Saturday', () => {
    const week = periodContaining(today, 'week');
    expect(week).toEqual({ kind: 'week', start: '2026-09-06', end: '2026-09-12' });
    expect(periodLabel(week)).toBe('Sep 6 – 12');
    expect(periodKicker(week)).toBe('SEP 6 – SEP 12, 2026');
    expect(periodLabel(periodContaining('2026-09-01', 'week'))).toBe('Aug 30 – Sep 5');
  });
  it('months and years page across the year boundary', () => {
    const month = periodContaining(today, 'month');
    expect(month).toEqual({ kind: 'month', start: '2026-09-01', end: '2026-09-30' });
    expect(periodLabel(shiftPeriod(month, 4))).toBe('January 2027');
    expect(periodLabel(shiftPeriod(month, -9))).toBe('December 2025');
    expect(periodLabel(periodContaining(today, 'year'))).toBe('2026');
    expect(canMoveForward(month, today)).toBe(false);
    expect(canMoveForward(shiftPeriod(month, -1), today)).toBe(true);
  });
  it('ALL holds everything and never moves', () => {
    const all = periodContaining(today, 'all');
    expect(periodContains(all, '1999-01-01')).toBe(true);
    expect(shiftPeriod(all, 3)).toEqual(all);
    expect(canMoveForward(all, today)).toBe(false);
    expect(periodKicker(all)).toBe('ALL TIME');
  });
});

const sample = [
  bet({ id: 'a', game_date: '2026-09-01', status: 'won', units_net: 0.91 }),
  bet({ id: 'b', game_date: '2026-09-01', status: 'lost', units_net: -1 }),
  bet({ id: 'c', game_date: '2026-09-02', status: 'push', units_net: 0 }),
  bet({ id: 'd', game_date: '2026-09-03', status: 'won', units_net: 1.5, stake_units: 1.5 }),
  bet({ id: 'e', game_date: '2026-09-04', status: 'pending', stake_units: 2 }),
  bet({ id: 'f', game_date: '2026-09-05', status: 'void', units_net: 0 }),
];

describe('summary', () => {
  it('counts the record, profit and ROI on decided plays', () => {
    const s = summaryOf(sample);
    expect([s.wins, s.losses, s.pushes]).toEqual([2, 1, 1]);
    expect(s.profit).toBeCloseTo(1.41);
    expect(s.staked).toBeCloseTo(3.5);
    expect(s.roi).toBeCloseTo(1.41 / 3.5 * 100);
    expect(s.record).toBe('2-1-1');
    expect(summaryOf([]).roi).toBeNull();
  });
});

describe('calendar', () => {
  const grid = monthGrid(2026, 9, [
    ...sample,
    bet({ id: 'g', game_date: '2026-08-31', status: 'won', units_net: 2 }),
    bet({ id: 'h', game_date: '2026-10-01', status: 'lost', units_net: -1 }),
  ]);
  it('lays out six rows of seven starting on the Sunday before the 1st', () => {
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
    expect(grid.weeks[0][0]).toMatchObject({ date: '2026-08-30', inMonth: false });
    expect(grid.weeks[0][2]).toMatchObject({ date: '2026-09-01', inMonth: true, settledCount: 2 });
    expect(grid.weeks[0][2].net).toBeCloseTo(-0.09);
  });
  it('shows pushes at zero, pending-only days as open, and totals only the month', () => {
    expect(grid.weeks[0][3]).toMatchObject({ net: 0, settledCount: 1 });
    expect(grid.weeks[0][5]).toMatchObject({ net: null, pendingCount: 1 });
    expect(grid.net).toBeCloseTo(1.41);
    expect(grid.settledCount).toBe(5);
    expect(grid.activeDays).toBe(4);
    expect(grid.weeks[0][1]).toMatchObject({ net: 2, inMonth: false });
    expect(grid.kicker).toBe('SEPTEMBER 2026');
    expect(monthGrid(2026, 2, []).weeks[0][0]).toMatchObject({ date: '2026-02-01', inMonth: true });
  });
});

const mixed = [
  bet({ id: '1', game_date: '2026-09-01', status: 'won', units_net: 0.9, league: 'MLB', market: 'moneyline', bookmaker: 'DraftKings', tags: ['live', 'promo'], gary_confidence: 0.61 }),
  bet({ id: '2', game_date: '2026-09-01', status: 'lost', units_net: -1, league: 'MLB', market: 'spread', bookmaker: 'DraftKings', tags: ['live'], gary_confidence: 0.56 }),
  bet({ id: '3', game_date: '2026-09-02', status: 'won', units_net: 1.2, league: 'NFL', market: null, gary_confidence: 0.53 }),
  bet({ id: '4', game_date: '2026-09-02', status: 'won', units_net: 0.8, kind: 'fade', league: 'NFL', market: 'moneyline', gary_confidence: 0.58 }),
  bet({ id: '5', game_date: '2026-09-03', status: 'lost', units_net: -1, kind: 'manual', league: 'NCAAF', market: 'parlay', bookmaker: 'FanDuel', tags: ['parlay'] }),
  bet({ id: '6', game_date: '2026-09-03', status: 'pending', league: 'MLB', market: 'total' }),
  bet({ id: '7', game_date: '2026-09-04', status: 'void', units_net: 0, league: 'MLB', market: 'total' }),
];

describe('breakdowns', () => {
  it('leagues tie on plays, then net breaks it; pending and void are excluded', () => {
    const rows = breakdownRows(mixed, 'league');
    expect(rows.map((r) => r.label)).toEqual(['NFL', 'MLB', 'NCAAF']);
    expect(rows[1]).toMatchObject({ record: '1-1' });
    expect(rows[1].net).toBeCloseTo(-0.1);
    expect(rows[0].winPct).toBe(100);
  });
  it('bet types, books and tags group the way the phone does', () => {
    expect(breakdownRows(mixed, 'market')[0].label).toBe('MONEYLINE');
    expect(breakdownRows(mixed, 'market').find((r) => r.label === 'UNTYPED')?.played).toBe(1);
    const books = breakdownRows(mixed, 'bookmaker');
    expect(books[0]).toMatchObject({ label: 'DRAFTKINGS', played: 2 });
    expect(books[books.length - 1]).toMatchObject({ label: 'NOT SET', played: 2 });
    const tags = breakdownRows(mixed, 'tags');
    expect(tags[0]).toMatchObject({ label: 'LIVE', played: 2 });
    expect(tags.find((r) => r.label === 'PROMO')?.played).toBe(1);
  });
  it('the vs-Gary split and lean tiers keep their fixed order and ignore manual plays', () => {
    const side = breakdownRows(mixed, 'side');
    expect(side.map((r) => r.label)).toEqual(['RIDING GARY', 'FADING GARY']);
    expect(side[0].record).toBe('2-1');
    expect(breakdownRows(mixed, 'confidence').map((r) => r.label)).toEqual(['STRONG LEAN', 'SOLID LEAN', 'SLIGHT LEAN']);
    expect(leanTier(null)).toBe('No lean recorded');
    expect(breakdownRows([], 'league')).toEqual([]);
  });
});

describe('bankroll windows', () => {
  it('30, 60 and 90 days end today and include the first day', () => {
    const windows = rollingWindows([
      bet({ id: 'r1', game_date: '2026-09-09', status: 'won', units_net: 1 }),
      bet({ id: 'r2', game_date: '2026-08-12', status: 'lost', units_net: -1 }),
      bet({ id: 'r3', game_date: '2026-08-11', status: 'won', units_net: 3 }),
      bet({ id: 'r4', game_date: '2026-06-12', status: 'lost', units_net: -1 }),
      bet({ id: 'r5', game_date: '2026-06-11', status: 'won', units_net: 0.5 }),
    ], '2026-09-09');
    expect(windows.map((w) => w.days)).toEqual([30, 60, 90]);
    expect(windows[0].start).toBe('2026-08-11');
    expect(windows[0].summary.profit).toBeCloseTo(3);
    expect(windows[1].summary.profit).toBeCloseTo(3);
    expect(windows[2].start).toBe('2026-06-12');
    expect(windows[2].summary.profit).toBeCloseTo(2);
  });
});

describe('tags and markets', () => {
  it('cleans, dedupes and caps tags', () => {
    expect(cleanTag('  Live Bet ')).toBe('live bet');
    expect(cleanTag('#Promo!')).toBe('promo');
    expect(cleanTag('   ')).toBeNull();
    expect(cleanTag('---')).toBeNull();
    expect(cleanTag('a'.repeat(40))).toHaveLength(24);
    expect(parseTags('live, PROMO,live,, under')).toEqual(['live', 'promo', 'under']);
    expect(addTag('x', Array(8).fill('t'))).toHaveLength(8);
    expect(popularTags(mixed)).toEqual(['live', 'parlay', 'promo']);
  });
  it('labels markets', () => {
    expect(marketLabel('moneyline')).toBe('MONEYLINE');
    expect(marketLabel(null)).toBe('UNTYPED');
    expect(marketShort('prop')).toBe('PROP');
    expect(marketShort(undefined)).toBe('');
  });
});
