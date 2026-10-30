import { describe, expect, it } from 'vitest';
import { garyBets } from '../../src/services/cashRail/garyBets.js';

// Three plays: Love finds Kraft for 30 and then a 12-yd TD; Young runs for 11.
const pass = (yds, td, period, clock, home, away) => ({
  period, clock_display: clock, type_slug: td ? 'passing-touchdown' : 'pass-reception', stat_yardage: yds, scoring_play: td,
  home_score: home, away_score: away,
  participants: [{ type: 'passer', player_id: 53 }, { type: 'receiver', player_id: 935 }],
});
const plays = [
  pass(30, false, 1, '9:00', 0, 0),
  pass(12, true, 1, '5:08', 7, 0),
  { period: 2, clock_display: '10:00', type_slug: 'rush', stat_yardage: 11, home_score: 7, away_score: 0, participants: [{ type: 'rusher', player_id: 75 }] },
];
const game = { home_team: { name: 'Packers', abbreviation: 'GB' }, visitor_team: { name: 'Panthers', abbreviation: 'CAR' }, status_state: 'in' };
const props = [
  { player: 'Jordan Love', player_id: 53, prop: 'passing_yards 259.5', bet: 'over', line: '259.5' },
  { player: 'Bryce Young', player_id: 75, prop: 'rushing_yards 9.5', bet: 'under', line: '9.5' },
];
const darts = [
  { player: 'Tucker Kraft', player_id: '935', prop: 'anytime_td 0.5', bet: 'over' },
  { player: 'Christian Watson', player_id: '705', prop: 'anytime_td 0.5', bet: 'over' },
  { player: 'Jordan Love', player_id: '53', prop: 'passing_tds 1.5', bet: 'over' },
];

describe('Gary\'s own bets on the live game', () => {
  it('tracks his game pick against the score', () => {
    const [pick] = garyBets({ plays, game, garyPick: { type: 'spread', side: 'home', line: -3.5 }, props: [], darts: [] });
    expect(pick).toMatchObject({ kind: 'pick', title: 'GAME PICK', label: 'PACKERS −3.5', note: 'UP 7 · NEEDS 4+', ok: true, status: 'live' });
  });

  it('shows each prop climbing toward its line, and an under that is blown loses at once', () => {
    const box = garyBets({ plays, game, garyPick: null, props, darts: [] }).find(b => b.kind === 'props');
    expect(box.title).toBe('PROPS');
    expect(box.focus).toMatchObject({ label: 'LOVE O 259.5 PASS YDS', now: 42, line: 259.5, note: '42 OF 259.5' });
    expect(box.focus.progress).toBeCloseTo(42 / 259.5);
    expect(box.dots).toEqual(['live', 'lost']);
  });

  it('counts the darts that have hit, one dot each', () => {
    const box = garyBets({ plays, game, garyPick: null, props: [], darts }).find(b => b.kind === 'darts');
    expect(box).toMatchObject({ title: 'DARTS', label: '1 OF 3 HIT', dots: ['won', 'live', 'live'] });
  });

  it('settles everything at the final whistle', () => {
    const done = garyBets({ plays, game: { ...game, status_state: 'final' }, garyPick: { type: 'spread', side: 'home', line: -3.5 }, props, darts });
    expect(done.find(b => b.kind === 'pick').status).toBe('won');
    expect(done.find(b => b.kind === 'props').dots).toEqual(['lost', 'lost']);
    expect(done.find(b => b.kind === 'darts').dots).toEqual(['won', 'lost', 'lost']);
  });

  it('leaves out a box Gary has nothing in', () => {
    expect(garyBets({ plays, game, garyPick: null, props: [], darts: [] })).toEqual([]);
  });
});
