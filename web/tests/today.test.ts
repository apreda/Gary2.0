import { describe, expect, it } from 'vitest';
import type { BoardGame } from '@/lib/gary/board';
import type { InsightRow } from '@/lib/gary/types';
import { selectHubHighlights, summarizeBoard } from '@/lib/today/model';

const game = (overrides: Partial<BoardGame>): BoardGame => ({
  key: 'game',
  league: 'MLB',
  away: 'Away',
  home: 'Home',
  commence: null,
  venue: null,
  spread: null,
  mlHome: null,
  mlAway: null,
  total: null,
  pick: null,
  ...overrides,
});

const insight = (overrides: Partial<InsightRow>): InsightRow => ({
  id: 1,
  date: '2026-09-01',
  league: 'MLB',
  category: 'hot',
  headline: 'Hot bat',
  detail: null,
  game: 'A @ B',
  value: null,
  tone: null,
  spark: null,
  line_val: null,
  relevance_score: 0.5,
  player_id: null,
  team_id: null,
  game_id: null,
  result: null,
  result_note: null,
  ...overrides,
});

describe('summarizeBoard', () => {
  it('keeps league order and counts games and posted calls', () => {
    const summaries = summarizeBoard([
      game({ key: '1', league: 'MLB', commence: '2026-09-01T23:00:00Z', pick: { pick: 'A ML' } }),
      game({ key: '2', league: 'MLB', commence: '2026-09-01T20:00:00Z' }),
      game({ key: '3', league: 'NFL', commence: '2026-09-02T00:00:00Z', pick: { pick: 'B +3' } }),
    ]);

    expect(summaries).toEqual([
      { league: 'MLB', games: 2, posted: 1, nextStart: '2026-09-01T20:00:00Z' },
      { league: 'NFL', games: 1, posted: 1, nextStart: '2026-09-02T00:00:00Z' },
    ]);
  });

  it('handles an empty board', () => {
    expect(summarizeBoard([])).toEqual([]);
  });
});

describe('selectHubHighlights', () => {
  it('drops unknown categories and orders by relevance', () => {
    const rows = [
      insight({ id: 1, category: 'unknown', relevance_score: 1 }),
      insight({ id: 2, category: 'regression', relevance_score: 0.8 }),
      insight({ id: 3, category: 'hot', relevance_score: 0.9 }),
      insight({ id: 4, category: 'h2h', relevance_score: 0.7 }),
    ];

    expect(selectHubHighlights(rows, 2).map(item => [item.lane, item.row.id])).toEqual([
      ['hot', 3],
      ['regression', 2],
    ]);
  });

  it('supports an empty or zero-length selection', () => {
    expect(selectHubHighlights([])).toEqual([]);
    expect(selectHubHighlights([insight({})], 0)).toEqual([]);
  });
});
