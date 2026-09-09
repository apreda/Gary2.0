import { describe, expect, it } from 'vitest';
import { LANES, laneChip } from '@/lib/gary/hub';

describe('laneChip — a research row never wears its raw key', () => {
  it('uses the lane chip for every known category', () => {
    expect(laneChip('the_sweat')).toBe(LANES.theSweat.chip);
    expect(laneChip('THE_SWEAT')).toBe('THE SWEAT');
    expect(laneChip('after_gary')).toBe('AFTER GARY');
    expect(laneChip('gary_hr_threats')).toBe('HR THREAT');
    expect(laneChip(' practice_report ')).toBe('PRACTICE REPORT');
  });
  it('spells an unknown key in plain words and falls back to the league', () => {
    expect(laneChip('line_watch')).toBe('LINE WATCH');
    expect(laneChip('bullpen-late_arms')).toBe('BULLPEN LATE ARMS');
    expect(laneChip(null, 'NFL')).toBe('NFL');
    expect(laneChip('', 'NFL')).toBe('NFL');
    expect(laneChip(undefined)).toBe('INSIGHT');
  });
});
