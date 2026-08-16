import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import {
  buildNcaafRosterIndex,
  fetchCompleteNcaafRoster,
  validateNcaafPropBoard,
} from '../../../src/services/agentic/ncaafPropsAgenticContext.js';
import {
  findExactNcaafStatRow,
  hasNcaafPropStatEvidence,
  ncaafActualFromStatRow,
} from '../../../src/services/ncaafPropStats.js';

const homeTeam = 'Ohio State Buckeyes';
const awayTeam = 'Texas Longhorns';
const homeRoster = [
  { id: 11, first_name: 'Julian', last_name: 'Sayin', position_abbreviation: 'QB' },
  { id: 12, first_name: 'Jeremiah', last_name: 'Smith', position_abbreviation: 'WR' },
];
const awayRoster = [
  { id: 21, first_name: 'Arch', last_name: 'Manning', position_abbreviation: 'QB' },
  { id: 22, first_name: 'Quintrevion', last_name: 'Wisner', position_abbreviation: 'RB' },
];

const rosterIndex = buildNcaafRosterIndex({ homeRoster, awayRoster, homeTeam, awayTeam });

afterEach(() => vi.restoreAllMocks());

describe('NCAAF roster validation source', () => {
  it('paginates and deduplicates the complete current BDL roster', async () => {
    const first = { id: 11, first_name: 'Julian', last_name: 'Sayin' };
    const second = { id: 12, first_name: 'Jeremiah', last_name: 'Smith' };
    const getPlayers = vi.spyOn(ballDontLieService, 'getPlayersActive')
      .mockResolvedValueOnce({ data: [first], meta: { next_cursor: 100 } })
      .mockResolvedValueOnce({ data: [first, second], meta: { next_cursor: null } });

    await expect(fetchCompleteNcaafRoster(57, 0)).resolves.toEqual([first, second]);
    expect(getPlayers).toHaveBeenNthCalledWith(1, 'americanfootball_ncaaf', {
      team_ids: [57], per_page: 100,
    }, 0);
    expect(getPlayers).toHaveBeenNthCalledWith(2, 'americanfootball_ncaaf', {
      team_ids: [57], per_page: 100, cursor: 100,
    }, 0);
  });

  it('fails closed on a repeated roster cursor instead of using a partial roster', async () => {
    vi.spyOn(ballDontLieService, 'getPlayersActive')
      .mockResolvedValueOnce({ data: [homeRoster[0]], meta: { next_cursor: 100 } })
      .mockResolvedValueOnce({ data: [homeRoster[1]], meta: { next_cursor: 100 } });

    await expect(fetchCompleteNcaafRoster(57, 0)).rejects.toThrow('repeated an NCAAF roster cursor');
  });
});

describe('NCAAF prop stat semantics', () => {
  const stat = {
    passing_yards: 275,
    passing_touchdowns: 2,
    passing_attempts: 31,
    passing_completions: 20,
    passing_interceptions: 1,
    rushing_yards: 45,
    rushing_attempts: 8,
    rushing_touchdowns: 1,
    receiving_yards: 15,
    receptions: 2,
    receiving_touchdowns: 0,
  };

  it('grades supported singles, combos, and anytime TD from real fields', () => {
    expect(ncaafActualFromStatRow(stat, 'passing_yards')).toBe(275);
    expect(ncaafActualFromStatRow(stat, 'rushing_receiving_yards')).toBe(60);
    expect(ncaafActualFromStatRow(stat, 'anytime_touchdown')).toBe(1);
    expect(ncaafActualFromStatRow({ rushing_touchdowns: null, receiving_touchdowns: 1 }, 'anytime_touchdown')).toBe(1);
    expect(ncaafActualFromStatRow({ ...stat, rushing_touchdowns: 0 }, 'anytime_touchdown')).toBe(0);
  });

  it('keeps missing data null instead of fabricating zero', () => {
    expect(ncaafActualFromStatRow({}, 'passing_yards')).toBeNull();
    expect(ncaafActualFromStatRow({ rushing_yards: 10 }, 'rushing_receiving_yards')).toBeNull();
    expect(ncaafActualFromStatRow({ rushing_touchdowns: 0 }, 'anytime_touchdown')).toBeNull();
    expect(hasNcaafPropStatEvidence({}, 'passing_yards')).toBe(false);
  });

  it('requires one exact BDL player id when selecting a game stat row', () => {
    const rows = [
      { player: { id: 21 }, passing_yards: 275 },
      { player: { id: 22 }, passing_yards: 80 },
    ];
    expect(findExactNcaafStatRow(rows, '21')).toBe(rows[0]);
    expect(findExactNcaafStatRow(rows, null)).toBeNull();
    expect(findExactNcaafStatRow([...rows, { player_id: 21 }], 21)).toBeNull();
  });
});

describe('NCAAF market player validation', () => {
  it('requires an exact current-game roster player and stamps BDL team/id', () => {
    const props = [{ player: 'Arch Manning', prop_type: 'passing_yards', line: 268.5 }];
    const currentStats = [{ player: { id: 21 }, passing_yards: 0 }];
    const result = validateNcaafPropBoard({ props, rosterIndex, currentStats, season: 2026 });

    expect(result.accepted).toEqual([
      expect.objectContaining({ player: 'Arch Manning', player_id: '21', team: awayTeam, _bdlStatsSeason: 2026 }),
    ]);
  });

  it('does not use surname-only or first-initial guessing', () => {
    const result = validateNcaafPropBoard({
      props: [{ player: 'A. Manning', prop_type: 'passing_yards', line: 268.5 }],
      rosterIndex,
      currentStats: [{ player: { id: 21 }, passing_yards: 0 }],
      season: 2026,
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('player_not_on_game_roster');
  });

  it('normalizes punctuation/suffixes without surname-only guessing', () => {
    const index = buildNcaafRosterIndex({
      homeRoster: [{ id: 99, first_name: 'D.J.', last_name: 'Lagway Jr.' }],
      awayRoster: [],
      homeTeam: 'Florida Gators',
      awayTeam: 'Miami Hurricanes',
    });
    const props = [{ player: 'DJ Lagway', prop_type: 'passing_yards', line: 240.5 }];
    const currentStats = [{ player_id: 99, passing_yards: 123 }];
    const result = validateNcaafPropBoard({ props, rosterIndex: index, currentStats, season: 2026 });
    expect(result.accepted).toEqual([
      expect.objectContaining({ player: 'D.J. Lagway Jr.', player_id: '99', team: 'Florida Gators', _bdlStatsSeason: 2026 }),
    ]);
  });

  it('uses current-season evidence first and prior-season evidence only as a labeled fallback', () => {
    const props = [
      { player: 'Arch Manning', prop_type: 'passing_yards', line: 268.5 },
      { player: 'Quintrevion Wisner', prop_type: 'anytime_touchdown', line: 0.5 },
    ];
    const currentStats = [{ player: { id: 21 }, passing_yards: 0 }];
    const previousStats = [{
      player: { id: 22 },
      rushing_touchdowns: 5,
      receiving_touchdowns: 1,
    }];
    const result = validateNcaafPropBoard({
      props, rosterIndex, currentStats, previousStats, season: 2026,
    });

    expect(result.accepted).toEqual([
      expect.objectContaining({ player: 'Arch Manning', player_id: '21', team: awayTeam, _bdlStatsSeason: 2026 }),
      expect.objectContaining({ player: 'Quintrevion Wisner', player_id: '22', team: awayTeam, _bdlStatsSeason: 2025 }),
    ]);
  });

  it('rejects a roster player when the offered market has no BDL stat field', () => {
    const props = [{ player: 'Jeremiah Smith', prop_type: 'rushing_yards', line: 4.5 }];
    const currentStats = [{ player: { id: 12 }, receiving_yards: 1200 }];
    const result = validateNcaafPropBoard({ props, rosterIndex, currentStats, season: 2026 });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('missing_bdl_stat_field');
  });

  it('rejects ambiguous same-name players across the two game rosters', () => {
    const ambiguous = buildNcaafRosterIndex({
      homeRoster: [{ id: 1, first_name: 'Chris', last_name: 'Johnson' }],
      awayRoster: [{ id: 2, first_name: 'Chris', last_name: 'Johnson' }],
      homeTeam,
      awayTeam,
    });
    const result = validateNcaafPropBoard({
      props: [{ player: 'Chris Johnson', prop_type: 'rushing_yards', line: 50.5 }],
      rosterIndex: ambiguous,
      currentStats: [
        { player: { id: 1 }, rushing_yards: 100 },
        { player: { id: 2 }, rushing_yards: 200 },
      ],
      season: 2026,
    });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('ambiguous_roster_name');
  });
});
