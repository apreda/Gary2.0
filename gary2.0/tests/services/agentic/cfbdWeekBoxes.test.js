import { describe, it, expect, vi } from 'vitest';
import { getWeekBoxScores } from '../../../src/services/providers/cfbdService.js';

// CFBD refuses week 0 with a 400 that is never cached, so each desk build asked again (Nov 10 2026).
describe('a week of CFBD team boxes', () => {
  it('makes no call for week 0', async () => {
    const fetchImpl = vi.fn();
    expect(await getWeekBoxScores(2026, 0, { fetchImpl })).toEqual({ rows: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
