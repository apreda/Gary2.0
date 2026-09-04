import { rest } from './supabase';
import { todayEST } from './dates';
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

/** All of today's game picks (daily_picks + current weekly_nfl_picks when in week). */
export async function fetchTodayGamePicks(revalidate = 600): Promise<GaryPick[]> {
  const date = todayEST();
  const [rows, weekly] = await Promise.all([
    rest<DailyPicksRow[]>(
      `daily_picks?select=date,picks&date=eq.${date}`, { revalidate },
    ),
    rest<WeeklyNflPicksRow[]>(
      `weekly_nfl_picks?select=week_start,picks&order=week_start.desc&limit=1`, { revalidate },
    ),
  ]);
  const picks = rows.flatMap(r => parsePicksJson<GaryPick>(r.picks));

  // NFL is weekly — include the most recent week's picks only if today falls
  // inside that week (week_start .. week_start+6).
  if (weekly.length > 0) {
    const start = new Date(`${weekly[0].week_start}T12:00:00Z`).getTime();
    const today = new Date(`${date}T12:00:00Z`).getTime();
    if (today >= start && today < start + 7 * 86400000) {
      picks.push(...parsePicksJson<GaryPick>(weekly[0].picks));
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

/**
 * The long shot (sport 'MLB HR'): one home run a game, priced for the fun of
 * it. It publishes as a pick card beside that game's props (founder, Sep 3
 * 2026) and never counts in the props record.
 */
export function isLongShot(p: PropPick): boolean {
  return normalizeLeague(p.league, p.sport) === 'MLB HR';
}
