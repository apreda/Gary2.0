import { describe, expect, it } from 'vitest';
import { computePulsePasses, yesterdayOf } from '../../scripts/lib/marketPulseRunMode.js';

const TODAY = '2026-08-26';
const YESTERDAY = '2026-08-25';

describe('market pulse pass computation', () => {
  it('settles only yesterday on the pre-dawn slot — the run that closed the Aug 24/25 gap', () => {
    expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: false, etHour: 2, today: TODAY }))
      .toEqual([{ date: YESTERDAY, isToday: false }]);
    expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: false, etHour: 0, today: TODAY }))
      .toEqual([{ date: YESTERDAY, isToday: false }]);
    expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: false, etHour: 5, today: TODAY }))
      .toEqual([{ date: YESTERDAY, isToday: false }]);
  });

  it('re-settles yesterday before writing today between 6 and 10 AM ET (extra-inning marathon cover)', () => {
    for (const etHour of [6, 9]) {
      expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: false, etHour, today: TODAY }))
        .toEqual([
          { date: YESTERDAY, isToday: false },
          { date: TODAY, isToday: true },
        ]);
    }
  });

  it('stays today-anchored from 10 AM ET on — the live strip is unchanged', () => {
    for (const etHour of [10, 11, 16, 23]) {
      expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: false, etHour, today: TODAY }))
        .toEqual([{ date: TODAY, isToday: true }]);
    }
  });

  it('lets explicit flags win outright at any hour, with their old single-pass meaning', () => {
    expect(computePulsePasses({ dateArg: '2026-06-04', yesterdayFlag: false, etHour: 14, today: TODAY }))
      .toEqual([{ date: '2026-06-04', isToday: false }]);
    expect(computePulsePasses({ dateArg: '2026-06-04', yesterdayFlag: true, etHour: 2, today: TODAY }))
      .toEqual([{ date: '2026-06-04', isToday: false }]);
    expect(computePulsePasses({ dateArg: undefined, yesterdayFlag: true, etHour: 14, today: TODAY }))
      .toEqual([{ date: YESTERDAY, isToday: false }]);
  });
});

describe('yesterdayOf', () => {
  it('crosses month and year boundaries in ET terms', () => {
    expect(yesterdayOf('2026-09-01')).toBe('2026-08-31');
    expect(yesterdayOf('2026-01-01')).toBe('2025-12-31');
    expect(yesterdayOf('2026-03-01')).toBe('2026-02-28');
  });
});
