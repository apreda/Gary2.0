// A player with seconds on the floor played (Nov 10 2026 data round: "0:58" read as not played, and Washington's Beekman
// read "not in any of the team's last 10 games" after 58 seconds on Oct 23).
import { describe, expect, it } from 'vitest';
import { playedAny } from '../../src/services/gary/agentic/scoutReport/sports/nba.js';

describe('NBA injury list: when a player last played', () => {
  it('counts seconds on the floor as playing', () => {
    expect(['0:58', '0:34', '12', '33:15'].map(playedAny)).toEqual([true, true, true, true]);
    expect(['0', '0:00', '', null].map(playedAny)).toEqual([false, false, false, false]);
  });
});
