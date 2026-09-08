import { describe, expect, it } from 'vitest';
import {
  calculateNflHitRate,
  getNflGameTotalContext,
  isSupportedNflPropType,
  isNflTouchdownPropType,
  hasNflPropStatEvidence,
  validateNflPropBoard,
} from '../../../src/services/agentic/nflPropsAgenticContext.js';

describe('NFL touchdown market coverage', () => {
  it('recognizes all supported passing, rushing, receiving, and anytime aliases', () => {
    for (const type of [
      'passing_touchdowns', 'passing_tds', 'player_pass_tds',
      'rushing_touchdowns', 'player_rush_tds',
      'receiving_touchdowns', 'player_rec_tds',
      'anytime_touchdown', 'player_anytime_td'
    ]) {
      expect(isNflTouchdownPropType(type), type).toBe(true);
    }
    expect(isNflTouchdownPropType('receiving_yards')).toBe(false);
  });

  it('accepts only exact full-game markets that the deterministic grader supports', () => {
    for (const type of [
      'passing_tds', 'passing_completions', 'rushing_attempts',
      'longest_pass', 'longest_reception', 'longest_rush',
      'rushing_receiving_yards', 'anytime_td',
    ]) {
      expect(isSupportedNflPropType(type), type).toBe(true);
    }
    expect(isSupportedNflPropType('passing_yards_1q')).toBe(false);
    expect(isSupportedNflPropType('kicking_yards')).toBe(false);
    expect(isSupportedNflPropType('')).toBe(false);
  });

  it('grades receiving-TD and anytime-TD recent hit rates from the right fields', () => {
    const games = [
      { rec_tds: 1, rush_tds: 0 },
      { rec_tds: 0, rush_tds: 1 },
      { rec_tds: 0, rush_tds: 0 }
    ].map(game => ({ ...game, fumbles_touchdowns: 0, interception_touchdowns: 0, kick_return_touchdowns: 0, punt_return_touchdowns: 0 }));

    const receiving = calculateNflHitRate(games, 'receiving_touchdowns', 0.5);
    expect(receiving.hitsOver).toBe(1);
    expect(receiving.values).toEqual([1, 0, 0]);

    const anytime = calculateNflHitRate(games, 'anytime_touchdown', 0.5);
    expect(anytime.hitsOver).toBe(2);
    expect(anytime.values).toEqual([1, 1, 0]);
  });

  it('never counts sparse TD summaries as no-score games', () => {
    const games = [{}, { rec_tds: null, rush_tds: null }, { rec_tds: 0, rush_tds: 0 }, { rec_tds: 1, rush_tds: 0 }];
    expect(calculateNflHitRate(games, 'anytime_td', 0.5)).toBeNull();
    expect(hasNflPropStatEvidence(games[0], 'anytime_td')).toBe(false);
    expect(hasNflPropStatEvidence(games[3], 'anytime_td')).toBe(true);
  });

  it('counts a return TD when the complete scoring categories are measured', () => {
    const game = { rush_tds: 0, rec_tds: 0, fumbles_touchdowns: 0, interception_touchdowns: 0, kick_return_touchdowns: 0, punt_return_touchdowns: 1 };
    expect(calculateNflHitRate([game], 'anytime_td', 0.5)).toMatchObject({ hitsOver: 1, totalGames: 1, values: [1] });
  });

  it.each([' ', false, [], 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects corrupt measured history %j', value => {
    expect(calculateNflHitRate([{ rec_yds: value }], 'receiving_yards', 49.5)).toBeNull();
  });

  it('maps official passing and rushing attempt tokens to the verified recent log fields', () => {
    const games = [
      { pass_tds: 2, pass_comp: 24, pass_att: 33, rush_att: 7 },
      { pass_tds: 1, pass_comp: 20, pass_att: 29, rush_att: 5 },
    ];
    expect(calculateNflHitRate(games, 'passing_tds', 1.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'passing_completions', 21.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'passing_attempts', 30.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'rushing_attempts', 6.5).hitsOver).toBe(1);
  });
});

describe('NFL per-market stat evidence', () => {
  const prop = { player: 'Fixture Receiver', player_id: 1, team: 'Home', prop_type: 'receiving_yards', line: 49.5 };
  const input = { props: [prop], candidates: [{ player: prop.player }], playerIdMap: { 'fixture receiver': { id: 1, team: 'Home' } } };

  it('rejects roster-only, unrelated-stat, empty-log and wrong-ID evidence', () => {
    for (const evidence of [{}, { playerSeasonStats: { 1: { passing_yards: 100 } } },
      { playerGameLogs: { 1: { games: [] } } }, { playerSeasonStats: { 2: { receiving_yards: 100 } } }]) {
      expect(validateNflPropBoard({ ...input, ...evidence })).toEqual([]);
    }
  });

  it('retains measured zero and separately carried prior-season game evidence', () => {
    expect(validateNflPropBoard({ ...input, playerSeasonStats: { 1: { receiving_yards: '0' } } })).toEqual([prop]);
    expect(validateNflPropBoard({ ...input, priorGameLogs: { 1: { games: [{ rec_yds: 83 }] } } })).toEqual([prop]);
  });

  it('rejects conflicting provider identities and only admits grounded markets for a valid player', () => {
    const props = [prop, { ...prop, player_id: 2 }, { ...prop, prop_type: 'receptions' }];
    expect(validateNflPropBoard({ ...input, props, playerGameLogs: { 1: { games: [{ rec_yds: 83, receptions: null }] } } })).toEqual([prop]);
  });

  it('requires every combo component and preserves signed yardage', () => {
    expect(hasNflPropStatEvidence({ rush_yds: -3, rec_yds: 12 }, 'rushing_receiving_yards')).toBe(true);
    expect(hasNflPropStatEvidence({ rush_yds: -3 }, 'rushing_receiving_yards')).toBe(false);
    expect(hasNflPropStatEvidence({ receptions: -1 }, 'receptions')).toBe(false);
  });
});

describe('NFL game environment', () => {
  it('preserves a pick-em spread instead of treating zero as missing', () => {
    const context = getNflGameTotalContext({
      total: { line: 44 },
      spread: { home: { point: 0 } }
    }, 'Home', 'Away');

    expect(context.available).toBe(true);
    expect(context.spread).toBe(0);
    expect(context.gameScript).toBe('TOSS_UP');
    expect(context.impliedPoints.home.points).toBe(22);
    expect(context.impliedPoints.away.points).toBe(22);
  });

  it('uses the home spread to calculate implied team totals', () => {
    const context = getNflGameTotalContext({
      total: { line: 47 },
      spread: { home: { point: -3 } }
    }, 'Chiefs', 'Raiders');

    expect(context.favorite).toBe('Chiefs');
    expect(context.impliedPoints.home.points).toBe(25);
    expect(context.impliedPoints.away.points).toBe(22);
  });
});
