import { rest, restAll } from './supabase';
import type { GameResultRow, NflResultRow, PropResultRow } from './types';

import { effectiveOdds } from './odds';
export { effectiveOdds } from './odds';

/**
 * Normalize a result string to lowercase, trimmed.
 * The live DB contains rows with mixed-case values (e.g. 'Lost', 'Won').
 * All comparisons use this helper so 'Lost' and 'lost' are treated identically.
 * The strict normalized set is: 'won' | 'lost' | 'push'.
 */
const normResult = (r: string | null | undefined) => (r ?? '').trim().toLowerCase();


function parseAmericanOdds(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const n = parseInt(odds.replace('+', ''), 10);
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
}

/**
 * EXACT port of iOS BillfoldCompute.units (Views.swift:273), including the
 * 0.9-unit fallback for wins with unparseable odds. 1 unit flat stakes.
 */
export function unitsFor(result: string | null | undefined, odds: string | null | undefined): number {
  switch (normResult(result)) {
    case 'won': {
      const american = parseAmericanOdds(odds);
      if (american === null) return 0.9;
      return american > 0 ? american / 100 : 100 / Math.abs(american);
    }
    case 'lost': return -1;
    case 'push': return 0;
    default: return 0;
  }
}

export interface Record_ {
  wins: number; losses: number; pushes: number;
  pct: number;        // win% of decided (pushes excluded), rounded
  netUnits: number;   // flat 1-unit stakes
  graded: number;     // wins + losses + pushes
}

export function computeRecord(rows: GameResultRow[]): Record_ {
  let wins = 0, losses = 0, pushes = 0, netUnits = 0;
  for (const r of rows) {
    const nr = normResult(r.result);
    if (nr === 'won') wins++;
    else if (nr === 'lost') losses++;
    else if (nr === 'push') pushes++;
    else continue;
    netUnits += unitsFor(nr, effectiveOdds(r.pick_text));
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes, netUnits,
    pct: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    graded: wins + losses + pushes,
  };
}

const dedupeKey = (r: GameResultRow) =>
  [r.league, r.game_date, r.matchup, r.pick_text]
    .map(value => (value ?? '').trim().toLowerCase())
    .join('|');

/**
 * NFL results live in BOTH nfl_results (majority) AND game_results (9 legacy
 * stray rows). The two tables have an off-by-one game_date mismatch (kickoff
 * date vs grading date), so a row-identity dedupe key is a no-op for those
 * rows and games would double-count.
 *
 * Fix: nfl_results is the authoritative source for NFL. Drop any row from
 * gameRows whose league is NFL BEFORE merging. The existing key dedupe still
 * guards against intra-table re-grade duplicates within each table.
 *
 * NOTE: nfl_results has NO league column — stamp 'NFL' on merge.
 *
 * Output is sorted game_date DESC — consumers slice "recent" off the top
 * (concatenation order would otherwise lead with months-old NFL rows).
 */
export function mergeGameResults(nflRows: NflResultRow[], gameRows: GameResultRow[]): GameResultRow[] {
  // Drop legacy NFL strays from game_results — off-by-one dates make key
  // dedupe a no-op; nfl_results is the authoritative NFL source.
  const nonNflGameRows = gameRows.filter(r => (r.league ?? '').trim().toUpperCase() !== 'NFL');

  // PRESEASON NEVER COUNTS (founder law, Aug 21 2026). Exhibition football is
  // graded and kept in the table, but it must not reach a record, streak, net,
  // or league tile anywhere. This merge is the single funnel every public
  // record derives from, so the law is enforced once, here.
  const counting = (r: GameResultRow) => r.season_type !== 1;

  const seen = new Set<string>();
  const out: GameResultRow[] = [];
  for (const r of [...nflRows.map(r => ({ ...r, league: r.league ?? 'NFL' })), ...nonNflGameRows].filter(counting)) {
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((a, b) => (b.game_date ?? '').localeCompare(a.game_date ?? ''));
}

export function currentStreak(rows: GameResultRow[]): { kind: 'won' | 'lost'; count: number } | null {
  const sorted = [...rows].sort((a, b) => (b.game_date ?? '').localeCompare(a.game_date ?? ''));
  let kind: 'won' | 'lost' | null = null;
  let count = 0;
  for (const r of sorted) {
    const nr = normResult(r.result);
    if (nr !== 'won' && nr !== 'lost') continue; // skip pushes/ungraded
    if (kind === null) { kind = nr; count = 1; continue; }
    if (nr === kind) count++;
    else break;
  }
  return kind ? { kind, count } : null;
}

export function recordByLeague(rows: GameResultRow[]): Map<string, Record_> {
  const buckets = new Map<string, GameResultRow[]>();
  for (const r of rows) {
    const league = (r.league ?? 'OTHER').toUpperCase();
    buckets.set(league, [...(buckets.get(league) ?? []), r]);
  }
  return new Map([...buckets].map(([k, v]) => [k, computeRecord(v)]));
}

/** Port of iOS isLegitPropResult (Views.swift:290). */
export function isLegitPropResult(r: PropResultRow): boolean {
  const has = (v: string | number | null | undefined) =>
    v !== null && v !== undefined && String(v).trim().length > 0;
  return has(r.player_name) || has(r.prop_type) || has(r.bet) || has(r.line_value);
}

/**
 * THE PROPS BOOK starts Sep 2 2026 — the day the props system was rebuilt
 * (the old multi-pass props brain deleted, THE PROP SHEETS added; founder,
 * Sep 2: "make sure nothing from this old system that lost us thousands can
 * ever be used again"). Every older row stays in the archive by date; the
 * record the site states is the system that is live.
 */
export const PROPS_BOOK_SINCE = '2026-09-02';

/**
 * The home run is the fun lane: one long shot a game, published as a card and
 * tracked internally only (founder, Sep 4 2026 — it never reaches a public
 * record, the downloadable ledger included).
 *
 * The fallback reads the BATTER'S market. "pitcher_home_runs" is home runs
 * ALLOWED — an ordinary core prop — so a substring match on "home_run" would
 * quietly drop it from the record it belongs in.
 */
export function isHrLaneResult(r: PropResultRow): boolean {
  if ((r.sport ?? '').trim().toUpperCase() === 'MLB HR') return true;
  const type = (r.prop_type ?? '').toLowerCase().trim();
  if (type.startsWith('pitcher')) return false;
  return type === 'home_runs' || type === 'home_run' || type === 'home runs';
}

/** The rows the props record is computed over: legit, core lane, from the book's start. */
export function propsBookRows(rows: PropResultRow[]): PropResultRow[] {
  return rows.filter(r => isLegitPropResult(r) && !isHrLaneResult(r) && (r.game_date ?? '') >= PROPS_BOOK_SINCE);
}

/** Props use the odds COLUMN (text), with pick_text tail as fallback. */
export function computePropsRecord(rows: PropResultRow[]): Record_ {
  let wins = 0, losses = 0, pushes = 0, netUnits = 0;
  for (const r of propsBookRows(rows)) {
    const nr = normResult(r.result);
    if (nr === 'won') wins++;
    else if (nr === 'lost') losses++;
    else if (nr === 'push') pushes++;
    else continue;
    netUnits += unitsFor(nr, effectiveOdds(r.pick_text, r.odds));
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes, netUnits,
    pct: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    graded: wins + losses + pushes,
  };
}

// ---------- fetchers (ISR-cached; results change daily) ----------

export async function fetchAllGameResults(revalidate = 3600): Promise<GameResultRow[]> {
  // NOTE: nfl_results has NO league column — mergeGameResults stamps 'NFL'.
  const [games, nfl] = await Promise.all([
    restAll<GameResultRow>(
      'game_results?select=game_date,league,matchup,pick_text,result,final_score,confidence&order=game_date.desc', { revalidate }),
    restAll<NflResultRow>(
      'nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,season_type,home_team,away_team,home_score,away_score&order=game_date.desc', { revalidate }),
  ]);
  return mergeGameResults(nfl, games);
}

export async function fetchAllPropResults(revalidate = 3600): Promise<PropResultRow[]> {
  return restAll<PropResultRow>(
    'prop_results?select=game_date,player_name,prop_type,line_value,actual_value,result,odds,pick_text,matchup,bet,sport&order=game_date.desc', { revalidate });
}

/**
 * One day's graded games — the receipt the board leads with ("Yesterday 7-6").
 * Targeted rather than paging the whole history: the boards revalidate every
 * ten minutes and must not drag 20k rows through each rebuild.
 */
export async function fetchGameResultsForDate(date: string, revalidate = 600): Promise<GameResultRow[]> {
  return rest<GameResultRow[]>(
    `game_results?select=game_date,league,matchup,pick_text,result,final_score,confidence&game_date=eq.${date}`,
    { revalidate },
  );
}

/** One day's graded props, filtered to the legitimately gradeable rows. */
export async function fetchPropResultsForDate(date: string, revalidate = 600): Promise<PropResultRow[]> {
  const rows = await rest<PropResultRow[]>(
    `prop_results?select=game_date,player_name,prop_type,line_value,actual_value,result,odds,pick_text,matchup,bet,sport&game_date=eq.${date}`,
    { revalidate },
  );
  return rows.filter(isLegitPropResult);
}

/** Rows on/after an ISO date (yyyy-MM-dd). */
export function sinceDate<T extends { game_date: string | null }>(rows: T[], iso: string): T[] {
  return rows.filter(r => (r.game_date ?? '') >= iso);
}
