import { rest } from './supabase';
import { todayEST, hubGradedDateEST } from './dates';
import type { InsightRow } from './types';
import { normalizeLeague, SPORTS } from './leagues';

export type LaneKey =
  | 'streak' | 'h2h' | 'hot' | 'cold' | 'injury' | 'debut' | 'situational'
  | 'platoon' | 'ballpark' | 'regression' | 'tournament' | 'hrThreat'
  | 'starterForm' | 'teamRecord' | 'bullpenFatigue' | 'firstInning'
  | 'fantasyPickups' | 'returnWatch' | 'fantasyUsage' | 'nextSlate' | 'regressionTomorrow'
  | 'batterVsArm' | 'runningGame' | 'parkWeather' | 'twoStart' | 'closerWatch' | 'cutList'
  | 'trenches' | 'quarterback' | 'mismatch' | 'passRush' | 'coverage' | 'paceScript'
  | 'redZone' | 'turnoverEdge' | 'explosivePlay' | 'coaching' | 'marketRange'
  | 'practiceReport' | 'theSweat' | 'afterGary' | 'fantasyMatchup' | 'fantasyTrend' | 'fantasyRedZone';

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
  starterForm: { chip: 'STARTER FORM', title: 'Starter Form', tint: 'neutral' },
  teamRecord: { chip: 'TEAM RECORD', title: 'Team Records', tint: 'neutral' },
  bullpenFatigue: { chip: 'BULLPEN', title: 'Bullpen Workload', tint: 'neutral' },
  firstInning: { chip: 'FIRST INNING', title: 'First Inning', tint: 'neutral' },
  fantasyPickups: { chip: 'FANTASY PICKUPS', title: 'Fantasy Pickups', tint: 'neutral' },
  returnWatch: { chip: 'RETURN WATCH', title: 'Return Watch', tint: 'neutral' },
  fantasyUsage: { chip: 'FANTASY USAGE', title: 'Fantasy Usage', tint: 'neutral' },
  nextSlate: { chip: 'NEXT SLATE', title: 'Next Slate', tint: 'neutral' },
  regressionTomorrow: { chip: 'TOMORROW', title: "Tomorrow's Projected Starters", tint: 'neutral' },
  batterVsArm: { chip: 'BATTER VS ARM', title: 'Batter vs. Pitcher', tint: 'neutral' },
  runningGame: { chip: 'RUNNING GAME', title: 'Running Game', tint: 'neutral' },
  parkWeather: { chip: 'PARK WEATHER', title: 'Park Weather', tint: 'neutral' },
  twoStart: { chip: 'TWO STARTS', title: 'Two-Start Week', tint: 'neutral' },
  closerWatch: { chip: 'CLOSER WATCH', title: 'Closer Watch', tint: 'neutral' },
  cutList: { chip: 'CUT LIST', title: 'Cut List', tint: 'neutral' },
  trenches: { chip: 'TRENCHES', title: 'The Trenches', tint: 'neutral' },
  quarterback: { chip: 'QUARTERBACK', title: 'Quarterbacks', tint: 'neutral' },
  mismatch: { chip: 'MISMATCH', title: 'Matchup Comparisons', tint: 'neutral' },
  passRush: { chip: 'PASS RUSH', title: 'Pass Rush', tint: 'neutral' },
  coverage: { chip: 'COVERAGE', title: 'Coverage', tint: 'neutral' },
  paceScript: { chip: 'PACE & SCRIPT', title: 'Pace and Game Script', tint: 'neutral' },
  redZone: { chip: 'RED ZONE', title: 'Red Zone', tint: 'neutral' },
  turnoverEdge: { chip: 'TURNOVERS', title: 'Turnovers', tint: 'neutral' },
  explosivePlay: { chip: 'EXPLOSIVE PLAYS', title: 'Explosive Plays', tint: 'neutral' },
  coaching: { chip: 'COACHING', title: 'Coaching', tint: 'neutral' },
  marketRange: { chip: 'MARKET RANGE', title: 'Market Range', tint: 'neutral' },
  practiceReport: { chip: 'PRACTICE REPORT', title: 'Practice Reports', tint: 'neutral' },
  theSweat: { chip: 'THE SWEAT', title: 'The Sweat', tint: 'neutral' },
  afterGary: { chip: 'AFTER GARY', title: 'After Gary', tint: 'neutral' },
  fantasyMatchup: { chip: 'FANTASY MATCHUP', title: 'Fantasy Matchups', tint: 'neutral' },
  fantasyTrend: { chip: 'FANTASY TREND', title: 'Fantasy Trends', tint: 'neutral' },
  fantasyRedZone: { chip: 'FANTASY RED ZONE', title: 'Fantasy Red-Zone Roles', tint: 'neutral' },
};

/** Display order of lanes on /hub (HR Threats leads in MLB season). */
export const LANE_ORDER: LaneKey[] = [
  'hrThreat', 'hot', 'platoon', 'ballpark', 'regression', 'injury',
  'situational', 'streak', 'h2h', 'cold', 'tournament', 'debut',
  'nextSlate', 'starterForm', 'teamRecord', 'bullpenFatigue', 'firstInning',
  'regressionTomorrow', 'fantasyPickups', 'returnWatch', 'fantasyUsage',
  'batterVsArm', 'runningGame', 'parkWeather', 'twoStart', 'closerWatch', 'cutList',
  'mismatch', 'trenches', 'quarterback', 'passRush', 'coverage', 'paceScript', 'redZone',
  'turnoverEdge', 'explosivePlay', 'coaching', 'marketRange', 'practiceReport',
  'fantasyMatchup', 'fantasyTrend', 'fantasyRedZone', 'theSweat', 'afterGary',
];

/** These lanes' season/sample/status qualifications live in the detail text. */
export function laneNeedsFullDetail(lane: LaneKey): boolean {
  return !['streak', 'h2h', 'hot', 'cold', 'injury', 'debut', 'situational',
    'platoon', 'ballpark', 'regression', 'tournament', 'hrThreat'].includes(lane);
}

/**
 * The eyebrow a research row wears wherever it is shown on its own (archive
 * day pages, game pages): the lane's chip when the category is known, else
 * the raw key in plain words ("the_sweat" → "THE SWEAT"). Never a raw key.
 */
export function laneChip(category: string | null | undefined, fallback = 'INSIGHT'): string {
  const lane = laneFromCategory(category);
  if (lane) return LANES[lane].chip;
  const words = (category ?? '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  return words || fallback;
}

/**
 * Port of iOS SignalKind.from (Views.swift:11404). Unknown categories return
 * null so the row is DROPPED rather than mis-bucketed.
 */
export function laneFromCategory(raw: string | null | undefined): LaneKey | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'streak': case 'streaking': return 'streak';
    case 'h2h': case 'head-to-head': case 'head_to_head': case 'headtohead': return 'h2h';
    case 'owned': case 'h2h_form': return 'batterVsArm';
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
    case 'starter_form': return 'starterForm';
    case 'starter_team_record': case 'team_record': return 'teamRecord';
    case 'bullpen_fatigue': return 'bullpenFatigue';
    case 'first_inning': return 'firstInning';
    case 'fantasy_pickups': return 'fantasyPickups';
    case 'return_watch': return 'returnWatch';
    case 'fantasy_usage': return 'fantasyUsage';
    case 'next_slate': return 'nextSlate';
    case 'regression_tomorrow': return 'regressionTomorrow';
    case 'running_game': case 'runninggame': return 'runningGame';
    case 'park_weather': case 'parkweather': return 'parkWeather';
    case 'two_start_week': case 'twostartweek': return 'twoStart';
    case 'closer_watch': case 'closerwatch': return 'closerWatch';
    case 'cut_list': case 'cutlist': return 'cutList';
    case 'trenches': return 'trenches';
    case 'quarterback': return 'quarterback';
    case 'mismatch': return 'mismatch';
    case 'pass_rush': return 'passRush';
    case 'coverage': return 'coverage';
    case 'pace_script': return 'paceScript';
    case 'red_zone': return 'redZone';
    case 'turnover_edge': return 'turnoverEdge';
    case 'explosive_play': return 'explosivePlay';
    case 'coaching': return 'coaching';
    case 'market_range': return 'marketRange';
    case 'practice_report': return 'practiceReport';
    case 'the_sweat': return 'theSweat';
    case 'after_gary': return 'afterGary';
    case 'fantasy_matchup': return 'fantasyMatchup';
    case 'fantasy_trend': return 'fantasyTrend';
    case 'fantasy_red_zone': return 'fantasyRedZone';
    default: return null;
  }
}

/** Active sports with at least one displayable research row, in site order. */
export function availableHubLeagues(rows: InsightRow[]): string[] {
  const present = new Set(rows.filter(row => laneFromCategory(row.category))
    .map(row => normalizeLeague(row.league)));
  return SPORTS.filter(sport => !sport.retired && present.has(sport.code)).map(sport => sport.code);
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
