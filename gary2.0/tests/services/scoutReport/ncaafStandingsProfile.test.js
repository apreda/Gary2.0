import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService as bdl } from '../../../src/services/ballDontLieService.js';
import { fetchTeamProfile } from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('NCAAF profile uses its conference standings reader', () => {
  it.each([10, { id: 10 }])('restores current overall/home/away/conference records (conference %j)', async conference => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T16:00:00Z'));
    const team = { id: 111, full_name: 'Georgia Bulldogs', conference };
    vi.spyOn(bdl, 'getTeams').mockResolvedValue([team]);
    vi.spyOn(bdl, 'getTeamSeasonStats').mockResolvedValue([{ team, passing_yards_per_game: 200 }]);
    const generic = vi.spyOn(bdl, 'getStandingsGeneric').mockResolvedValue([]);
    const dedicated = vi.spyOn(bdl, 'getNcaafStandings').mockResolvedValue([
      { team, season: 2025, wins: 12, losses: 2 },
      { team: { id: 107 }, season: 2026, wins: 1, losses: 1 },
      { team, season: 2026, wins: 2, losses: 0, home_record: '2-0', away_record: '0-0', conference_record: '0-0' },
    ]);
    expect(await fetchTeamProfile('Georgia Bulldogs', 'NCAAF')).toMatchObject({
      record: '2-0', homeRecord: '2-0', awayRecord: '0-0', conferenceRecord: '0-0', recordSeason: 2026, recordSource: 'standings',
    });
    expect(dedicated).toHaveBeenCalledWith(2026, 10);
    expect(generic).not.toHaveBeenCalled();
  });
});
