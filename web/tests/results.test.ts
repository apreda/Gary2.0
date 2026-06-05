import { describe, it, expect } from 'vitest';
import {
  effectiveOdds, unitsFor, computeRecord, mergeGameResults,
  currentStreak, recordByLeague, isLegitPropResult,
} from '@/lib/gary/results';
import type { GameResultRow, PropResultRow } from '@/lib/gary/types';

const row = (over: Partial<GameResultRow>): GameResultRow => ({
  game_date: '2026-06-03', league: 'MLB', matchup: 'A @ B',
  pick_text: 'B ML -120', result: 'won', final_score: '5-3', confidence: 0.8, ...over,
});

describe('effectiveOdds (iOS Models.swift:1154 port)', () => {
  it('extracts odds from pick_text tail', () => {
    expect(effectiveOdds('Knicks ML +154')).toBe('+154');
    expect(effectiveOdds('Phillies -1.5 -110')).toBe('-110');
    expect(effectiveOdds('Over 8.5 -104  ')).toBe('-104');
  });
  it('requires 3+ digits at the tail', () => {
    expect(effectiveOdds('Phillies -1.5')).toBeNull();   // spread, not odds
    expect(effectiveOdds('B ML')).toBeNull();
    expect(effectiveOdds(null)).toBeNull();
  });
  it('prefers an explicit odds value', () => {
    expect(effectiveOdds('B ML -120', '-200')).toBe('-200');
    expect(effectiveOdds('B ML -120', '  ')).toBe('-120'); // blank column falls through
  });
});

describe('unitsFor (iOS Views.swift:273 port — EXACT)', () => {
  it('positive odds win', () => expect(unitsFor('won', '+150')).toBeCloseTo(1.5));
  it('negative odds win', () => expect(unitsFor('won', '-110')).toBeCloseTo(100 / 110));
  it('unparseable odds win pays 0.9', () => expect(unitsFor('won', null)).toBe(0.9));
  it('loss is -1 regardless of odds', () => expect(unitsFor('lost', '+300')).toBe(-1));
  it('push and unknown are 0', () => {
    expect(unitsFor('push', '-110')).toBe(0);
    expect(unitsFor(null, '-110')).toBe(0);
  });
});

describe('computeRecord', () => {
  it('counts W-L-P and win% (pushes excluded from pct)', () => {
    const rec = computeRecord([
      row({}), row({}), row({ result: 'lost' }), row({ result: 'push' }),
    ]);
    expect(rec).toMatchObject({ wins: 2, losses: 1, pushes: 1 });
    expect(rec.pct).toBe(67); // 2/3 rounded
  });
  it('sums net units from effective odds', () => {
    const rec = computeRecord([
      row({ pick_text: 'A ML +200' }),                  // +2.0
      row({ pick_text: 'B ML -100', result: 'lost' }),  // -1.0
    ]);
    expect(rec.netUnits).toBeCloseTo(1.0);
  });
});

describe('mergeGameResults (NFL split across two tables)', () => {
  it('dedupes on lowercased pick_text + game_date', () => {
    const a = row({ league: 'NFL', pick_text: 'Chiefs -3 -110' });
    const dupe = row({ league: 'NFL', pick_text: '  chiefs -3 -110 ' });
    const other = row({ league: 'NFL', pick_text: 'Bills ML -150' });
    expect(mergeGameResults([a], [dupe, other])).toHaveLength(2);
  });
});

describe('currentStreak', () => {
  it('counts consecutive identical results from most recent date', () => {
    const rows = [
      row({ game_date: '2026-06-03' }), row({ game_date: '2026-06-03' }),
      row({ game_date: '2026-06-02', result: 'lost' }),
    ];
    expect(currentStreak(rows)).toEqual({ kind: 'won', count: 2 });
  });
  it('skips pushes', () => {
    const rows = [
      row({ game_date: '2026-06-03', result: 'push' }),
      row({ game_date: '2026-06-02' }),
    ];
    expect(currentStreak(rows)).toEqual({ kind: 'won', count: 1 });
  });
});

describe('recordByLeague', () => {
  it('buckets by league', () => {
    const out = recordByLeague([row({}), row({ league: 'NBA', result: 'lost' })]);
    expect(out.get('MLB')?.wins).toBe(1);
    expect(out.get('NBA')?.losses).toBe(1);
  });
});

describe('isLegitPropResult (iOS Views.swift:290 port)', () => {
  const prop = (over: Partial<PropResultRow>): PropResultRow => ({
    game_date: '2026-06-03', player_name: null, prop_type: null, line_value: null,
    actual_value: null, result: 'won', odds: '-110', pick_text: null, matchup: null,
    bet: null, ...over,
  });
  it('keeps rows with any identifying field', () => {
    expect(isLegitPropResult(prop({ player_name: 'Manny Machado' }))).toBe(true);
    expect(isLegitPropResult(prop({ bet: 'under' }))).toBe(true);
  });
  it('drops fully anonymous rows', () => {
    expect(isLegitPropResult(prop({}))).toBe(false);
  });
});
