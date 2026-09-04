import { describe, it, expect } from 'vitest';
import {
  ambiguousGamePickReceiptKeys,
  bookRecord,
  cumulativeSeries,
  filterBets,
  findExistingGameBet,
  findExistingPropBet,
  fmtNet,
  fmtNetTotal,
  fmtStake,
  gameBookTrackingUnavailableReason,
  gameDateForBook,
  gamePickReceiptKey,
  groupLedgerDays,
  isVerified,
  manualUnits,
  trackerStats,
  tailFadeCountForGame,
  windowSince,
  betsCsv,
  isBetLocked,
  searchBets,
  type UserBet,
} from '@/lib/book/model';

const bet = (over: Partial<UserBet>): UserBet => ({
  id: 'b1', kind: 'tail', pick_type: 'game', game_date: '2026-08-10',
  league: 'MLB', pick_text: 'Mets ML -120', matchup: 'PHI @ NYM',
  player_name: null, prop_type: null, description: null,
  odds_american: -120, odds_estimated: false, stake_units: 1,
  gary_confidence: 0.74, streak_pick: false, status: 'won',
  units_net: 0.83, lock_at: null, placed_at: '2026-08-10T18:00:00Z',
  graded_by: 'system', ...over,
});

describe('isVerified (the WITH GARY ledger boundary)', () => {
  it('tails and fades are verified; manual is not', () => {
    expect(isVerified(bet({ kind: 'tail' }))).toBe(true);
    expect(isVerified(bet({ kind: 'fade' }))).toBe(true);
    expect(isVerified(bet({ kind: 'manual' }))).toBe(false);
  });
});

describe('board receipt identity', () => {
  it('flags exact duplicate game selections across the complete day', () => {
    expect(ambiguousGamePickReceiptKeys([
      { pick: 'Under 2.5', type: 'game' },
      { pick: 'Home +3.5', type: 'game' },
      { pick: 'Under 2.5', type: 'game' },
    ], '2026-09-03')).toEqual([gamePickReceiptKey('2026-09-03', 'Under 2.5')]);
  });

  it('keeps the shared ledger identity exact and ignores blanks and props', () => {
    expect(ambiguousGamePickReceiptKeys([
      { pick: 'Under 2.5', type: 'game' },
      { pick: 'under 2.5', type: 'game' },
      { pick: 'Under 2.5 ', type: 'game' },
      { pick: 'Under 2.5', type: 'prop' },
      { pick: '  ', type: 'game' },
      { pick: '', type: 'game' },
    ], '2026-09-03')).toEqual([]);
  });

  it('flags the same exact text even when it comes from different leagues', () => {
    expect(ambiguousGamePickReceiptKeys([
      { pick: 'Over 7.5', type: 'game' },
      { pick: 'Over 7.5' },
    ], '2026-09-03')).toEqual([gamePickReceiptKey('2026-09-03', 'Over 7.5')]);
  });

  it('keeps identical weekly selections independent across kickoff dates', () => {
    expect(ambiguousGamePickReceiptKeys([
      { pick: 'Over 47.5', commence_time: '2026-09-04T00:00:00Z' },
      { pick: 'Over 47.5', commence_time: '2026-09-05T00:00:00Z' },
    ], '2026-09-03')).toEqual([]);
  });

  it('uses the kickoff ET date and falls back only when kickoff is unavailable', () => {
    expect(gameDateForBook('2026-09-04T01:30:00Z', '2026-09-04')).toBe('2026-09-03');
    expect(gameDateForBook(null, '2026-09-04')).toBe('2026-09-04');
  });

  it('never displays community totals fetched for another board date', () => {
    const counts = { 'Over 47.5': { tails: 8, fades: 3 } };
    expect(tailFadeCountForGame(counts, '2026-09-03', '2026-09-03', 'Over 47.5'))
      .toEqual({ tails: 8, fades: 3 });
    expect(tailFadeCountForGame(counts, '2026-09-03', '2026-09-04', 'Over 47.5'))
      .toBeUndefined();
  });

  it('supports weekly NFL through the canonical server placement resolver', () => {
    expect(gameBookTrackingUnavailableReason('NFL')).toBeNull();
    expect(gameBookTrackingUnavailableReason('MLB')).toBeNull();
  });

  it('does not reuse the same game selection from an older date', () => {
    const rows = [
      bet({ id: 'old', game_date: '2026-08-10', pick_text: 'Mets ML -120' }),
      bet({ id: 'today', game_date: '2026-09-03', pick_text: 'Mets ML -120' }),
    ];
    expect(findExistingGameBet(rows, '2026-09-03', 'Mets ML -120')?.id).toBe('today');
    expect(findExistingGameBet(rows, '2026-09-04', 'Mets ML -120')).toBeNull();
  });

  it('keeps repeated player markets separate by board date', () => {
    const rows = [
      bet({ id: 'old', pick_type: 'prop', game_date: '2026-08-10', player_name: 'Aaron Judge', prop_type: 'total_bases' }),
      bet({ id: 'today', pick_type: 'prop', game_date: '2026-09-03', player_name: 'Aaron Judge', prop_type: 'total_bases' }),
    ];
    expect(findExistingPropBet(rows, '2026-09-03', 'aaron judge', 'TOTAL_BASES')?.id).toBe('today');
    expect(findExistingPropBet(rows, '2026-09-04', 'Aaron Judge', 'total_bases')).toBeNull();
  });
});

describe('bookRecord', () => {
  it('counts W-L-P and sums units_net', () => {
    const rec = bookRecord([
      bet({ status: 'won', units_net: 0.83 }),
      bet({ id: 'b2', status: 'lost', units_net: -1 }),
      bet({ id: 'b3', status: 'push', units_net: 0 }),
      bet({ id: 'b4', status: 'won', units_net: 1.35 }),
    ]);
    expect(rec.wins).toBe(2);
    expect(rec.losses).toBe(1);
    expect(rec.pushes).toBe(1);
    expect(rec.units).toBeCloseTo(1.18);
    expect(rec.pct).toBe(67); // 2 of 3 decided, pushes excluded
  });
  it('pct is null with nothing decided', () => {
    expect(bookRecord([bet({ status: 'pending', units_net: null })]).pct).toBeNull();
  });
  it('voids contribute no result but their units_net still sums (server writes 0)', () => {
    const rec = bookRecord([bet({ status: 'void', units_net: 0 })]);
    expect(rec.wins + rec.losses + rec.pushes).toBe(0);
    expect(rec.units).toBe(0);
  });
});

describe('windowSince + filterBets', () => {
  const now = new Date('2026-08-11T17:00:00Z');
  it('season floor is the era start; all has no floor', () => {
    expect(windowSince('season', now)).toBe('2026-03-01');
    expect(windowSince('all', now)).toBeNull();
  });
  it('filters by date floor and by kind', () => {
    const rows = [
      bet({ id: 'old', game_date: '2026-05-01' }),
      bet({ id: 'new', game_date: '2026-08-10' }),
      bet({ id: 'man', game_date: '2026-08-10', kind: 'manual' }),
    ];
    const week = filterBets(rows, '7d', 'all', now);
    expect(week.map(b => b.id)).toEqual(['new', 'man']);
    expect(filterBets(rows, 'all', 'manual', now).map(b => b.id)).toEqual(['man']);
    expect(filterBets(rows, 'all', 'tail', now)).toHaveLength(2);
  });
});

describe('trackerStats', () => {
  it('win% of decided, ROI over decided stakes, avg odds, best day', () => {
    const stats = trackerStats([
      bet({ status: 'won', units_net: 0.83, stake_units: 1, odds_american: -120, game_date: '2026-08-09' }),
      bet({ id: 'b2', status: 'lost', units_net: -1, stake_units: 1, odds_american: +140, game_date: '2026-08-10' }),
      bet({ id: 'b3', status: 'won', units_net: 2.8, stake_units: 2, odds_american: +140, game_date: '2026-08-10' }),
      bet({ id: 'b4', status: 'pending', units_net: null }),
    ]);
    expect(stats.winPct).toBe(67);
    expect(stats.roiPct).toBe(66); // 2.63 net / 4 staked
    expect(stats.avgOdds).toBe(121); // Average payout, converted back to valid American odds.
    expect(stats.bestDay).toEqual({ date: '2026-08-10', units: 1.8 });
  });
  it('everything null with no settled bets', () => {
    const stats = trackerStats([bet({ status: 'pending', units_net: null })]);
    expect(stats.winPct).toBeNull();
    expect(stats.roiPct).toBeNull();
    expect(stats.avgOdds).toBeNull();
    expect(stats.bestDay).toBeNull();
  });
});

describe('Book safety and complete tracking', () => {
  it('locks verified slips at kickoff and when kickoff is unknown', () => {
    expect(isBetLocked(bet({ status: 'pending', lock_at: null }))).toBe(true);
    expect(isBetLocked(bet({ status: 'pending', lock_at: '2026-09-04T20:00:00Z' }), Date.parse('2026-09-04T20:00:00Z'))).toBe(true);
    expect(isBetLocked(bet({ status: 'pending', lock_at: '2026-09-04T20:00:00Z' }), Date.parse('2026-09-04T19:59:00Z'))).toBe(false);
    expect(isBetLocked(bet({ kind: 'manual' }))).toBe(false);
  });
  it('searches private notes and combines favorite, sport, and result filters', () => {
    const rows = [bet({ id: 'yes', is_favorite: true, notes: 'Wind read', league: 'MLB' }), bet({ id: 'no', notes: 'Wind read' })];
    expect(searchBets(rows, 'wind', 'MLB', 'won', true).map(b => b.id)).toEqual(['yes']);
  });
  it('exports quoted multiline cells without spreadsheet formula injection', () => {
    const csv = betsCsv([bet({ pick_text: '=SUM(1,2)', notes: 'He said "yes"\nThen no', odds_american: -110 })]);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"He said ""yes""\nThen no"');
    expect(csv).toContain('"-110"');
  });
  it('7 and 30 day windows include today without an extra day', () => {
    const now = new Date('2026-09-04T12:00:00Z');
    expect(windowSince('7d', now)).toBe('2026-08-29');
    expect(windowSince('30d', now)).toBe('2026-08-06');
  });
  it('distinguishes the same player market across doubleheader games', () => {
    const rows = [bet({ pick_type: 'prop', player_name: 'Judge', prop_type: 'hits', source_game_id: 'first', source_line: 1.5, source_side: 'over' }), bet({ id: 'second', pick_type: 'prop', player_name: 'Judge', prop_type: 'hits', source_game_id: 'second', source_line: 1.5, source_side: 'over' })];
    expect(findExistingPropBet(rows, '2026-08-10', 'Judge', 'hits', 'second', 1.5, 'over')?.id).toBe('second');
  });
});

describe('cumulativeSeries (THE RIDE)', () => {
  it('runs oldest to newest, one point per day', () => {
    const series = cumulativeSeries([
      bet({ game_date: '2026-08-10', status: 'won', units_net: 0.9 }),
      bet({ id: 'b2', game_date: '2026-08-09', status: 'lost', units_net: -1 }),
      bet({ id: 'b3', game_date: '2026-08-10', status: 'lost', units_net: -1 }),
      bet({ id: 'b4', game_date: '2026-08-11', status: 'pending', units_net: null }),
    ]);
    expect(series).toEqual([
      { date: '2026-08-09', units: -1 },
      { date: '2026-08-10', units: -1.1 },
    ]);
  });
});

describe('groupLedgerDays (THE LEDGER)', () => {
  it('groups settled slips by day, newest first, with day nets', () => {
    const days = groupLedgerDays([
      bet({ game_date: '2026-08-09', status: 'lost', units_net: -1 }),
      bet({ id: 'b2', game_date: '2026-08-10', status: 'won', units_net: 0.83 }),
      bet({ id: 'b3', game_date: '2026-08-10', status: 'won', units_net: 1.0 }),
      bet({ id: 'b4', game_date: '2026-08-11', status: 'pending', units_net: null }),
    ]);
    expect(days.map(d => d.date)).toEqual(['2026-08-10', '2026-08-09']);
    expect(days[0].net).toBeCloseTo(1.83);
    expect(days[0].rows).toHaveLength(2);
  });
});

describe('manualUnits (mirrors the server settle math)', () => {
  it('win pays at the row odds', () => {
    expect(manualUnits('won', 1, -110)).toBeCloseTo(0.91);
    expect(manualUnits('won', 2, 150)).toBeCloseTo(3.0);
  });
  it('assumes -110 with no odds entered', () => {
    expect(manualUnits('won', 1, null)).toBeCloseTo(0.91);
  });
  it('loss is -stake, push is zero', () => {
    expect(manualUnits('lost', 2.5, 140)).toBe(-2.5);
    expect(manualUnits('push', 1, -110)).toBe(0);
  });
});

describe('money display (units until a unit size is set)', () => {
  it('stakes', () => {
    expect(fmtStake(1, 0)).toBe('1.0u');
    expect(fmtStake(1, 25)).toBe('$25');
    expect(fmtStake(1.5, 25)).toBe('$37.50');
  });
  it('nets', () => {
    expect(fmtNet(0.63, 0)).toBe('+0.63u');
    expect(fmtNet(-1, 0)).toBe('-1.00u');
    expect(fmtNet(0.63, 100)).toBe('+$63');
    expect(fmtNet(-0.25, 100)).toBe('-$25');
  });
  it('totals use one decimal in unit mode', () => {
    expect(fmtNetTotal(1.42, 0)).toBe('+1.4u');
    expect(fmtNetTotal(-2.06, 0)).toBe('-2.1u');
    expect(fmtNetTotal(1.4, 100)).toBe('+$140');
  });
});
