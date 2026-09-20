import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { easternDate, easternDateOffset, easternHour, shiftDateKey } from '../../supabase/functions/_shared/dateKeys.js';
import { getESTDate, toESTDate } from '../../src/utils/dateUtils.js';

describe('Eastern calendar keys, distinct from elapsed time', () => {
  it.each([
    ['2026-03-09T04:30:00Z', '2026-03-09', '2026-03-08'],
    ['2026-11-02T04:30:00Z', '2026-11-01', '2026-10-31'],
    ['2026-09-20T01:00:00Z', '2026-09-19', '2026-09-18'],
    ['2027-01-01T05:30:00Z', '2027-01-01', '2026-12-31'],
  ])('chooses the calendar day and yesterday for %s', (instant, today, yesterday) => {
    expect(getESTDate(instant)).toBe(today);
    expect(easternDateOffset(-1, instant)).toBe(yesterday);
    expect(easternDateOffset(0, instant)).toBe(today);
  });

  it('preserves provider date-only keys while converting real timestamps', () => {
    expect(toESTDate('2026-09-19')).toBe('2026-09-19');
    expect(toESTDate('2026-09-19T00:00:00Z')).toBe('2026-09-18');
    expect(shiftDateKey('2026-03-08', 1)).toBe('2026-03-09');
    expect(shiftDateKey('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(() => shiftDateKey('2026-02-30', 1)).toThrow(RangeError);
    expect(() => shiftDateKey('2026-09-19', 0.5)).toThrow(RangeError);
    expect(() => easternDate('invalid')).toThrow(RangeError);
    expect(easternHour('2026-11-01T05:30:00Z')).toBe(1);
    expect(easternHour('2026-11-01T06:30:00Z')).toBe(1);
  });

  it.each(['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'])('uses the same season/date/hour with host TZ=%s', TZ => {
    const module = new URL('../../src/utils/dateUtils.js', import.meta.url).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import {mlbSeason,nbaSeason,nflSeason,ncaafSeason,nhlSeason,ncaabSeason,getESTDate,getESTHour} from ${JSON.stringify(module)};
      console.log(JSON.stringify([
        mlbSeason(new Date('2027-01-01T05:30:00Z')),
        nbaSeason(new Date('2026-10-01T04:30:00Z')),
        nflSeason(new Date('2026-08-01T04:30:00Z')),
        ncaafSeason(new Date('2026-08-01T03:30:00Z')),
        nhlSeason(new Date('2026-10-01T04:30:00Z')),
        ncaabSeason(new Date('2026-11-01T04:30:00Z')),
        getESTDate('2026-09-20T01:00:00Z'),getESTHour('2026-03-08T07:30:00Z')
      ]));`], { encoding: 'utf8', env: {...process.env, TZ} });
    expect(JSON.parse(result)).toEqual([2027, 2026, 2026, 2025, 2026, 2026, '2026-09-19', 3]);
  });
});
