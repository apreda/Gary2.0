import { laneFromCategory, type LaneKey } from '@/lib/gary/hub';
import type { BoardGame } from '@/lib/gary/board';
import type { InsightRow } from '@/lib/gary/types';

export interface BoardSummary {
  league: string;
  games: number;
  posted: number;
  nextStart: string | null;
}

/** Compact, first-pitch-ordered status for the read-only Today desk. */
export function summarizeBoard(games: BoardGame[]): BoardSummary[] {
  const byLeague = new Map<string, BoardSummary>();

  for (const game of games) {
    if (!game.league) continue;
    const current = byLeague.get(game.league) ?? {
      league: game.league,
      games: 0,
      posted: 0,
      nextStart: null,
    };
    current.games += 1;
    if (game.pick) current.posted += 1;
    if (game.commence && (!current.nextStart || game.commence < current.nextStart)) {
      current.nextStart = game.commence;
    }
    byLeague.set(game.league, current);
  }

  return [...byLeague.values()];
}

export interface HubHighlight {
  lane: LaneKey;
  row: InsightRow;
}

/** Highest-relevance recognized Hub reads; unknown categories stay omitted. */
export function selectHubHighlights(rows: InsightRow[], limit = 3): HubHighlight[] {
  return rows
    .flatMap(row => {
      const lane = laneFromCategory(row.category);
      return lane ? [{ lane, row }] : [];
    })
    .sort((a, b) =>
      (b.row.relevance_score ?? 0) - (a.row.relevance_score ?? 0) ||
      a.row.id - b.row.id,
    )
    .slice(0, Math.max(0, limit));
}
