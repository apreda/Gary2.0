/**
 * THE STAKES — division clause pins (founder GO, Aug 10 2026).
 * Division position + GB restored after the CWS receipt (the first-place
 * club Gary faded three straight days read as just another record). Seed
 * and record-species numbers stay removed per the Aug 5 rulings; the
 * clause fails open when standings fields are short.
 */
import { describe, it, expect } from 'vitest';
import { stakesLine } from '../../../src/services/pickdesk/mlbDesk.js';

const row = (display, div, wins, losses, gb, extras = {}) => ({
  team: { display_name: display },
  division_name: `American League ${div}`,
  division_short_name: `AL ${div}`,
  division_games_behind: gb,
  wins, losses, streak: 2, last_ten_games: '5-5',
  ...extras,
});

const AL_CENTRAL = [
  row('Chicago White Sox', 'Cent', 61, 56, 0),
  row('Cleveland Guardians', 'Cent', 58, 59, 3),
  row('Minnesota Twins', 'Cent', 57, 60, 4.5),
];

describe('stakesLine — division clause', () => {
  it('prints the leader with the gap back to 2nd', () => {
    expect(stakesLine(AL_CENTRAL, 'White Sox'))
      .toBe('White Sox: 61-56, streak 2, L10 5-5, 1st AL Cent (+3)');
  });

  it('prints a trailer with ordinal and games behind', () => {
    expect(stakesLine(AL_CENTRAL, 'Twins'))
      .toBe('Twins: 57-60, streak 2, L10 5-5, 3rd AL Cent (−4.5)');
  });

  it('fails open to the Aug 5 shape when division fields are missing', () => {
    const bare = [{ team: { display_name: 'Chicago White Sox' }, wins: 61, losses: 56, streak: 2, last_ten_games: '5-5' }];
    expect(stakesLine(bare, 'White Sox')).toBe('White Sox: 61-56, streak 2, L10 5-5');
  });
});

/**
 * RL BOARD ROW pins (Aug 10 live-fire catch): the RL board must be ±1.5 —
 * a preferred book listing an alternate spread (-2.5) walks down the book
 * order, and no ±1.5 anywhere → null (blind-flow fallback owns the game).
 */
import { chooseRunLineRow, buildRunLineBoardSection } from '../../../src/services/pickdesk/mlbDesk.js';

describe('chooseRunLineRow', () => {
  const row = (vendor, sh, sho, sao) => ({ vendor, spread_home_value: sh, spread_away_value: -sh, spread_home_odds: sho, spread_away_odds: sao });

  it('skips a preferred book posting an alternate line and takes the next book at ±1.5', () => {
    const rows = [row('draftkings', -2.5, -426, 293), row('fanduel', -1.5, -148, 122)];
    expect(chooseRunLineRow(rows)?.vendor).toBe('fanduel');
    expect(buildRunLineBoardSection(rows, 'Padres', 'Astros')).toContain('-1.5 (-148)');
    expect(buildRunLineBoardSection(rows, 'Padres', 'Astros')).not.toContain('2.5');
  });

  it('returns null when no book posts ±1.5 — the blind-flow fallback owns the game', () => {
    expect(chooseRunLineRow([row('draftkings', -2.5, -426, 293)])).toBeNull();
    expect(buildRunLineBoardSection([row('draftkings', -2.5, -426, 293)], 'H', 'A')).toBeNull();
  });
});
