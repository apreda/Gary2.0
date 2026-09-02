import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../src/services/ballDontLieService.js';

// PRESEASON NEVER COUNTS (founder law, Aug 21 2026). Probed Sep 2 2026: a
// week before Week 1, BDL's /nfl/v1/standings carried the August exhibition
// results (Rams 3-0, win streak 3, playoff seed 1) — a record, a streak and a
// seed no consumer may print. The feed is withheld until a regular-season
// game of that season is final.

afterEach(() => {
  vi.restoreAllMocks();
});

const scheduledWeek1 = [
  { id: 1, postseason: false, status: 'scheduled', status_state: 'scheduled' },
  { id: 2, postseason: false, status: 'scheduled', status_state: 'scheduled' },
];
const finalWeek1 = [
  { id: 1, postseason: false, status: 'Final', status_state: 'final' },
  { id: 2, postseason: false, status: 'scheduled', status_state: 'scheduled' },
];
// Wild-card rows ride weeks[]=1 too (probed: 2025 returned 16 regular + 6
// postseason rows) — a finished PLAYOFF game must not count as "underway".
const playoffOnlyWeek1 = [
  { id: 9, postseason: true, status: 'Final', status_state: 'final' },
];

describe('NFL standings before the regular season', () => {
  it('withholds the feed while every Week 1 game is still scheduled', async () => {
    vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue(scheduledWeek1);
    const fetchStub = vi.spyOn(globalThis, 'fetch');
    expect(await ballDontLieService.nflStandingsCountable(2026)).toBe(false);
    expect(await ballDontLieService.getNflStandings(2026)).toEqual([]);
    expect(await ballDontLieService.getStandingsGeneric('americanfootball_nfl', { season: 2026 })).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(ballDontLieService.getGames).toHaveBeenCalledWith('americanfootball_nfl', { seasons: [2026], weeks: [1], per_page: 100 });
  });

  it('a finished playoff row alone does not make the season underway', async () => {
    vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue(playoffOnlyWeek1);
    expect(await ballDontLieService.nflStandingsCountable(2026)).toBe(false);
  });

  it('opens once one regular-season game is final', async () => {
    vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue(finalWeek1);
    expect(await ballDontLieService.nflStandingsCountable(2026)).toBe(true);
  });

  it('is false with no season at all', async () => {
    expect(await ballDontLieService.nflStandingsCountable(null)).toBe(false);
  });
});
