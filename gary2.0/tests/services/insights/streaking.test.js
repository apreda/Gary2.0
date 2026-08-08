import { describe, expect, it } from 'vitest';
import { teamPlayedGame } from '../../../src/services/insights/computers/streaking.js';

describe('streaking team membership', () => {
  it('includes a historical MLB road game that only exposes away_team', () => {
    const final = {
      home_team: { id: 19, abbreviation: 'NYY' },
      away_team: { id: 2, abbreviation: 'ATL' },
    };

    expect(teamPlayedGame(final, 2)).toBe(true);
    expect(teamPlayedGame(final, 19)).toBe(true);
  });

  it('keeps supporting the orchestrator visitor_team alias', () => {
    const game = {
      home_team: { id: 19 },
      visitor_team: { id: 2 },
    };

    expect(teamPlayedGame(game, 2)).toBe(true);
  });

  it('rejects a team that did not play the game', () => {
    const game = { home_team: { id: 19 }, away_team: { id: 2 } };
    expect(teamPlayedGame(game, 5)).toBe(false);
  });
});
