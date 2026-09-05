export { isLongShot } from './prop-lanes';
import { rest } from './supabase';
import { estDateStr, todayEST } from './dates';
import { normalizeLeague } from './leagues';
import type { DailyPicksRow, GaryPick, PropPick, PropPicksRow, WeeklyNflPicksRow } from './types';

/**
 * Port of iOS PicksValue<T> + parsePicksRow (Models.swift:15, SupabaseAPI.swift:858).
 * The picks column is polymorphic: a JSON array OR a stringified JSON array.
 */
export function parsePicksJson<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** A corrupt successful response must not replace the cached game board. */
function parseGamePicksJson(value: unknown): GaryPick[] {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return [];
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('Malformed stored game picks');
    }
  }
  if (!Array.isArray(parsed) || parsed.some(pick => !pick || typeof pick !== 'object' || Array.isArray(pick))) {
    throw new Error('Malformed stored game picks');
  }
  return parsed as GaryPick[];
}

/** Port of iOS topPickCandidates (Views.swift:318): manual flag wins, else max confidence. */
export function selectTopPick(picks: GaryPick[]): GaryPick | null {
  const games = picks.filter(p => (p.type ?? 'game') !== 'prop');
  if (games.length === 0) return null;
  const manual = games.find(p => p.is_top_pick === true);
  if (manual) return manual;
  return games.reduce((best, p) => ((p.confidence ?? 0) > (best.confidence ?? 0) ? p : best));
}

/** Confidence-desc top-N (iOS topProps). */
export function selectTopProps(props: PropPick[], n: number): PropPick[] {
  return [...props].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, n);
}

/** Weekly cards belong only on the ET calendar date of each game. */
export function filterWeeklyPicksForDate(picks: GaryPick[], date: string): GaryPick[] {
  return picks.filter(pick => {
    if (!pick.commence_time) return false;
    const start = new Date(pick.commence_time);
    return Number.isFinite(start.getTime()) && estDateStr(start) === date;
  });
}

/** Today's non-NFL daily picks plus today's games from canonical weekly NFL storage. */
export async function fetchTodayGamePicks(revalidate = 600): Promise<GaryPick[]> {
  const date = todayEST();
  const [rows, weekly] = await Promise.all([
    rest<DailyPicksRow[]>(
      `daily_picks?select=date,picks&date=eq.${date}`, { revalidate },
    ),
    rest<WeeklyNflPicksRow[]>(
      `weekly_nfl_picks?select=week_start,picks&week_start=lte.${date}&order=week_start.desc&limit=1`, { revalidate },
    ),
  ]);
  const picks = rows.flatMap(r => parseGamePicksJson(r.picks))
    .filter(p => normalizeLeague(p.league, p.sport) !== 'NFL');

  // NFL is weekly — include the latest started week's picks only if today falls
  // inside that week (week_start .. week_start+6).
  if (weekly.length > 0) {
    const start = new Date(`${weekly[0].week_start}T12:00:00Z`).getTime();
    const today = new Date(`${date}T12:00:00Z`).getTime();
    if (today >= start && today < start + 7 * 86400000) {
      picks.push(...filterWeeklyPicksForDate(parseGamePicksJson(weekly[0].picks), date));
    }
  }
  return picks;
}

/** All of today's prop picks, flattened across rows. */
export async function fetchTodayPropPicks(revalidate = 600): Promise<PropPick[]> {
  const date = todayEST();
  const rows = await rest<PropPicksRow[]>(
    `prop_picks?select=date,picks&date=eq.${date}`, { revalidate },
  );
  return rows.flatMap(r => parsePicksJson<PropPick>(r.picks));
}
