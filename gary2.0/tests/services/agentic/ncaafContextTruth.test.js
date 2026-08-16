import { describe, expect, it } from 'vitest';
import { buildNcaafConferenceContext } from '../../../src/services/agentic/scoutReport/sports/ncaaf.js';
import { generateGameSignificance } from '../../../src/services/agentic/scoutReport/gameSignificanceGenerator.js';

describe('NCAAF factual context policy', () => {
  it('uses exact provider conference identity without editorial tiers', () => {
    const context = buildNcaafConferenceContext(
      'Georgia Bulldogs',
      'Ohio State Buckeyes',
      [
        { id: 1, full_name: 'Georgia Bulldogs', conference_id: 10 },
        { id: 2, full_name: 'Ohio State Buckeyes', conference: { id: 4 } },
      ],
    );

    expect(context).toEqual({
      homeTeam: 'Georgia Bulldogs',
      awayTeam: 'Ohio State Buckeyes',
      homeConference: 'SEC',
      awayConference: 'Big Ten',
      matchupType: 'CROSS-CONFERENCE',
    });
    expect(JSON.stringify(context)).not.toMatch(/tier|elite|upper|lower/i);
  });

  it('fails closed when a team or conference is not an exact provider match', () => {
    const teams = [
      { id: 1, full_name: 'Auburn Tigers', conference_id: 10 },
      { id: 2, full_name: 'Clemson Tigers', conference_id: 1 },
    ];

    expect(buildNcaafConferenceContext('LSU Tigers', 'Clemson Tigers', teams)).toBeNull();
    expect(buildNcaafConferenceContext('Auburn Tigers', 'Clemson Tigers', [
      teams[0],
      { id: 2, full_name: 'Clemson Tigers' },
    ])).toBeNull();
  });

  it('does not infer rivalries or national rankings from mascots and conference rank', () => {
    const standings = [
      { conference_rank: 1, team: { full_name: 'Auburn Tigers', conference: 'SEC' } },
      { conference_rank: 2, team: { full_name: 'Clemson Tigers', conference: 'ACC' } },
    ];
    const significance = generateGameSignificance({
      home_team: 'Auburn Tigers',
      away_team: 'Clemson Tigers',
    }, 'NCAAF', standings);

    expect(significance).toBe('College Football');
  });

  it('uses only explicit conference and AP-rank evidence', () => {
    expect(generateGameSignificance({
      home_team: 'Georgia Bulldogs',
      away_team: 'Ohio State Buckeyes',
      homeConference: 'SEC',
      awayConference: 'Big Ten',
    }, 'NCAAF')).toBe('SEC vs Big Ten');

    expect(generateGameSignificance({
      home_team: 'Georgia Bulldogs',
      away_team: 'Ohio State Buckeyes',
      home_ap_rank: 3,
      away_ap_rank: 8,
    }, 'NCAAF')).toBe('Ranked Matchup');
  });
});
