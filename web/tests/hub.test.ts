import { describe, it, expect } from 'vitest';
import { laneFromCategory, LANES, computeHitRate, groupInsightsByLane } from '@/lib/gary/hub';
import type { InsightRow } from '@/lib/gary/types';

const insight = (over: Partial<InsightRow>): InsightRow => ({
  id: 1, date: '2026-06-04', league: 'MLB', category: 'heat_check',
  headline: 'h', detail: 'd', game: 'SD @ PHI', value: '.900', tone: 'good',
  spark: [0.3, 0.9], line_val: null, relevance_score: 80,
  player_id: null, team_id: null, game_id: null, result: null, result_note: null,
  ...over,
});

describe('laneFromCategory (iOS SignalKind.from port)', () => {
  it('maps every live category', () => {
    expect(laneFromCategory('heat_check')).toBe('hot');
    expect(laneFromCategory('cooling_off')).toBe('cold');
    expect(laneFromCategory('beneficiary')).toBe('injury');
    expect(laneFromCategory('owned')).toBe('h2h');
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

describe('LANES metadata', () => {
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
