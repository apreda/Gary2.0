import { describe, expect, it } from 'vitest';
import {
  adjacentArchiveDates,
  archiveDateLabel,
  archiveEditorialStats,
  archiveMonthLabel,
  buildArchiveDateSummaries,
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

  it('builds a newest-first lightweight index and excludes thin research, future, and duplicate rows', () => {
    const summaries = buildArchiveDateSummaries({
      games: [
        { date: '2026-08-31', away_team: 'A', home_team: 'B', pick: 'A ML' },
        { date: '2026-08-31', away_team: 'C', home_team: 'D', pick: 'C ML' },
        { date: '2026-08-29', away_team: 'E', home_team: 'F', pick: 'E ML' },
        { date: '2026-09-02', away_team: 'Future', home_team: 'Game', pick: 'Future ML' },
      ],
      props: [{ date: '2026-08-30' }],
      insights: [
        { date: '2026-08-30', headline: 'Market context', detail: 'A meaningful stored research note for this board.' },
        { date: '2026-08-29', headline: 'Short', detail: null },
        { date: '2026-08-28', headline: 'Rotation context', detail: 'A meaningful stored research note for this board.' },
        { date: '2026-08-28', headline: 'Travel context', detail: 'Another meaningful stored research note for this board.' },
      ],
    }, '2026-09-01');
    expect(summaries).toEqual([
      { date: '2026-08-31', hasGamePicks: true, hasProps: false, hasResearch: false },
      { date: '2026-08-30', hasGamePicks: false, hasProps: true, hasResearch: true },
      { date: '2026-08-28', hasGamePicks: false, hasProps: false, hasResearch: true },
    ]);

    const substantiveDays = {
      '2026-08-31': {
        picks: [
          { awayTeam: 'A', homeTeam: 'B', pick: 'A ML' },
          { awayTeam: 'C', homeTeam: 'D', pick: 'C ML' },
        ],
        props: [], insights: [],
      },
      '2026-08-30': {
        picks: [],
        props: [{ player: 'Jane Doe', bet: 'Over 1.5 hits' }],
        insights: [{ headline: 'Market context', detail: 'A meaningful stored research note for this board.' }],
      },
      '2026-08-28': {
        picks: [], props: [],
        insights: [
          { headline: 'Rotation context', detail: 'A meaningful stored research note for this board.' },
          { headline: 'Travel context', detail: 'Another meaningful stored research note for this board.' },
        ],
      },
    };
    for (const summary of summaries) {
      expect(archiveEditorialStats(substantiveDays[summary.date as keyof typeof substantiveDays]).substantive).toBe(true);
    }
  });
});
