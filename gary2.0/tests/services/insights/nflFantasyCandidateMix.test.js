import { describe, expect, it } from 'vitest';

import { nflFantasyInternals } from '../../../src/services/insights/computers/nflFantasyEdges.js';

const { mergeCandidates } = nflFantasyInternals;

function player(id, team, position) {
  return { id, team: { id: team }, position_abbreviation: position };
}

describe('NFL fantasy candidate mix', () => {
  it('keeps grounded rush and receiving roles represented on a crowded slate', () => {
    const rushing = Array.from({ length: 8 }, (_, index) => ({
      player: player(index + 1, index + 1, 'RB'),
      rush_attempts: 300 - index,
    }));
    const receiving = Array.from({ length: 8 }, (_, index) => ({
      player: player(index + 101, index + 11, index % 2 === 0 ? 'TE' : 'WR'),
      targets: 150 - index,
    }));

    const teamIds = new Set([...Array.from({ length: 8 }, (_, index) => String(index + 1)),
      ...Array.from({ length: 8 }, (_, index) => String(index + 11))]);
    const result = mergeCandidates(rushing, receiving, teamIds);

    expect(result).toHaveLength(8);
    expect(result.filter((row) => row.role === 'RB')).toHaveLength(4);
    expect(result.filter((row) => row.role === 'RECEIVER')).toHaveLength(4);
  });

  it('still fills the board when one role family is absent and caps each team at two', () => {
    const rushing = Array.from({ length: 10 }, (_, index) => ({
      player: player(index + 1, Math.floor(index / 2) + 1, 'RB'),
      rush_attempts: 250 - index,
    }));
    const result = mergeCandidates(rushing, [], new Set(['1', '2', '3', '4', '5']));
    const perTeam = result.reduce((counts, row) => {
      counts[row.team_id] = (counts[row.team_id] || 0) + 1;
      return counts;
    }, {});

    expect(result).toHaveLength(8);
    expect(Math.max(...Object.values(perTeam))).toBeLessThanOrEqual(2);
  });
});
