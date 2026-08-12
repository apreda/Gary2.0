import {
  effectiveOdds,
  fetchAllGameResults,
  fetchAllPropResults,
  isLegitPropResult,
  unitsFor,
} from '@/lib/gary/results';
import { daysAgoEST } from '@/lib/gary/dates';
import { SEASON_START } from './model';
import type { BoardRow } from './api';

/**
 * Gary as an official comparator on the leaderboard (iOS
 * fetchGaryLeaderboardRow) — derived from the PUBLIC graded ledger, not a fake
 * auth account. Games + core props; the HR fun lane never counts, same as the
 * official record. Server-side because it walks the full results history
 * (ISR-cached fetches), then handed to the client board as plain props.
 */

interface Settled {
  date: string;
  result: string;
  units: number;
}

function boardRowFrom(rows: Settled[]): BoardRow | null {
  if (rows.length === 0) return null;
  const wins = rows.filter(r => r.result === 'won').length;
  const losses = rows.filter(r => r.result === 'lost').length;
  const pushes = rows.filter(r => r.result === 'push').length;
  let running = 0, best = 0;
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.result === 'won') { running += 1; best = Math.max(best, running); }
    else if (r.result === 'lost') running = 0;
  }
  return {
    display_name: 'GARY A.I.',
    wins,
    losses,
    pushes,
    units: Math.round(rows.reduce((s, r) => s + r.units, 0) * 100) / 100,
    best_streak: best,
  };
}

export type GaryRows = Record<'7d' | '30d' | 'season', BoardRow | null>;

export async function garyBoardRows(): Promise<GaryRows> {
  const [games, props] = await Promise.all([
    fetchAllGameResults().catch(() => []),
    fetchAllPropResults().catch(() => []),
  ]);

  const settled: Settled[] = [];
  for (const g of games) {
    const result = (g.result ?? '').trim().toLowerCase();
    if (!['won', 'lost', 'push'].includes(result)) continue;
    settled.push({
      date: g.game_date ?? '',
      result,
      units: unitsFor(result, effectiveOdds(g.pick_text)),
    });
  }
  for (const p of props.filter(isLegitPropResult)) {
    // HR = the fun lane, never part of the official props record.
    if ((p.prop_type ?? '').toLowerCase().includes('home_run')) continue;
    const result = (p.result ?? '').trim().toLowerCase();
    if (!['won', 'lost', 'push'].includes(result)) continue;
    settled.push({
      date: p.game_date ?? '',
      result,
      units: unitsFor(result, effectiveOdds(p.pick_text, p.odds)),
    });
  }

  const since = { '7d': daysAgoEST(7), '30d': daysAgoEST(30), season: SEASON_START } as const;
  return {
    '7d': boardRowFrom(settled.filter(r => r.date >= since['7d'])),
    '30d': boardRowFrom(settled.filter(r => r.date >= since['30d'])),
    season: boardRowFrom(settled.filter(r => r.date >= since.season)),
  };
}
