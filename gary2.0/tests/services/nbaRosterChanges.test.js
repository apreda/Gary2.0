import { describe, it, expect } from 'vitest';
import { teamChanges } from '../../src/services/nbaRosterChanges.js';

const p = (name, games, minutes) => ({ name, games, minutes, pts: games * 10, reb: games * 4, ast: games * 3 });
const data = { season: 2025, teams: {
  2: { name: 'Boston Celtics', minutes: 1000, players: { 1: p('Derrick White', 10, 400), 2: p('Jaylen Brown', 10, 500), 3: p('Deep Bench', 2, 100) } },
  23: { name: 'Philadelphia 76ers', minutes: 1000, players: { 4: p('Paul George', 10, 300) } },
} };

describe('roster changes since last season', () => {
  it('says how much of last season is back, who returned, arrived and left, and where the departed went', () => {
    const roster = [{ id: 1, first_name: 'Derrick', last_name: 'White' }, { id: 4, first_name: 'Paul', last_name: 'George' }, { id: 9, first_name: 'New', last_name: 'Rookie' }];
    const out = teamChanges(data, 2, roster, (id) => (id === 2 ? 'Philadelphia 76ers' : null));
    expect(out.share).toBe(40);
    expect(out.returning).toEqual(['Derrick White (10 games, 40.0 min, 10.0 pts, 4.0 reb, 3.0 ast)']);
    expect(out.arrived).toEqual(['Paul George (2025-26 with the Philadelphia 76ers: 10 games, 30.0 min, 10.0 pts, 4.0 reb, 3.0 ast)', 'New Rookie (no NBA games in 2025-26)']);
    expect(out.departed).toEqual(['Jaylen Brown (now Philadelphia 76ers; 10 games, 50.0 min, 10.0 pts, 4.0 reb, 3.0 ast)']);
  });
});
