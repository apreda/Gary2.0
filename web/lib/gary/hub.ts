import { rest } from './supabase';
import { todayEST, hubGradedDateEST } from './dates';
import type { InsightRow, PlayerCardRow } from './types';

export type LaneKey =
  | 'streak' | 'h2h' | 'hot' | 'cold' | 'injury' | 'debut' | 'situational'
  | 'platoon' | 'ballpark' | 'regression' | 'tournament' | 'hrThreat';

export interface LaneMeta {
  chip: string;                       // terminal eyebrow label (app SignalKind.chip)
  title: string;                      // section heading on web
  tint: 'green' | 'red' | 'neutral';  // lane identity is neutral; tint carries hot/cold meaning
}

export const LANES: Record<LaneKey, LaneMeta> = {
  streak:     { chip: 'STREAK',        title: 'Streaks',               tint: 'neutral' },
  h2h:        { chip: 'HEAD-TO-HEAD',  title: 'Head-to-Head',          tint: 'neutral' },
  hot:        { chip: 'HEAT CHECK',    title: 'Heat Check',            tint: 'green' },
  cold:       { chip: 'COOLING OFF',   title: 'Cooling Off',           tint: 'red' },
  injury:     { chip: 'REPLACEMENT',   title: 'The Beneficiary',       tint: 'neutral' },
  debut:      { chip: 'DEBUT',         title: 'Debuts',                tint: 'neutral' },
  situational:{ chip: 'SITUATIONAL',   title: 'Rest & Fatigue',        tint: 'neutral' },
  platoon:    { chip: 'PLATOON EDGE',  title: 'Platoon Edges',         tint: 'neutral' },
  ballpark:   { chip: 'BALLPARK',      title: 'Ballpark Shifts',       tint: 'neutral' },
  regression: { chip: 'REGRESSION',    title: 'Regression Board',      tint: 'red' },
  tournament: { chip: 'TOURNAMENT',    title: 'Tournament Stakes',     tint: 'neutral' },
  hrThreat:   { chip: 'HR THREAT',     title: 'Gary Home Run Threats', tint: 'green' },
};

/** Display order of lanes on /hub (HR Threats leads in MLB season). */
export const LANE_ORDER: LaneKey[] = [
  'hrThreat', 'hot', 'platoon', 'ballpark', 'regression', 'injury',
  'situational', 'streak', 'h2h', 'cold', 'tournament', 'debut',
];

/**
 * Port of iOS SignalKind.from (Views.swift:11404). Unknown categories return
 * null so the row is DROPPED rather than mis-bucketed.
 */
export function laneFromCategory(raw: string | null | undefined): LaneKey | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'streak': return 'streak';
    case 'h2h': case 'head-to-head': case 'head_to_head': case 'owned': return 'h2h';
    case 'hot': case 'heat': case 'heat check': case 'heat_check': return 'hot';
    case 'cold': case 'cooling': case 'cooling off': case 'cooling_off': return 'cold';
    case 'injury': case 'replacement': case 'beneficiary': return 'injury';
    case 'debut': return 'debut';
    case 'situational': case 'rest': case 'fatigue': case 'rest & fatigue': case 'rest_fatigue': return 'situational';
    case 'platoon': case 'platoon edge': case 'platoon_edge': return 'platoon';
    case 'ballpark': case 'ballpark shift': case 'ballpark_shift': return 'ballpark';
    case 'regression': case 'regression watch': case 'regression_watch': return 'regression';
    case 'tournament': case 'stakes': case 'group': case 'tournament_stakes': return 'tournament';
    case 'gary_hr_threats': case 'hr_threat': case 'hr threats': return 'hrThreat';
    default: return null;
  }
}

/** Port of iOS fetchInsightHitRate: hit/(hit+miss); pushes + NULLs excluded. */
export function computeHitRate(rows: InsightRow[]): { hit: number; graded: number } | null {
  const hit = rows.filter(r => r.result === 'hit').length;
  const miss = rows.filter(r => r.result === 'miss').length;
  const graded = hit + miss;
  return graded > 0 ? { hit, graded } : null;
}

export function groupInsightsByLane(rows: InsightRow[]): Map<LaneKey, InsightRow[]> {
  const m = new Map<LaneKey, InsightRow[]>();
  for (const r of rows) {
    const lane = laneFromCategory(r.category);
    if (!lane) continue;
    m.set(lane, [...(m.get(lane) ?? []), r]);
  }
  for (const [k, v] of m) {
    m.set(k, v.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)));
  }
  return m;
}

export async function fetchTodayInsights(revalidate = 600): Promise<InsightRow[]> {
  return rest<InsightRow[]>(
    `insight_connections?select=*&date=eq.${todayEST()}&order=relevance_score.desc.nullslast`,
    { revalidate },
  );
}

/** Yesterday's graded rows — powers the "X OF Y HIT YDAY" badge (show when graded >= 5). */
export async function fetchGradedYesterday(revalidate = 3600): Promise<InsightRow[]> {
  return rest<InsightRow[]>(
    `insight_connections?select=id,date,result&date=eq.${hubGradedDateEST()}&result=not.is.null`,
    { revalidate },
  );
}

export async function fetchPlayerCards(revalidate = 600): Promise<PlayerCardRow[]> {
  return rest<PlayerCardRow[]>(
    `player_insight_cards?select=*&date=eq.${todayEST()}`,
    { revalidate },
  );
}
