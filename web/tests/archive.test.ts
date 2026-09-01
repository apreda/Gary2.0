import { describe, expect, it } from 'vitest';
import {
  dedupeArchivePicks,
  filterWeeklyPicksForDate,
  isArchiveDate,
  mergeArchiveDates,
} from '@/lib/gary/archive';
import type { GaryPick } from '@/lib/gary/types';

describe('isArchiveDate', () => {
  it('accepts real dates through today', () => {
    expect(isArchiveDate('2026-09-01', '2026-09-01')).toBe(true);
    expect(isArchiveDate('2024-02-29', '2026-09-01')).toBe(true);
  });

  it('rejects future, malformed, and impossible dates', () => {
    expect(isArchiveDate('2026-09-02', '2026-09-01')).toBe(false);
    expect(isArchiveDate('2026-9-1', '2026-09-01')).toBe(false);
    expect(isArchiveDate('2026-02-29', '2026-09-01')).toBe(false);
  });
});

describe('archive date and weekly-pick helpers', () => {
  it('merges unique valid dates newest first', () => {
    expect(mergeArchiveDates([
      ['2026-08-31', '2026-09-01'],
      ['2026-09-01', 'bad', '2026-09-02'],
    ], '2026-09-01')).toEqual(['2026-09-01', '2026-08-31']);
  });

  it('places weekly picks only on their ET game date', () => {
    const picks: GaryPick[] = [
      { pick_id: 'early', commence_time: '2026-09-04T00:30:00Z' },
      { pick_id: 'late', commence_time: '2026-09-04T19:00:00Z' },
      { pick_id: 'unknown' },
    ];
    expect(filterWeeklyPicksForDate(picks, '2026-09-03').map(pick => pick.pick_id)).toEqual(['early']);
    expect(filterWeeklyPicksForDate(picks, '2026-09-04').map(pick => pick.pick_id)).toEqual(['late']);
  });

  it('dedupes overlap by ID or the full fallback tuple', () => {
    const picks: GaryPick[] = [
      { pick_id: 'one', pick: 'A ML' },
      { pick_id: 'one', pick: 'Changed display' },
      { awayTeam: 'A', homeTeam: 'B', pick: 'A ML -110', commence_time: '2026-09-01T23:00:00Z' },
      { awayTeam: 'A', homeTeam: 'B', pick: 'A ML -110', commence_time: '2026-09-01T23:00:00Z' },
    ];
    expect(dedupeArchivePicks(picks)).toHaveLength(2);
  });
});
