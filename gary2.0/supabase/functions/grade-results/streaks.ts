// The database recomputes designated streaks transactionally whenever a bet
// settles or its grade changes. Read that committed state for notification
// copy; never apply arrival-order increments in an edge worker.
export type StreakRow = {
  current: number;
  best: number;
  prev_current: number;
  last_counted_date: string | null;
  last_result: string | null;
};

export type StreakPlay = {
  id: string;
  game_date: string;
  status: string;
};

// Pure reference for the database contract and correction regressions.
export function recomputeStreak(plays: StreakPlay[]): StreakRow {
  const state: StreakRow = { current: 0, best: 0, prev_current: 0, last_counted_date: null, last_result: null };
  for (const play of [...plays].sort((a, b) => a.game_date.localeCompare(b.game_date) || a.id.localeCompare(b.id))) {
    if (play.status === "pending") break;
    if (play.status !== "won" && play.status !== "lost") continue;
    state.prev_current = state.current;
    state.current = play.status === "won" ? state.current + 1 : 0;
    state.best = Math.max(state.best, state.current);
    state.last_counted_date = play.game_date;
    state.last_result = play.status;
  }
  return state;
}

export async function updateUserStreak(
  sbBase: string, sbHeaders: Record<string, string>,
  userId: string, _gameDate: string, _status: string,
): Promise<StreakRow | null> {
  try {
    const res = await fetch(`${sbBase}/rest/v1/user_streaks?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=current,best,prev_current,last_counted_date,last_result`, { headers: sbHeaders });
    if (!res.ok) return null;
    return (await res.json())[0] ?? null;
  } catch (error) {
    console.warn(`[Streaks] read failed: ${(error as Error).message}`);
    return null;
  }
}
