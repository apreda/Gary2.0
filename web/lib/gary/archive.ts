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

interface ArchiveIndexRow {
  date: string;
}

interface ArchiveGameIndexRow extends ArchiveIndexRow {
  away_team: string | null;
  home_team: string | null;
  pick: string | null;
}

interface ArchiveInsightIndexRow extends ArchiveIndexRow {
  headline: string | null;
  detail: string | null;
}

export interface ArchiveDay {
  picks: GaryPick[];
  props: PropPick[];
  insights: InsightRow[];
  gameResults: GameResultRow[];
  propResults: PropResultRow[];
}

export interface ArchiveDateSummary {
  date: string;
  hasGamePicks: boolean;
  hasProps: boolean;
  hasResearch: boolean;
}

export interface ArchiveDayStats {
  gamePicks: number;
  propPicks: number;
  insights: number;
  gradedResults: number;
  totalItems: number;
  substantive: boolean;
}

type ArchiveEditorialContent = {
  picks: GaryPick[];
  props: PropPick[];
  insights: Array<{ headline?: string | null; detail?: string | null }>;
};

type ArchiveIndexSources = {
  games: ArchiveGameIndexRow[];
  props: ArchiveIndexRow[];
  insights: ArchiveInsightIndexRow[];
};

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

/** Strict yyyy-MM archive bucket that is not later than the supplied ET month. */
export function isArchiveMonth(value: string, today = todayEST()): boolean {
  if (!/^\d{4}-\d{2}$/.test(value) || value > today.slice(0, 7)) return false;
  const [year, month] = value.split('-').map(Number);
  return year >= 1 && month >= 1 && month <= 12;
}

/** Calendar labels use UTC noon so no runtime timezone can shift the date. */
export function archiveDateLabel(value: string): string {
  if (!isArchiveDate(value, value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function archiveMonthLabel(value: string): string {
  if (!isArchiveMonth(value, `${value}-01`)) return value;
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
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

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function meaningfulGamePick(pick: GaryPick): boolean {
  return Boolean(cleanText(pick.pick) && cleanText(pick.awayTeam) && cleanText(pick.homeTeam));
}

function meaningfulPropPick(prop: PropPick): boolean {
  return Boolean(cleanText(prop.player) && (cleanText(prop.bet) || cleanText(prop.prop)));
}

function meaningfulInsight(insight: { headline?: string | null; detail?: string | null }): boolean {
  return `${cleanText(insight.headline)} ${cleanText(insight.detail)}`.trim().length >= 30;
}

/**
 * One unique prediction can carry enough original analysis to stand alone;
 * otherwise a date needs at least two meaningful editorial items. Graded rows
 * are evidence for the board, not a substitute for the board itself.
 */
export function archiveEditorialStats(content: ArchiveEditorialContent) {
  const picks = content.picks.filter(meaningfulGamePick);
  const props = content.props.filter(meaningfulPropPick);
  const insights = content.insights.filter(meaningfulInsight);
  const hasLongForm = picks.some(pick =>
    `${cleanText(pick.rationale_plain)} ${cleanText(pick.rationale)}`.trim().length >= 80,
  ) || props.some(prop =>
    `${cleanText(prop.rationale)} ${cleanText(prop.analysis)} ${(prop.key_stats ?? []).join(' ')}`.trim().length >= 80,
  ) || insights.some(insight =>
    `${cleanText(insight.headline)} ${cleanText(insight.detail)}`.trim().length >= 80,
  );
  const total = picks.length + props.length + insights.length;

  return {
    gamePicks: picks.length,
    propPicks: props.length,
    insights: insights.length,
    substantive: total >= 2 || hasLongForm,
  };
}

export function archiveDayStats(day: ArchiveDay): ArchiveDayStats {
  const editorial = archiveEditorialStats(day);
  const gradedResults = day.gameResults.length + day.propResults.length;
  return {
    ...editorial,
    gradedResults,
    totalItems: editorial.gamePicks + editorial.propPicks + editorial.insights + gradedResults,
  };
}

/** Closest substantive archive dates around `current`; input order is irrelevant. */
export function adjacentArchiveDates(
  dates: string[],
  current: string,
): { previous: string | null; next: string | null } {
  const ordered = [...new Set(dates)].sort((a, b) => b.localeCompare(a));
  return {
    previous: ordered.find(date => date < current) ?? null,
    next: [...ordered].reverse().find(date => date > current) ?? null,
  };
}

/**
 * Pure, lightweight index builder used by the archive and sitemap. A row in
 * `pick_page_index` already represents a real published game call. Non-empty
 * prop rows contribute a conservative minimum of one item because the index
 * intentionally does not download the JSON body. Research text is small
 * enough to validate exactly. Requiring two known meaningful items prevents
 * the sitemap from advertising an empty, thin, or noindex archive leaf.
 */
export function buildArchiveDateSummaries(
  sources: ArchiveIndexSources,
  today = todayEST(),
): ArchiveDateSummary[] {
  const games = new Map<string, Set<string>>();
  const props = new Set<string>();
  const research = new Map<string, number>();

  for (const row of sources.games) {
    if (!isArchiveDate(row.date, today) || !row.away_team || !row.home_team || !row.pick) continue;
    const key = [row.away_team, row.home_team, row.pick]
      .map(value => value.trim().toLowerCase())
      .join('|');
    games.set(row.date, new Set([...(games.get(row.date) ?? []), key]));
  }
  for (const row of sources.props) if (isArchiveDate(row.date, today)) props.add(row.date);
  for (const row of sources.insights) {
    if (isArchiveDate(row.date, today) && meaningfulInsight(row)) {
      research.set(row.date, (research.get(row.date) ?? 0) + 1);
    }
  }

  const dates = mergeArchiveDates([
    [...games.keys()],
    [...props],
    [...research.keys()],
  ], today);

  return dates.flatMap(date => {
    const gameCount = games.get(date)?.size ?? 0;
    const hasGamePicks = gameCount > 0;
    const hasProps = props.has(date);
    const researchCount = research.get(date) ?? 0;
    const hasResearch = researchCount > 0;
    const knownMeaningfulItems = gameCount + (hasProps ? 1 : 0) + researchCount;
    if (knownMeaningfulItems < 2) return [];
    return [{
      date,
      hasGamePicks,
      hasProps,
      hasResearch,
    }];
  });
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

export async function fetchArchiveDay(date: string, revalidate = 3600): Promise<ArchiveDay> {
  const [picks, props, insights, gameResults, propResults] = await Promise.all([
    fetchArchiveGamePicks(date, revalidate),
    fetchArchivePropPicks(date, revalidate),
    fetchArchiveInsights(date, revalidate),
    fetchArchiveGameResults(date, revalidate),
    fetchArchivePropResults(date, revalidate),
  ]);
  return { picks, props, insights, gameResults, propResults };
}

/** Dates whose stored board contains original analysis or multiple real items. */
export async function fetchArchiveDateSummaries(revalidate = 3600): Promise<ArchiveDateSummary[]> {
  const [games, props, insights] = await Promise.all([
    // Never scan the historical JSON bodies here. These narrow indexes stay
    // cacheable as the archive grows and keep production prerenders bounded.
    restAll<ArchiveGameIndexRow>(
      'pick_page_index?select=date,away_team,home_team,pick&order=date.desc,away_team.asc,home_team.asc,pick.asc',
      { revalidate },
    ),
    restAll<ArchiveIndexRow>(
      'prop_picks?select=date&picks=not.eq.%5B%5D&order=date.desc',
      { revalidate },
    ),
    restAll<ArchiveInsightIndexRow>(
      'insight_connections?select=date,headline,detail&or=(headline.not.is.null,detail.not.is.null)&order=date.desc,id.asc',
      { revalidate },
    ),
  ]);
  return buildArchiveDateSummaries({ games, props, insights });
}

/** Substantive public board dates; no mutation or pipeline hook. */
export async function fetchArchiveDates(revalidate = 3600): Promise<string[]> {
  return (await fetchArchiveDateSummaries(revalidate)).map(summary => summary.date);
}
