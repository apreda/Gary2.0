import { archiveGamePath } from '@/lib/gary/archive-path';
import { describe, expect, it } from 'vitest';
describe('archive routes', () => {
  it('builds crawlable permanent-matchup links only for routable archive picks', () => {
    expect(archiveGamePath({
      league: 'MLB',
      awayTeam: 'Red Sox',
      homeTeam: 'New York Yankees',
    }, '2026-08-30')).toBe('/picks/mlb/2026-08-30/red-sox-at-new-york-yankees');
    expect(archiveGamePath({ league: 'EPL', awayTeam: 'Arsenal', homeTeam: 'Spurs' }, '2026-08-30')).toBeNull();
    expect(archiveGamePath({ league: 'MLB', awayTeam: 'Cubs' }, '2026-08-30')).toBeNull();
  });
});
