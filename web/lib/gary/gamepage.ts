import {
  fetchArchiveDates,
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
  return (s ?? '').toLowerCase().replace(ODDS_TAIL, '').replace(/\s+/g, ' ').trim();
}

/**
 * The graded row for a pick. Exact pick text (odds ignored) inside the same
 * league is the contract the grader writes; the matchup fallback catches a
 * re-priced pick and still requires both clubs so Red Sox never answers for
 * White Sox.
 */
export function matchPickResult(pick: GaryPick, results: GameResultRow[]): GameResultRow | null {
  const league = normalizeLeague(pick.league, pick.sport);
  const want = normalizePickText(pick.pick);
  const inLeague = results.filter(r => !league || normalizeLeague(r.league) === league);
  const exact = inLeague.find(r => normalizePickText(r.pick_text) === want);
  if (exact) return exact;
  return (
    inLeague.find(
      r =>
        r.matchup &&
        sameTeam(pick.awayTeam, r.matchup.split(/@|vs\.?/i)[0]) &&
        sameTeam(pick.homeTeam, r.matchup.split(/@|vs\.?/i)[1]) &&
        normalizePickText(r.pick_text).split(' ')[0] === want.split(' ')[0],
    ) ?? null
  );
}

/** Props written for this game: the prop's matchup names both clubs. */
export function propsForGame(props: PropPick[], pick: GaryPick): PropPick[] {
  return props.filter(pr => {
    const m = pr.matchup ?? '';
    if (!m) return false;
    return sameTeam(pick.awayTeam, m.split(/@|vs\.?/i)[0]) && sameTeam(pick.homeTeam, m.split(/@|vs\.?/i)[1] ?? m);
  });
}

/** A prop's graded row: same player, and the bet or prop type appears in the graded text. */
export function matchPropResult(prop: PropPick, results: PropResultRow[]): PropResultRow | null {
  const player = (prop.player ?? '').trim().toLowerCase();
  if (!player) return null;
  const type = (prop.prop ?? '').toLowerCase();
  return (
    results.find(r => {
      if ((r.player_name ?? '').trim().toLowerCase() !== player) return false;
      const hay = `${r.prop_type ?? ''} ${r.pick_text ?? ''} ${r.bet ?? ''}`.toLowerCase();
      return !type || hay.includes(type.split('_')[0]);
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

/** One-line summary for <meta name="description">: the read's first sentence, capped, never mid-word. */
export function pageSummary(pick: GaryPick, max = 155): string {
  const src = (pick.rationale_plain ?? pick.rationale ?? '').replace(/^Gary's Take\s*/i, '').replace(/\s+/g, ' ').trim();
  const firstBlock = src.split(/(?<=[.!?])\s+/)[0] ?? '';
  const text = firstBlock.replace(/^[A-Z][A-Z &/'-]{2,40}:\s*/, '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}`;
}

/* ── Data ─────────────────────────────────────────────────────────────────── */

export interface GameDay {
  date: string;
  leagueCode: string;
  picks: GaryPick[];
  results: GameResultRow[];
  slate: SlateRow[];
}

export async function fetchGameDay(sportSlug: string, date: string): Promise<GameDay | null> {
  const cfg = sportBySlug(sportSlug);
  if (!cfg || !isArchiveDate(date)) return null;
  const [allPicks, results, slate] = await Promise.all([
    fetchArchiveGamePicks(date),
    fetchArchiveGameResults(date).catch(() => [] as GameResultRow[]),
    fetchDailySlate(date, 3600).catch(() => [] as SlateRow[]),
  ]);
  const picks = allPicks.filter(p => isGamePick(p) && normalizeLeague(p.league, p.sport) === cfg.code);
  if (picks.length === 0) return null;
  return {
    date,
    leagueCode: cfg.code,
    picks: [...picks].sort((a, b) => (a.commence_time ?? '').localeCompare(b.commence_time ?? '')),
    results: results.filter(r => normalizeLeague(r.league) === cfg.code),
    slate: slate.filter(r => normalizeLeague(r.league) === cfg.code),
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

/** Every game page URL the site can render, from the light `pick_page_index` view. */
export function gamePagePaths(rows: PickIndexRow[]): GamePagePath[] {
  const seen = new Set<string>();
  const out: GamePagePath[] = [];
  for (const r of rows) {
    const code = normalizeLeague(r.league, r.sport);
    const cfg = code ? sportByCode(code) : undefined;
    if (!cfg || !r.date || !r.away_team || !r.home_team) continue;
    const slug = gameSlug(r.away_team, r.home_team);
    const key = `${cfg.slug}|${r.date}|${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sport: cfg.slug, date: r.date, slug });
  }
  return out;
}

export async function fetchPickIndex(revalidate = 3600): Promise<PickIndexRow[]> {
  return restAll<PickIndexRow>('pick_page_index?select=date,league,sport,away_team,home_team&order=date.desc', {
    revalidate,
  });
}

/** Dates on which this league had at least one game pick, newest first. */
export async function fetchLeagueDates(leagueCode: string, revalidate = 3600): Promise<string[]> {
  const rows = await rest<{ date: string; league: string | null; sport: string | null }[]>(
    `pick_page_index?select=date,league,sport&order=date.desc&limit=1000`,
    { revalidate },
  ).catch(() => []);
  const dates = new Set<string>();
  for (const r of rows) if (normalizeLeague(r.league, r.sport) === leagueCode) dates.add(r.date);
  return [...dates].sort((a, b) => b.localeCompare(a));
}
