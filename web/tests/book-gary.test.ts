import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { garyBoardRows } from '@/lib/book/gary';
import { fetchAllGameResults, fetchAllPropResults } from '@/lib/gary/results';
import type { GameResultRow, PropResultRow } from '@/lib/gary/types';

vi.mock('@/lib/gary/results', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/gary/results')>();
  return { ...actual, fetchAllGameResults: vi.fn(), fetchAllPropResults: vi.fn() };
});

function game(date: string, result = 'won'): GameResultRow {
  return {
    game_date: date, league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs ML +100',
    result, final_score: '3-1', confidence: 0.6,
  };
}

function prop(overrides: Partial<PropResultRow> = {}): PropResultRow {
  return {
    game_date: '2026-09-04', sport: 'MLB', player_name: 'Pitcher', prop_type: 'pitcher_home_runs',
    line_value: 0.5, actual_value: 0, result: 'won', odds: '+100', pick_text: null,
    matchup: 'Cubs @ Reds', bet: 'Under', ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-04T05:30:00Z')); // September 4, 01:30 Eastern.
  vi.mocked(fetchAllGameResults).mockResolvedValue([]);
  vi.mocked(fetchAllPropResults).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('Gary leaderboard comparator', () => {
  it('uses the same inclusive 7-day and 30-day calendar windows before the slate rollover', async () => {
    vi.mocked(fetchAllGameResults).mockResolvedValue([
      game('2026-08-28'),
      game('2026-08-29', 'lost'),
      game('2026-09-04'),
      game('2026-08-05'),
      game('2026-08-06', 'push'),
      game('2026-09-05'), // Future grades must not enter any current comparator.
      game('2026-02-28'),
      game('2026-03-01', 'lost'),
    ]);

    const rows = await garyBoardRows();
    expect(rows['7d']).toMatchObject({ wins: 1, losses: 1, pushes: 0, units: 0 });
    expect(rows['30d']).toMatchObject({ wins: 2, losses: 1, pushes: 1, units: 1 });
    expect(rows.season).toMatchObject({ wins: 3, losses: 2, pushes: 1, units: 1 });
  });

  it('starts a new calendar-year season without counting last year or tomorrow', async () => {
    vi.setSystemTime(new Date('2027-01-01T06:30:00Z'));
    vi.mocked(fetchAllGameResults).mockResolvedValue([
      game('2026-12-31'), game('2027-01-01', 'lost'), game('2027-01-02'),
    ]);

    expect((await garyBoardRows()).season).toMatchObject({ wins: 0, losses: 1, units: -1 });
  });

  it('uses one calendar snapshot even if the data reads cross Eastern midnight', async () => {
    vi.setSystemTime(new Date('2026-09-05T03:59:00Z'));
    vi.mocked(fetchAllGameResults).mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-09-05T04:01:00Z'));
      return [game('2026-08-29', 'lost'), game('2026-09-04'), game('2026-09-05')];
    });

    expect((await garyBoardRows())['7d']).toMatchObject({ wins: 1, losses: 1, units: 0 });
  });

  it('keeps core pitcher home-run props while excluding the HR lane, invalid rows and ungraded games', async () => {
    vi.mocked(fetchAllGameResults).mockResolvedValue([game('2026-09-04', 'pending')]);
    vi.mocked(fetchAllPropResults).mockResolvedValue([
      prop(),
      prop({ sport: 'MLB HR', prop_type: 'batter_home_runs' }),
      prop({ prop_type: 'home_runs' }),
      prop({ player_name: null, prop_type: null, bet: null, line_value: null }),
      prop({ game_date: '2026-09-05' }),
    ]);

    const rows = await garyBoardRows();
    for (const row of Object.values(rows)) {
      expect(row).toMatchObject({ wins: 1, losses: 0, pushes: 0, units: 1 });
    }
  });

  it('returns no comparator for an empty ledger', async () => {
    expect(await garyBoardRows()).toEqual({ '7d': null, '30d': null, season: null });
  });
});
