import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../src/services/ballDontLieService.js';
import { ballDontLieService as modularBallDontLieService } from '../../src/services/ballDontLie/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('football team-stats transport routing', () => {
  it('never substitutes the NFL SDK player-stats method for the team-stats endpoint', async () => {
    const getStats = vi.fn().mockResolvedValue({
      data: [{ player: { id: 99 }, team: { id: 1 }, rushing_yards: 12 }],
    });
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getStats });

    const teamRows = [{
      team: { id: 1 },
      game: { id: 800, season: 2099, status: 'Final' },
      rushing_yards: 120,
    }];
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: teamRows }),
    });

    const rows = await ballDontLieService.getTeamStats(
      'americanfootball_nfl',
      { team_ids: [1], seasons: [2099], per_page: 100 },
      0,
    );

    expect(getStats).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(String(fetchStub.mock.calls[0][0])).toContain('/nfl/v1/team_stats?');
    expect(rows).toEqual(teamRows);
  });

  it('keeps the modular football service on the same team-stats route', async () => {
    modularBallDontLieService.clearCache();
    const getStats = vi.fn().mockResolvedValue({
      data: [{ player: { id: 88 }, team: { id: 2 }, passing_yards: 14 }],
    });
    vi.spyOn(modularBallDontLieService, '_getSportClient').mockReturnValue({ getStats });

    const teamRows = [{
      team: { id: 2 },
      game: { id: 801, season: 2098, status: 'Final' },
      passing_yards: 240,
    }];
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: teamRows }),
    });

    const rows = await modularBallDontLieService.getTeamStats(
      'americanfootball_nfl',
      { team_ids: [2], seasons: [2098], per_page: 100 },
      0,
    );

    expect(getStats).not.toHaveBeenCalled();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(String(fetchStub.mock.calls[0][0])).toContain('/nfl/v1/team_stats?');
    expect(rows).toEqual(teamRows);
  });
});
