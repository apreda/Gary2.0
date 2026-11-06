import { describe, expect, it } from 'vitest';
import { countdown, dayLine, netUnits, recordText, toPlay, unitsNet } from '@/lib/book/winners-play';
import type { WinnersBoard } from '@/lib/book/access';

const ticket = (over: Partial<WinnersBoard['tickets'][number]>, snap: Record<string, unknown>) =>
  ({
    candidate_id: 1,
    game_date: '2026-11-05',
    league: 'NFL',
    kind: 'game',
    admitted_at: '',
    stake_units: 4,
    pick_snapshot: snap,
    ...over,
  }) as WinnersBoard['tickets'][number];

const game = toPlay(ticket({ result: { result: 'won', away_score: 33, home_score: 10 } }, {
  pick: 'Jacksonville Jaguars -9.5 -120',
  odds: '-120',
  awayTeam: 'Jacksonville Jaguars',
  homeTeam: 'Baltimore Ravens',
}));
const prop = toPlay(ticket({ candidate_id: 2, kind: 'prop', league: 'NBA', stake_units: '6.0000', result: { result: 'lost', actual_value: 10 } }, {
  player: 'Bam Adebayo', prop: 'rebounds 9.5', bet: 'under', odds: -125, matchup: 'Miami Heat @ Golden State Warriors',
}));

describe('a Winners play', () => {
  it('reads a game ticket as the app does', () => {
    expect(game).toMatchObject({ title: 'Jacksonville Jaguars -9.5', short: 'Jaguars -9.5', price: -120, direction: null, result: 'won' });
  });
  it('lifts over or under off a prop card and keeps it on the one-line row', () => {
    expect(prop).toMatchObject({ short: 'Adebayo 9.5 rebounds', rowTitle: 'Adebayo under 9.5 rebounds', direction: 'under', price: -125, stakeUnits: 6 });
  });
  it('pays the real stake at the real price', () => {
    expect(unitsNet(netUnits(game))).toBe('+$333');
    expect(unitsNet(netUnits(prop))).toBe('-$600');
  });
  it('adds up the day and leaves a scratched play off it', () => {
    const line = dayLine([game, prop, { ...prop, id: 3, scratched: true }]);
    expect(recordText(line)).toBe('1-1');
    expect(unitsNet(line.units)).toBe('-$267');
  });
  it('counts down to the start and stops once it has started', () => {
    const now = Date.parse('2026-11-05T20:00:00Z');
    expect(countdown('2026-11-06T01:15:00Z', now)).toBe('5 h 15 min');
    expect(countdown('2026-11-05T20:35:00Z', now)).toBe('35 min');
    expect(countdown('2026-11-05T19:00:00Z', now)).toBeNull();
  });
});
