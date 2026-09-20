import { easternDate, easternHour, shiftDateKey } from '../../supabase/functions/_shared/dateKeys.js';

/** NFL's existing Tue–Mon window, with the Tuesday 5 AM completion allowance. */
export function filterNflWeekGames(games, weekStart, now = new Date()) {
  const today = easternDate(now);
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  const weekEnd = shiftDateKey(weekStart, 7);
  return (games || []).filter(game => {
    const time = new Date(game.commence_time);
    if (!Number.isFinite(time.getTime()) || time < now) return false;
    const date = easternDate(time);
    if (monday) return date === today;
    return date >= weekStart && (date < weekEnd || (date === weekEnd && easternHour(time) < 5));
  });
}
