import {
  fetchArchiveDates,
  fetchArchiveDayIndex,
  fetchArchiveGamePicks,
  fetchArchiveGameResults,
  fetchArchivePropPicks,
  fetchArchivePropResults,
  isArchiveDate,
} from './archive';
import { fetchDailySlate, type SlateRow } from './board';
import { normalizeLeague, sportByCode, sportBySlug } from './leagues';
import { rest, restAll } from './supabase';
import type { GameResultRow, GaryPick, PropPick, PropResultRow } from './types';

/*
 * Per-game pages — one permanent URL for every pick Gary has ever published:
 *   /picks/<sport>/<yyyy-mm-dd>/<away>-at-<home>
 * The rationale is real, written, unique content; the result is appended from
 * the graded table once the game is final. Every competitor in the category
 * that ranks on Google is built on exactly this page shape. Gary writes forty
 * of these a day and, until now, the site threw them away after 24 hours.
 */

const ODDS_TAIL = /\s*\(?[+-]\d{3,}\)?\s*$/;

/** "Blue Jays" → "blue-jays"; "St. Louis Cardinals" → "st-louis-cardinals". */
export function teamSlug(name?: string | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function gameSlug(away?: string | null, home?: string | null): string {
  return `${teamSlug(away)}-at-${teamSlug(home)}`;
}

/** Inverse of gameSlug. The separator is the literal `-at-` token, which no
 *  club slug contains internally ("athletics" has no hyphens). */
export function parseGameSlug(slug: string): { away: string; home: string } | null {
  const i = slug.indexOf('-at-');
  if (i <= 0) return null;
  const away = slug.slice(0, i);
  const home = slug.slice(i + 4);
  if (!away || !home || !/^[a-z0-9-]+$/.test(slug)) return null;
  return { away, home };
}

/** Join key across feeds — same tolerance the board uses (either name contains the other). */
function teamKey(name?: string | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function sameTeam(a?: string | null, b?: string | null): boolean {
  const x = teamKey(a);
  const y = teamKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function matchupTeams(matchup?: string | null): { away: string; home: string } | null {
  const parts = (matchup ?? '').trim().split(/\s+(?:@|at|vs\.?|versus)\s+/i);
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) return null;
  return { away: parts[0], home: parts[1] };
}

function sameMatchup(away: string | null | undefined, home: string | null | undefined, matchup?: string | null): boolean {
  const teams = matchupTeams(matchup);
  return !!teams && sameTeam(away, teams.away) && sameTeam(home, teams.home);
}

export function isGamePick(p: GaryPick): boolean {
  return (p.type ?? 'game') !== 'prop' && !!p.awayTeam && !!p.homeTeam;
}

/** The picks that belong to one URL: same league, same two clubs (slug-exact first, then containment). */
export function findGamePicks(picks: GaryPick[], leagueCode: string, slug: string): GaryPick[] {
  const parsed = parseGameSlug(slug);
  if (!parsed) return [];
  const inLeague = picks.filter(p => isGamePick(p) && normalizeLeague(p.league, p.sport) === leagueCode);
  const exact = inLeague.filter(p => teamSlug(p.awayTeam) === parsed.away && teamSlug(p.homeTeam) === parsed.home);
  if (exact.length > 0) return exact;
  return inLeague.filter(
    p => sameTeam(p.awayTeam, parsed.away.replace(/-/g, ' ')) && sameTeam(p.homeTeam, parsed.home.replace(/-/g, ' ')),
  );
}

/** Normalize a pick string for matching: lowercase, no trailing odds, single spaces. */
export function normalizePickText(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(ODDS_TAIL, '')
    .replace(/\bmoney\s*line\b/g, 'ml')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The graded row for a pick. A result must belong to the same league and
 * matchup before its pick text can match. This matters for common totals such
 * as "Under 2.5", which can occur several times on one day's board.
 */
export function matchPickResult(pick: GaryPick, results: GameResultRow[]): GameResultRow | null {
  const league = normalizeLeague(pick.league, pick.sport);
  const want = normalizePickText(pick.pick);
  const inMatchup = results.filter(
    r => (!league || normalizeLeague(r.league) === league) && sameMatchup(pick.awayTeam, pick.homeTeam, r.matchup),
  );
  return inMatchup.find(r => normalizePickText(r.pick_text) === want) ?? null;
}

/** Props written for this game: the prop's matchup names both clubs. */
export function propsForGame(props: PropPick[], pick: GaryPick): PropPick[] {
  return props.filter(pr => sameMatchup(pick.awayTeam, pick.homeTeam, pr.matchup));
}

function normalizedPropType(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+[+-]?\d+(?:\.\d+)?$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sameLine(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || a === '' || b == null || b === '') return a == null || a === '';
  const x = Number(a);
  const y = Number(b);
  if (Number.isFinite(x) && Number.isFinite(y)) return x === y;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** A prop's graded row: exact player, matchup, full market, side, and line. */
export function matchPropResult(prop: PropPick, results: PropResultRow[]): PropResultRow | null {
  const player = (prop.player ?? '').trim().toLowerCase();
  const type = normalizedPropType(prop.prop);
  if (!player || !type || !prop.matchup) return null;
  const wantedMatchup = matchupTeams(prop.matchup);
  if (!wantedMatchup) return null;
  const bet = (prop.bet ?? '').trim().toLowerCase();
  return (
    results.find(r => {
      if ((r.player_name ?? '').trim().toLowerCase() !== player) return false;
      if (!sameMatchup(wantedMatchup.away, wantedMatchup.home, r.matchup)) return false;
      if (normalizedPropType(r.prop_type) !== type) return false;
      if (bet && (r.bet ?? '').trim().toLowerCase() !== bet) return false;
      return sameLine(prop.line, r.line_value);
    }) ?? null
  );
}

/** The slate row for this matchup (opening lines), when the day's slate was written. */
export function slateForGame(slate: SlateRow[], pick: GaryPick): SlateRow | null {
  return (
    slate.find(r => sameTeam(r.away_team, pick.awayTeam) && sameTeam(r.home_team, pick.homeTeam)) ?? null
  );
}

/** Previous and next dates that hold a board, around `date`, from a desc-sorted list. */
export function adjacentDates(datesDesc: string[], date: string): { prev: string | null; next: string | null } {
  const older = datesDesc.filter(d => d < date);
  const newer = datesDesc.filter(d => d > date);
  return { prev: older[0] ?? null, next: newer[newer.length - 1] ?? null };
}

/** Find prose before collapsing whitespace, which would turn historical tables into sentences. */
function summaryProse(source?: string): string {
  for (const block of (source ?? '').split(/\r?\n\s*\r?\n/)) {
    const prose = block.split(/\r?\n/).filter(line => {
      // Markdown tables and older fixed-width “TALE OF THE TAPE” rows.
      return !/^\s*#{1,6}\s/.test(line) && !/\||[←→]|\S(?: {2,}|\t+)\S/.test(line);
    }).map(line => line.trim().replace(/\*\*|__/g, '')).filter(line => {
      return line && !/^(?:Gary['’]s Take|TALE OF THE TAPE):?$/i.test(line) &&
        !/^[A-Z][A-Z &/'’-]{2,40}:?$/.test(line) && !/^[-=*_]{3,}$/.test(line);
    }).join(' ').replace(/^Gary['’]s Take\s*:?\s*/i, '')
      .replace(/^[A-Z][A-Z &/'’-]{2,40}:\s*/, '')
      .replace(/\s+/g, ' ').trim();
    if (prose) return prose;
  }
  return '';
}

/** One-line search/Article summary: the first prose sentence, capped, never mid-word. */
export function pageSummary(pick: GaryPick, max = 155): string {
  const src = summaryProse(pick.rationale_plain) || summaryProse(pick.rationale);
  const text = src.split(/(?<=[.!?])\s+/)[0] ?? '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  return cut.slice(0, Math.max(0, cut.lastIndexOf(' '))).trimEnd();
}

/* ── Data ─────────────────────────────────────────────────────────────────── */

export interface GameDay {
  date: string;
  leagueCode: string;
  picks: GaryPick[];
  results: GameResultRow[];
  slate: SlateRow[];
  publishedAt: string | null;
}

export async function fetchGameDay(sportSlug: string, date: string): Promise<GameDay | null> {
  const cfg = sportBySlug(sportSlug);
  if (!cfg || !isArchiveDate(date)) return null;
  // The board's publish time comes from the ONE cached archive index (counts +
  // published_at for every day), never a per-date probe of daily_picks.
  const [allPicks, results, slate, index] = await Promise.all([
    fetchArchiveGamePicks(date),
    fetchArchiveGameResults(date).catch(() => [] as GameResultRow[]),
    fetchDailySlate(date, 3600).catch(() => [] as SlateRow[]),
    fetchArchiveDayIndex().catch(() => []),
  ]);
  const publishedRaw = index.find(r => r.date === date)?.published_at ?? null;
  const publishedAt = publishedRaw && Number.isFinite(new Date(publishedRaw).getTime()) ? publishedRaw : null;
  const picks = allPicks.filter(p => isGamePick(p) && normalizeLeague(p.league, p.sport) === cfg.code);
  if (picks.length === 0) return null;
  return {
    date,
    leagueCode: cfg.code,
    picks: [...picks].sort((a, b) => (a.commence_time ?? '').localeCompare(b.commence_time ?? '')),
    results: results.filter(r => normalizeLeague(r.league) === cfg.code),
    slate: slate.filter(r => normalizeLeague(r.league) === cfg.code),
    publishedAt,
  };
}

export async function fetchGameProps(date: string): Promise<{ props: PropPick[]; results: PropResultRow[] }> {
  const [props, results] = await Promise.all([
    fetchArchivePropPicks(date).catch(() => [] as PropPick[]),
    fetchArchivePropResults(date).catch(() => [] as PropResultRow[]),
  ]);
  return { props, results };
}

export { fetchArchiveDates as fetchBoardDates };

/* ── Sitemap index ────────────────────────────────────────────────────────── */

export interface PickIndexRow {
  date: string;
  league: string | null;
  sport: string | null;
  away_team: string | null;
  home_team: string | null;
}

export interface GamePagePath {
  sport: string;
  date: string;
  slug: string;
}

/** A graded result's permanent analysis URL, when its row identifies both teams. */
export function resultGamePath(row: GameResultRow): string | null {
  const code = normalizeLeague(row.league);
  const cfg = code ? sportByCode(code) : undefined;
  if (!cfg || !row.game_date || !isArchiveDate(row.game_date)) return null;

  const parts = (row.matchup ?? '').trim().split(/\s+(?:@|at|vs\.?|versus)\s+/i);
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) return null;

  return `/picks/${cfg.slug}/${row.game_date}/${gameSlug(parts[0], parts[1])}`;
}

/** Every game page URL the site can render, from the light `pick_page_index` view. */
export function gamePagePaths(rows: PickIndexRow[]): GamePagePath[] {
  const seen = new Set<string>();
  const out: GamePagePath[] = [];
  for (const r of rows) {
    const code = normalizeLeague(r.league, r.sport);
    const cfg = code ? sportByCode(code) : undefined;
    if (!cfg || !isArchiveDate(r.date) || !r.away_team || !r.home_team) continue;
    const slug = gameSlug(r.away_team, r.home_team);
    const key = `${cfg.slug}|${r.date}|${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sport: cfg.slug, date: r.date, slug });
  }
  return out;
}

/** Membership set used to avoid linking old result rows to pages that were never published. */
export function publishedGamePathSet(rows: PickIndexRow[]): Set<string> {
  return new Set(gamePagePaths(rows).map(p => `/picks/${p.sport}/${p.date}/${p.slug}`));
}

export async function fetchPickIndex(revalidate = 3600): Promise<PickIndexRow[]> {
  // The view's unique row_key keeps equal-date rows on stable page boundaries.
  return restAll<PickIndexRow>('pick_page_index?select=date,league,sport,away_team,home_team&order=date.desc,row_key.asc', {
    revalidate,
  });
}

/** Narrow index slice for validating result links without scanning all history. */
export async function fetchPickIndexForDates(
  dates: Array<string | null>,
  revalidate = 3600,
): Promise<PickIndexRow[]> {
  const valid = [...new Set(dates.filter((date): date is string => !!date && isArchiveDate(date)))];
  if (valid.length === 0) return [];
  return restAll<PickIndexRow>(
    `pick_page_index?select=date,league,sport,away_team,home_team&date=in.(${valid.join(',')})&order=date.desc,row_key.asc`,
    { revalidate },
  );
}

/** Dates on which this league had at least one game pick, newest first. */
export async function fetchLeagueDates(leagueCode: string, revalidate = 3600): Promise<string[]> {
  // One row per (day, league) from the grouped view — a few hundred rows for
  // the whole history, so no limit ever truncates the older season.
  const rows = await rest<{ date: string; league: string | null; sport: string | null }[]>(
    `pick_day_index?select=date,league,sport&order=date.desc&limit=1000`,
    { revalidate },
  ).catch(() => []);
  const dates = new Set<string>();
  for (const r of rows) if (normalizeLeague(r.league, r.sport) === leagueCode) dates.add(r.date);
  return [...dates].sort((a, b) => b.localeCompare(a));
}
