import { describe, expect, it } from 'vitest';
import { datasetTemporalCoverage, resultsDataset } from '@/app/results/audit/page';
import type { GameResultRow, PropResultRow } from '@/lib/gary/types';

const game = (game_date: string | null): GameResultRow => ({
  game_date,
  league: 'MLB',
  matchup: 'Cubs @ Reds',
  pick_text: 'Cubs ML -118',
  result: 'won',
  final_score: '6-3',
  confidence: 0.7,
});

const prop = (game_date: string | null): PropResultRow => ({
  game_date,
  player_name: 'A Player',
  prop_type: 'hits',
  line_value: 1.5,
  actual_value: 2,
  result: 'won',
  odds: '-110',
  pick_text: 'A Player over 1.5 hits',
  matchup: 'Cubs @ Reds',
  bet: 'Over',
});

describe('results audit dataset coverage', () => {
  it('uses the earliest and latest real dates already present in the ledger', () => {
    expect(datasetTemporalCoverage(
      [game('2026-08-20'), game(null), game('not-a-date')],
      [prop('2026-06-01'), prop('2026-09-02')],
    )).toBe('2026-06-01/2026-09-02');
  });

  it('omits temporal coverage when the ledger has no dated rows', () => {
    expect(datasetTemporalCoverage([game(null)], [prop(null)])).toBeUndefined();
  });

  it('does not claim a data license that the site has not granted', () => {
    expect(resultsDataset([game('2026-08-20')], [])).not.toHaveProperty('license');
  });
});
