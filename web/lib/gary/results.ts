import { restAll } from './supabase';
import type { GameResultRow, NflResultRow, PropResultRow } from './types';

const ODDS_TAIL = /[+-]\d{3,}\s*$/;

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
  switch (result) {
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
    if (r.result === 'won') wins++;
    else if (r.result === 'lost') losses++;
    else if (r.result === 'push') pushes++;
    else continue;
    netUnits += unitsFor(r.result, effectiveOdds(r.pick_text));
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
 * NFL results live in BOTH nfl_results (majority) and game_results (a few
 * legacy rows). Merge with nfl_results winning on (pick_text, game_date).
 * Also dedupes re-grade duplicates within each table.
 * NOTE: nfl_results has NO league column — stamp 'NFL' on merge.
 */
export function mergeGameResults(nflRows: NflResultRow[], gameRows: GameResultRow[]): GameResultRow[] {
  const seen = new Set<string>();
  const out: GameResultRow[] = [];
  for (const r of [...nflRows.map(r => ({ ...r, league: r.league ?? 'NFL' })), ...gameRows]) {
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function currentStreak(rows: GameResultRow[]): { kind: 'won' | 'lost'; count: number } | null {
  const sorted = [...rows].sort((a, b) => (b.game_date ?? '').localeCompare(a.game_date ?? ''));
  let kind: 'won' | 'lost' | null = null;
  let count = 0;
  for (const r of sorted) {
    if (r.result !== 'won' && r.result !== 'lost') continue; // skip pushes/ungraded
    if (kind === null) { kind = r.result; count = 1; continue; }
    if (r.result === kind) count++;
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
    if (r.result === 'won') wins++;
    else if (r.result === 'lost') losses++;
    else if (r.result === 'push') pushes++;
    else continue;
    netUnits += unitsFor(r.result, effectiveOdds(r.pick_text, r.odds));
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
