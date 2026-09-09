import { describe, it, expect } from 'vitest';
import { applyPropsPerGameConstraint } from '../../../src/services/agentic/propsSharedUtils.js';

const pick = (player, prop, confidence, matchup = 'Patriots @ Seahawks') => ({ player, prop, prop_type: prop, confidence, matchup, team: 'X' });

// Founder, Sep 9 2026: "we need 2 TD bets too" — two anytime touchdown cards a
// football game, one home run card a baseball game, both outside the two core props.
describe('the fun lane keeps two touchdown scorers a game and one home run', () => {
  it('keeps both anytime TD picks and both core props', () => {
    const { constrainedPicks, droppedPicks } = applyPropsPerGameConstraint([
      pick('Stevenson', 'anytime_td', 0.7), pick('Walker', 'anytime_td', 0.66),
      pick('Maye', 'passing_yards', 0.62), pick('JSN', 'receiving_yards', 0.6),
    ], 'nfl-test');
    expect(constrainedPicks.map((p) => p.player).sort()).toEqual(['JSN', 'Maye', 'Stevenson', 'Walker']);
    expect(droppedPicks).toHaveLength(0);
  });
  it('drops a third TD scorer, highest confidence first', () => {
    const { constrainedPicks, droppedPicks } = applyPropsPerGameConstraint([
      pick('A', 'anytime_td', 0.6), pick('B', 'anytime_td', 0.7), pick('C', 'anytime_td', 0.65),
    ], 'nfl-test');
    expect(constrainedPicks.map((p) => p.player)).toEqual(['B', 'C']);
    expect(droppedPicks.map((p) => p.player)).toEqual(['A']);
  });
  it('still keeps a single home run card a baseball game', () => {
    const { constrainedPicks, droppedPicks } = applyPropsPerGameConstraint([
      pick('Judge', 'home_runs', 0.6, 'Yankees @ Red Sox'), pick('Soto', 'home_runs', 0.55, 'Yankees @ Red Sox'),
    ], 'mlb-test');
    expect(constrainedPicks.map((p) => p.player)).toEqual(['Judge']);
    expect(droppedPicks.map((p) => p.player)).toEqual(['Soto']);
  });
});
