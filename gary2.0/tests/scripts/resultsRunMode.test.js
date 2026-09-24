import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FOOTBALL_SETTLEMENT_SPORTS,
  nflWeekStartForDate,
  parseResultsRunArgs,
  runFootballSettlementDates,
  sportAllowed,
} from '../../scripts/lib/resultsRunMode.js';

describe('results run-mode parsing', () => {
  it('finds an explicit date on either side of the football flag', () => {
    expect(parseResultsRunArgs(['--football-settlements', '2026-09-12'])).toEqual({
      footballSettlements: true,
      explicitDate: '2026-09-12',
    });
    expect(parseResultsRunArgs(['2026-09-12', '--football-settlements'])).toEqual({
      footballSettlements: true,
      explicitDate: '2026-09-12',
    });
  });

  it('leaves the historical full run as the default', () => {
    expect(parseResultsRunArgs([])).toEqual({
      footballSettlements: false,
      explicitDate: null,
    });
  });
});

describe('football result scope', () => {
  const football = new Set(FOOTBALL_SETTLEMENT_SPORTS);

  it('includes NFL and NCAAF without opening any MLB lane', () => {
    expect(sportAllowed('NFL', football)).toBe(true);
    expect(sportAllowed('ncaaf', football)).toBe(true);
    expect(sportAllowed('MLB', football)).toBe(false);
    expect(sportAllowed('MLB HR', football)).toBe(false);
  });

  it.each([
    ['2026-09-07', '2026-09-01'], // Monday closes the prior Tue–Mon week
    ['2026-09-08', '2026-09-08'], // Tuesday opens the next publication week
    ['2026-09-12', '2026-09-08'], // Saturday
    ['2026-09-13', '2026-09-08'], // Sunday
    ['2027-01-01', '2026-12-29'], // year boundary
  ])('maps %s to NFL week %s', (date, expected) => {
    expect(nflWeekStartForDate(date)).toBe(expected);
  });
});

describe('football settlement date resilience', () => {
  it('attempts yesterday before today and completes both dates', async () => {
    const attempted = [];

    await expect(runFootballSettlementDates(
      ['2026-08-15', '2026-08-14'],
      async (date) => attempted.push(date),
    )).resolves.toEqual(['2026-08-14', '2026-08-15']);
    expect(attempted).toEqual(['2026-08-14', '2026-08-15']);
  });

  it('continues to today after yesterday fails, then reports the retained failure', async () => {
    const attempted = [];

    await expect(runFootballSettlementDates(
      ['2026-08-15', '2026-08-14'],
      async (date) => {
        attempted.push(date);
        if (date === '2026-08-14') throw new Error('provider unavailable');
      },
    )).rejects.toMatchObject({
      message: 'Football settlement failed for 2026-08-14',
      settlementFailures: [expect.objectContaining({ date: '2026-08-14' })],
    });
    expect(attempted).toEqual(['2026-08-14', '2026-08-15']);
  });
});

describe('NFL generation week window', () => {
  const picksRunner = readFileSync(
    new URL('../../scripts/lib/picks/window.js', import.meta.url),
    'utf8',
  );

  it('uses the Eastern week selector whose boundaries are exercised in nflWeekWindow.test.js', () => {
    expect(picksRunner.includes('games = filterNflWeekGames(allGames, currentWeekStart, now);')).toBe(true);
  });
});
