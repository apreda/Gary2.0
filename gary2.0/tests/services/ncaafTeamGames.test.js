import { describe, it, expect } from 'vitest';
import { ncaafTeamGameRows } from '../../src/services/sports/ncaaf/ncaafTeamGames.js';

const game = (over) => ({
  id: 457381, date: '2026-10-24T02:30:00.000Z', season: 2026, status: 'post', status_state: 'final',
  home_team: { full_name: 'Stanford Cardinal', abbreviation: 'STAN' }, visitor_team: { full_name: 'NC State Wolfpack', abbreviation: 'NCSU' },
  home_score: 31, away_score: 28, ...over,
});

describe('college finals for the team card', () => {
  it('keeps finals only, dated by the Eastern calendar (a late Friday kickoff is Friday)', () => {
    const rows = ncaafTeamGameRows([game(), game({ id: 2, status_state: 'pre', home_score: null, away_score: null })]);
    expect(rows).toEqual([expect.objectContaining({
      league: 'NCAAF', game_id: '457381', game_date: '2026-10-23', season: 2026,
      home_team: 'Stanford Cardinal', away_team: 'NC State Wolfpack', home_abbr: 'STAN', away_abbr: 'NCSU', home_score: 31, away_score: 28,
    })]);
  });
});
