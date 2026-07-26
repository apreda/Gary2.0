// THE STREAK — transition math + the settle-path writer.
//
// One play a day: win extends, loss resets, push/void holds, a missed day
// holds (only a loss breaks a streak). user_streaks is written ONLY here
// (service role) the moment a streak play settles — the client never
// computes it, so the number is as unfakeable as the ledger under it.
//
// Re-grade safety (the grader re-grades every run): prev_current stores the
// streak's value BEFORE the last counted day, so a same-day status flip
// (won -> lost, lost -> won, either -> push) REWINDS that day and applies
// the new result. Same-day same-result repeats are no-ops.

export type StreakRow = {
  current: number;
  best: number;
  prev_current: number;
  last_counted_date: string | null;
  last_result: string | null;
};

/**
 * Pure transition. Returns the NEW row state, or null when nothing changes
 * (push/void on a fresh day, or a same-day repeat of the same result).
 */
export function applyStreakResult(
  prev: StreakRow | null,
  gameDate: string,
  status: string,
): StreakRow | null {
  const s = prev ?? { current: 0, best: 0, prev_current: 0, last_counted_date: null, last_result: null };
  const sameDay = s.last_counted_date === gameDate;
  const norm = String(status || "").toLowerCase();

  if (sameDay && s.last_result === norm) return null;      // idempotent repeat

  // Base to apply the day's result to: rewound on a same-day re-grade,
  // otherwise the live streak.
  const base = sameDay ? s.prev_current : s.current;

  if (norm === "push" || norm === "void") {
    if (!sameDay) return null;                             // fresh push/void: day never counts
    // Re-grade to push: the day un-counts entirely.
    return { current: base, best: s.best, prev_current: s.prev_current,
      last_counted_date: gameDate, last_result: norm };
  }

  const current = norm === "won" ? base + 1 : 0;
  return {
    current,
    best: Math.max(s.best, current),
    prev_current: sameDay ? s.prev_current : s.current,
    last_counted_date: gameDate,
    last_result: norm,
  };
}

/**
 * Fetch-apply-upsert for one settled streak play. Never throws.
 * Returns the post-update row (the prior row when nothing changed), or
 * null on failure — callers use `current` for the settle push copy.
 */
export async function updateUserStreak(
  sbBase: string, sbHeaders: Record<string, string>,
  userId: string, gameDate: string, status: string,
): Promise<StreakRow | null> {
  try {
    const res = await fetch(
      `${sbBase}/rest/v1/user_streaks?user_id=eq.${userId}` +
      `&select=current,best,prev_current,last_counted_date,last_result`,
      { headers: sbHeaders },
    );
    if (!res.ok) return null;
    const rows: StreakRow[] = await res.json();
    const prev = rows[0] ?? { current: 0, best: 0, prev_current: 0, last_counted_date: null, last_result: null };
    const next = applyStreakResult(rows[0] ?? null, gameDate, status);
    if (!next) return prev; // no change needed is a success

    const up = await fetch(`${sbBase}/rest/v1/user_streaks`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, ...next, updated_at: new Date().toISOString() }),
    });
    return up.ok ? next : null;
  } catch (e) {
    console.warn(`[Streaks] update failed for ${userId}: ${(e as Error).message}`);
    return null;
  }
}
