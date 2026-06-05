import { restAll } from './supabase';
import type { GameResultRow, NflResultRow, PropResultRow } from './types';

const ODDS_TAIL = /[+-]\d{3,}\s*$/;

/**
 * Normalize a result string to lowercase, trimmed.
 * The live DB contains rows with mixed-case values (e.g. 'Lost', 'Won').
 * All comparisons use this helper so 'Lost' and 'lost' are treated identically.
 * The strict normalized set is: 'won' | 'lost' | 'push'.
 */
const normResult = (r: string | null | undefined) => (r ?? '').trim().toLowerCase();

/**
 * Port of iOS GameResult.effectiveOdds (Models.swift:1154).
 * game_results/nfl_results have NO odds column — the line lives at the tail
 * of pick_text ("Knicks ML +154"). Prefer an explicit odds value if present.
 */
export function effectiveOdds(pickText: string | null | undefined, odds?: string | null): string | null {
  if (odds && odds.trim().length > 0) return odds.trim();
  if (!pickText) return null;
  const m = pickText.match(ODDS_TAIL);
  return m ? m[0].trim() : null;
}

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
  `${(r.pick_text ?? '').trim().toLowerCase()}|${r.game_date ?? ''}`;

/**
 * NFL results live in BOTH nfl_results (majority) AND game_results (9 legacy
 * stray rows). The two tables have an off-by-one game_date mismatch (kickoff
 * date vs grading date), so the (pick_text|game_date) dedupe key is a no-op
 * for those rows and games would double-count.
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

  const seen = new Set<string>();
  const out: GameResultRow[] = [];
  for (const r of [...nflRows.map(r => ({ ...r, league: r.league ?? 'NFL' })), ...nonNflGameRows]) {
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

/** Props use the odds COLUMN (text), with pick_text tail as fallback. */
export function computePropsRecord(rows: PropResultRow[]): Record_ {
  let wins = 0, losses = 0, pushes = 0, netUnits = 0;
  for (const r of rows.filter(isLegitPropResult)) {
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
      'nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,home_team,away_team,home_score,away_score&order=game_date.desc', { revalidate }),
  ]);
  return mergeGameResults(nfl, games);
}

export async function fetchAllPropResults(revalidate = 3600): Promise<PropResultRow[]> {
  return restAll<PropResultRow>(
    'prop_results?select=game_date,player_name,prop_type,line_value,actual_value,result,odds,pick_text,matchup,bet&order=game_date.desc', { revalidate });
}

/** Rows on/after an ISO date (yyyy-MM-dd). */
export function sinceDate<T extends { game_date: string | null }>(rows: T[], iso: string): T[] {
  return rows.filter(r => (r.game_date ?? '') >= iso);
}
