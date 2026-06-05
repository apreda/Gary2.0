import { describe, it, expect } from 'vitest';
import { parsePicksJson, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import type { GaryPick, PropPick } from '@/lib/gary/types';

describe('parsePicksJson (iOS PicksValue port)', () => {
  it('passes through a native array', () => {
    expect(parsePicksJson<GaryPick>([{ pick: 'Phillies -1.5 -110' }])).toEqual([{ pick: 'Phillies -1.5 -110' }]);
  });
  it('parses stringified JSON arrays', () => {
    expect(parsePicksJson<GaryPick>('[{"pick":"Knicks ML +154"}]')).toEqual([{ pick: 'Knicks ML +154' }]);
  });
  it('returns [] on garbage', () => {
    expect(parsePicksJson('not json')).toEqual([]);
    expect(parsePicksJson(null)).toEqual([]);
    expect(parsePicksJson(42)).toEqual([]);
    expect(parsePicksJson('{"a":1}')).toEqual([]); // object, not array
  });
});

describe('selectTopPick (iOS topPickCandidates port)', () => {
  const picks: GaryPick[] = [
    { pick: 'A ML -120', type: 'ml', confidence: 0.7 },
    { pick: 'B -3.5 -110', type: 'spread', confidence: 0.9 },
    { pick: 'prop thing', type: 'prop', confidence: 0.99 },
  ];
  it('excludes props and takes max confidence', () => {
    expect(selectTopPick(picks)?.pick).toBe('B -3.5 -110');
  });
  it('manual is_top_pick wins over confidence', () => {
    const withManual = [...picks, { pick: 'C ML +200', type: 'ml', confidence: 0.5, is_top_pick: true }];
    expect(selectTopPick(withManual)?.pick).toBe('C ML +200');
  });
  it('null on empty', () => {
    expect(selectTopPick([])).toBeNull();
  });
});

describe('selectTopProps', () => {
  it('sorts by confidence desc and takes n', () => {
    const props: PropPick[] = [
      { player: 'A', confidence: 0.6 },
      { player: 'B', confidence: 0.9 },
      { player: 'C', confidence: 0.8 },
    ];
    expect(selectTopProps(props, 2).map(p => p.player)).toEqual(['B', 'C']);
  });
});
