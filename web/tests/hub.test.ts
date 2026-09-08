import { describe, it, expect } from 'vitest';
import { laneFromCategory, laneNeedsFullDetail, LANES, LANE_ORDER, availableHubLeagues, computeHitRate, groupInsightsByLane } from '@/lib/gary/hub';
import type { InsightRow } from '@/lib/gary/types';

const insight = (over: Partial<InsightRow>): InsightRow => ({
  id: 1, date: '2026-06-04', league: 'MLB', category: 'heat_check',
  headline: 'h', detail: 'd', game: 'SD @ PHI', value: '.900', tone: 'good',
  spark: [0.3, 0.9], line_val: null, relevance_score: 80,
  player_id: null, team_id: null, game_id: null, result: null, result_note: null,
  ...over,
});

describe('laneFromCategory (iOS SignalKind.from port)', () => {
  it.each([
    ['streaking', 'streak'], ['starter_form', 'starterForm'],
    ['starter_team_record', 'teamRecord'], ['team_record', 'teamRecord'],
    ['bullpen_fatigue', 'bullpenFatigue'], ['first_inning', 'firstInning'],
    ['regression_tomorrow', 'regressionTomorrow'], ['fantasy_pickups', 'fantasyPickups'],
    ['return_watch', 'returnWatch'], ['fantasy_usage', 'fantasyUsage'],
    ['next_slate', 'nextSlate'], ['headToHead', 'h2h'],
    ['owned', 'batterVsArm'], ['runningGame', 'runningGame'], ['parkWeather', 'parkWeather'],
    ['twoStartWeek', 'twoStart'], ['closerWatch', 'closerWatch'], ['cutList', 'cutList'],
    ['trenches', 'trenches'], ['quarterback', 'quarterback'], ['mismatch', 'mismatch'],
    ['pass_rush', 'passRush'], ['coverage', 'coverage'], ['pace_script', 'paceScript'],
    ['red_zone', 'redZone'], ['turnover_edge', 'turnoverEdge'], ['explosive_play', 'explosivePlay'],
    ['coaching', 'coaching'], ['market_range', 'marketRange'], ['practice_report', 'practiceReport'],
    ['the_sweat', 'theSweat'], ['after_gary', 'afterGary'], ['fantasy_matchup', 'fantasyMatchup'],
    ['fantasy_trend', 'fantasyTrend'], ['fantasy_red_zone', 'fantasyRedZone'],
  ])('recognizes published category %s without losing its label', (category, lane) => {
    expect(laneFromCategory(category)).toBe(lane);
    expect(LANE_ORDER).toContain(lane);
  });
  it('maps every live category', () => {
    expect(laneFromCategory('heat_check')).toBe('hot');
    expect(laneFromCategory('cooling_off')).toBe('cold');
    expect(laneFromCategory('beneficiary')).toBe('injury');
    expect(laneFromCategory('owned')).toBe('batterVsArm');
    expect(laneFromCategory('platoon_edge')).toBe('platoon');
    expect(laneFromCategory('ballpark_shift')).toBe('ballpark');
    expect(laneFromCategory('ballpark')).toBe('ballpark');
    expect(laneFromCategory('regression_watch')).toBe('regression');
    expect(laneFromCategory('rest_fatigue')).toBe('situational');
    expect(laneFromCategory('situational')).toBe('situational');
    expect(laneFromCategory('streak')).toBe('streak');
    expect(laneFromCategory('tournament')).toBe('tournament');
    expect(laneFromCategory('gary_hr_threats')).toBe('hrThreat');
  });
  it('is tolerant of case/whitespace, null on unknown', () => {
    expect(laneFromCategory('  Heat Check ')).toBe('hot');
    expect(laneFromCategory('made_up')).toBeNull();
    expect(laneFromCategory(null)).toBeNull();
  });
});

describe('availableHubLeagues', () => {
  it('includes active football leagues and normalizes provider league names', () => {
    expect(availableHubLeagues([
      insight({ league: 'americanfootball_nfl', category: 'fantasy_usage' }),
      insight({ league: 'NCAAF', category: 'next_slate' }),
      insight({ league: 'MLB', category: 'starter_team_record' }),
    ])).toEqual(['MLB', 'NFL', 'NCAAF']);
  });
  it('counts only displayable active rows when deciding whether the Hub is empty', () => {
    expect(availableHubLeagues([
      insight({ category: 'unknown' }), insight({ league: 'WC', category: 'tournament' }),
    ])).toEqual([]);
  });
  it('recognizes every category in the September 8 live snapshot', () => {
    const categories = ['ballpark_shift', 'bullpen_fatigue', 'cooling_off', 'fantasy_pickups',
      'first_inning', 'head_to_head', 'heat_check', 'regression_tomorrow', 'regression_watch',
      'rest_fatigue', 'return_watch', 'starter_form', 'starter_team_record', 'streaking',
      'next_slate', 'fantasy_usage'];
    expect(categories.filter(category => !laneFromCategory(category))).toEqual([]);
  });
});

describe('LANES metadata', () => {
  it('renders every declared lane and keeps newly exposed football context beside its values', () => {
    expect(new Set(LANE_ORDER)).toEqual(new Set(Object.keys(LANES)));
    expect(laneNeedsFullDetail('mismatch')).toBe(true);
    expect(laneNeedsFullDetail('fantasyUsage')).toBe(true);
    expect(laneNeedsFullDetail('regressionTomorrow')).toBe(true);
  });
  it('chip labels match the app', () => {
    expect(LANES.hot.chip).toBe('HEAT CHECK');
    expect(LANES.hrThreat.chip).toBe('HR THREAT');
    expect(LANES.injury.chip).toBe('REPLACEMENT');
  });
  it('tint discipline: hot/hrThreat green, cold/regression red, rest neutral', () => {
    expect(LANES.hot.tint).toBe('green');
    expect(LANES.hrThreat.tint).toBe('green');
    expect(LANES.cold.tint).toBe('red');
    expect(LANES.regression.tint).toBe('red');
    expect(LANES.platoon.tint).toBe('neutral');
  });
});

describe('computeHitRate (iOS fetchInsightHitRate port)', () => {
  it('hit/(hit+miss), pushes and nulls excluded', () => {
    const rows = [
      insight({ result: 'hit' }), insight({ result: 'hit' }),
      insight({ result: 'miss' }), insight({ result: 'push' }), insight({ result: null }),
    ];
    expect(computeHitRate(rows)).toEqual({ hit: 2, graded: 3 });
  });
  it('null when nothing graded', () => {
    expect(computeHitRate([insight({ result: null })])).toBeNull();
  });
});

describe('groupInsightsByLane', () => {
  it('drops unknown categories, sorts lanes by relevance', () => {
    const rows = [
      insight({ category: 'heat_check', relevance_score: 50 }),
      insight({ category: 'heat_check', relevance_score: 90 }),
      insight({ category: 'nonsense' }),
    ];
    const grouped = groupInsightsByLane(rows);
    expect(grouped.get('hot')!.map(r => r.relevance_score)).toEqual([90, 50]);
    expect([...grouped.keys()]).toEqual(['hot']);
  });
});
