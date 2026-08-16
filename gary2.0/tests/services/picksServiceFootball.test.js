import { describe, expect, it } from 'vitest';

// picksService initializes its Supabase clients at module evaluation time.
// Load the canonical test environment first so this pure calendar test does
// not depend on whichever shell happened to launch Vitest.
await import('../../src/loadEnv.js');
const { getNFLSeason, getNFLWeekStart } = await import('../../src/services/picksService.js');

describe('NFL weekly storage calendar', () => {
  it('anchors Sunday and Monday games to the same Tue–Mon ET publication week', () => {
    expect(getNFLWeekStart(new Date('2026-09-13T17:00:00Z'))).toBe('2026-09-08');
    expect(getNFLWeekStart(new Date('2026-09-15T00:15:00Z'))).toBe('2026-09-08');
  });

  it('handles an ET date close to UTC midnight without shifting the week', () => {
    expect(getNFLWeekStart(new Date('2026-11-03T04:30:00Z'))).toBe('2026-10-27');
  });

  it('assigns preseason to the new season and playoffs to the prior season', () => {
    expect(getNFLSeason(new Date('2026-08-15T16:00:00Z'))).toBe(2026);
    expect(getNFLSeason(new Date('2027-02-08T01:30:00Z'))).toBe(2026);
  });
});
