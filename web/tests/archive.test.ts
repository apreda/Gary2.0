import { describe, expect, it } from 'vitest';
import {
  adjacentArchiveDates,
  archiveDateLabel,
  archiveEditorialStats,
  archiveMonthLabel,
  summarizeArchiveDayIndex,
  dedupeArchivePicks,
  filterWeeklyPicksForDate,
  isArchiveDate,
  isArchiveMonth,
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

  it('validates and formats archive months without timezone drift', () => {
    expect(isArchiveMonth('2026-09', '2026-09-01')).toBe(true);
    expect(isArchiveMonth('2026-10', '2026-09-01')).toBe(false);
    expect(isArchiveMonth('2026-13', '2026-09-01')).toBe(false);
    expect(archiveMonthLabel('2026-08')).toBe('August 2026');
    expect(archiveDateLabel('2026-08-31')).toBe('Monday, August 31, 2026');
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

  it('finds the closest older and newer substantive dates', () => {
    expect(adjacentArchiveDates(
      ['2026-08-28', '2026-09-01', '2026-08-31', '2026-08-31'],
      '2026-08-30',
    )).toEqual({ previous: '2026-08-28', next: '2026-08-31' });
  });

  it('requires original depth or multiple real items before indexing a day', () => {
    const terse = { awayTeam: 'A', homeTeam: 'B', pick: 'A ML' };
    expect(archiveEditorialStats({ picks: [terse], props: [], insights: [] }).substantive).toBe(false);
    expect(archiveEditorialStats({
      picks: [{ ...terse, rationale: 'A source-backed matchup read. '.repeat(4) }],
      props: [],
      insights: [],
    }).substantive).toBe(true);
    expect(archiveEditorialStats({ picks: [terse, { ...terse, pick: 'B +1.5' }], props: [], insights: [] }).substantive).toBe(true);
  });

  it('builds a newest-first index from per-day counts and drops thin, future, and empty days', () => {
    const row = (date: string, game_count: number, prop_count: number, research_count: number) =>
      ({ date, published_at: `${date}T13:00:00+00:00`, game_count, prop_count, research_count });
    const summaries = summarizeArchiveDayIndex([
      row('2026-08-31', 2, 0, 0),   // two game calls -> in
      row('2026-08-30', 0, 12, 1),  // props (count one) + one research note -> in
      row('2026-08-29', 1, 0, 0),   // one terse call -> out
      row('2026-08-28', 0, 0, 2),   // two research notes -> in
      row('2026-08-27', 0, 3, 0),   // props alone count one -> out
      row('2026-09-02', 9, 9, 9),   // future -> out
      row('bad-date', 9, 9, 9),
    ], '2026-09-01');
    expect(summaries).toEqual([
      { date: '2026-08-31', hasGamePicks: true, hasProps: false, hasResearch: false },
      { date: '2026-08-30', hasGamePicks: false, hasProps: true, hasResearch: true },
      { date: '2026-08-28', hasGamePicks: false, hasProps: false, hasResearch: true },
    ]);
  });
});
