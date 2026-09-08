import { describe, expect, it } from 'vitest';
import { basisLine } from '../../../src/services/agentic/tools/statRouters/footballAdvanced.js';

const game = (id, phase, codes) => ({ game_id: id, season_type: phase,
  lines: Object.fromEntries(codes.map(code => [code, { offense: { plays: 60 } }])) });
const pair = games => ({ basis: 'prior_season', data_season: 2025,
  homeCode: 'SEA', awayCode: 'NE', note: 'No 2026 games have been played.', ledger: { games } });
const oldLine = "Computed from 2025 play-by-play (nflverse), every snap from scrimmage. No 2026 games have been played.";

describe('football play-ledger sample provenance', () => {
  it('names each team’s regular and postseason sample without counting other teams or shared games twice', () => {
    const games = [
      ...Array.from({ length: 17 }, (_, i) => game(`SEA-${i}`, 'REG', ['SEA', 'OTHER'])),
      ...Array.from({ length: 17 }, (_, i) => game(`NE-${i}`, 'REG', ['NE', 'OTHER'])),
      ...Array.from({ length: 2 }, (_, i) => game(`SEA-POST-${i}`, 'POST', ['SEA', 'OTHER'])),
      ...Array.from({ length: 3 }, (_, i) => game(`NE-POST-${i}`, 'POST', ['NE', 'OTHER'])),
      game('SB', 'POST', ['SEA', 'NE']), game('SB', 'POST', ['SEA', 'NE']),
      game('unrelated', 'REG', ['OTHER', 'THIRD']),
    ];
    const input = pair(games), original = structuredClone(input);
    const result = basisLine(input);
    expect(result).toContain('SEA: 20 games (17 regular season, 3 postseason)');
    expect(result).toContain('NE: 21 games (17 regular season, 4 postseason)');
    expect(result).toContain('No 2026 games have been played.');
    expect(result).not.toContain('OTHER:');
    expect(input).toEqual(original);
  });

  it('reports only the current team sample when the ledger contains regular-season games', () => {
    const input = { ...pair([game('one', 'REG', ['SEA', 'NE'])]), basis: 'current', data_season: 2026, note: '1 game into 2026.' };
    const result = basisLine(input);
    expect(result).toContain('Computed from 2026 play-by-play');
    expect(result).toContain('SEA: 1 game (1 regular season)');
    expect(result).toContain('NE: 1 game (1 regular season)');
  });

  it.each([
    undefined,
    [game('unknown', null, ['SEA', 'NE'])],
    [{ season_type: 'REG', lines: { SEA: {}, NE: {} } }],
    [game('conflict', 'REG', ['SEA', 'NE']), game('conflict', 'POST', ['SEA', 'NE'])],
  ])('preserves the existing basis when exact sample provenance is unavailable (%j)', games => {
    expect(basisLine(pair(games))).toBe(oldLine);
  });

  it('retains unavailable-ledger behavior', () => {
    expect(basisLine(null)).toBeNull();
    expect(basisLine({ ledger: null, note: 'Source unavailable.' })).toBe('Source unavailable.');
  });
});
