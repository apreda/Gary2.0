import { estDateStr, todayEST } from './dates';
import { parsePicksJson } from './picks';
import { mergeGameResults } from './results';
import { rest, restAll } from './supabase';
import type {
  GameResultRow,
  GaryPick,
  InsightRow,
  NflResultRow,
  PropPick,
  PropResultRow,
} from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface DatedPicksRow {
  date: string;
  picks: unknown;
}

interface WeeklyPicksRow {
  week_start: string;
  picks: unknown;
}

interface DateRow {
  date: string;
}

/** Strict real yyyy-MM-dd that is not later than the supplied ET day. */
export function isArchiveDate(value: string, today = todayEST()): boolean {
  if (!ISO_DATE.test(value) || value > today) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function assertQueryDate(value: string) {
  if (!isArchiveDate(value)) throw new Error('Invalid archive date');
}

/** Weekly cards belong only on the ET calendar date of each game. */
export function filterWeeklyPicksForDate(picks: GaryPick[], date: string): GaryPick[] {
  return picks.filter(pick => {
    if (!pick.commence_time) return false;
    const start = new Date(pick.commence_time);
    return Number.isFinite(start.getTime()) && estDateStr(start) === date;
  });
}

function archivePickKey(pick: GaryPick): string {
  if (pick.pick_id) return `id:${pick.pick_id}`;
  return [pick.awayTeam, pick.homeTeam, pick.pick, pick.commence_time]
    .map(value => (value ?? '').trim().toLowerCase())
    .join('|');
}

/** Dedupe daily/weekly overlap without presenting the fallback as public identity. */
export function dedupeArchivePicks(picks: GaryPick[]): GaryPick[] {
  const seen = new Set<string>();
  return picks.filter(pick => {
    const key = archivePickKey(pick);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mergeArchiveDates(
  groups: string[][],
  today = todayEST(),
): string[] {
  const dates = new Set<string>();
  for (const group of groups) {
    for (const date of group) {
      if (isArchiveDate(date, today)) dates.add(date);
    }
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

export async function fetchArchiveGamePicks(date: string, revalidate = 3600): Promise<GaryPick[]> {
  assertQueryDate(date);
  const [dailyRows, weeklyRows] = await Promise.all([
    rest<DatedPicksRow[]>(
      `daily_picks?select=date,picks&date=eq.${date}`,
      { revalidate },
    ),
    rest<WeeklyPicksRow[]>(
      `weekly_nfl_picks?select=week_start,picks&week_start=lte.${date}&order=week_start.desc&limit=1`,
      { revalidate },
    ),
  ]);

  const daily = dailyRows.flatMap(row => parsePicksJson<GaryPick>(row.picks));
  const weekly = weeklyRows.flatMap(row =>
    filterWeeklyPicksForDate(parsePicksJson<GaryPick>(row.picks), date),
  );
  return dedupeArchivePicks([...daily, ...weekly]);
}

export async function fetchArchivePropPicks(date: string, revalidate = 3600): Promise<PropPick[]> {
  assertQueryDate(date);
  const rows = await rest<DatedPicksRow[]>(
    `prop_picks?select=date,picks&date=eq.${date}`,
    { revalidate },
  );
  return rows.flatMap(row => parsePicksJson<PropPick>(row.picks));
}

export async function fetchArchiveInsights(date: string, revalidate = 3600): Promise<InsightRow[]> {
  assertQueryDate(date);
  return rest<InsightRow[]>(
    `insight_connections?select=*&date=eq.${date}&order=relevance_score.desc.nullslast`,
    { revalidate },
  );
}

export async function fetchArchiveGameResults(date: string, revalidate = 3600): Promise<GameResultRow[]> {
  assertQueryDate(date);
  const [games, nfl] = await Promise.all([
    rest<GameResultRow[]>(
      `game_results?select=game_date,league,matchup,pick_text,result,final_score,confidence&game_date=eq.${date}&result=not.is.null`,
      { revalidate },
    ),
    rest<NflResultRow[]>(
      `nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,season_type,home_team,away_team,home_score,away_score&game_date=eq.${date}&result=not.is.null`,
      { revalidate },
    ),
  ]);
  return mergeGameResults(nfl, games);
}

export async function fetchArchivePropResults(date: string, revalidate = 3600): Promise<PropResultRow[]> {
  assertQueryDate(date);
  return rest<PropResultRow[]>(
    `prop_results?select=game_date,player_name,prop_type,line_value,actual_value,result,odds,pick_text,matchup,bet&game_date=eq.${date}&result=not.is.null&order=player_name.asc`,
    { revalidate },
  );
}

/** Dates with a stored game, prop, or weekly board; no mutation or pipeline hook. */
export async function fetchArchiveDates(revalidate = 3600): Promise<string[]> {
  const [daily, props, weekly] = await Promise.all([
    restAll<DateRow>('daily_picks?select=date&order=date.desc', { revalidate }),
    restAll<DateRow>('prop_picks?select=date&order=date.desc', { revalidate }),
    restAll<WeeklyPicksRow>('weekly_nfl_picks?select=week_start,picks&order=week_start.desc', { revalidate }),
  ]);
  const weeklyDates = weekly.flatMap(row =>
    parsePicksJson<GaryPick>(row.picks).flatMap(pick => {
      if (!pick.commence_time) return [];
      const start = new Date(pick.commence_time);
      return Number.isFinite(start.getTime()) ? [estDateStr(start)] : [];
    }),
  );
  return mergeArchiveDates([
    daily.map(row => row.date),
    props.map(row => row.date),
    weeklyDates,
  ]);
}
