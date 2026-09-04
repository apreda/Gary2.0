import { describe, it, expect } from 'vitest';
import {
  etParts, isPlusMoneyMoneyline, isFirstDogOfDay, namedBigGame, isBigGame, ncaafBigGameId, winnersDecision,
} from '../../../src/services/pickdesk/winnersRules.js';

describe('winnersRules — the first dog of the day', () => {
  it('a dog is a plus-money MONEYLINE; a +1.5 run line and a favorite are not', () => {
    expect(isPlusMoneyMoneyline({ type: 'moneyline', odds: 130 })).toBe(true);
    expect(isPlusMoneyMoneyline({ type: 'moneyline', odds: '+115' })).toBe(true);
    expect(isPlusMoneyMoneyline({ type: 'moneyline', odds: -140 })).toBe(false);
    expect(isPlusMoneyMoneyline({ type: 'spread', odds: 120, pick: 'Reds +1.5 (+120)' })).toBe(false);
    expect(isPlusMoneyMoneyline({ pick: 'Reds +1.5 +120', odds: 120 })).toBe(false); // untyped run line
    expect(isPlusMoneyMoneyline({ pick: 'Reds ML +120', odds: 120 })).toBe(true);    // untyped moneyline
    expect(isPlusMoneyMoneyline(null)).toBe(false);
  });

  it('identifies the first plus-money moneyline for Home featuring', () => {
    const dog = { type: 'moneyline', odds: 125, game_id: '2', league: 'MLB' };
    expect(isFirstDogOfDay(dog, [])).toBe(true);
    expect(isFirstDogOfDay(dog, [{ type: 'moneyline', odds: -150, game_id: '1' }])).toBe(true);
    expect(isFirstDogOfDay(dog, [{ type: 'spread', odds: 110, game_id: '1', pick: 'Rays +1.5 (+110)' }])).toBe(true);
    expect(isFirstDogOfDay(dog, [{ type: 'moneyline', odds: 140, game_id: '1' }])).toBe(false);
    // its own earlier row (a re-run) never counts against it
    expect(isFirstDogOfDay(dog, [{ type: 'moneyline', odds: 125, game_id: '2' }])).toBe(true);
    expect(isFirstDogOfDay({ type: 'moneyline', odds: -120, game_id: '3' }, [])).toBe(false);
  });
});

describe('winnersRules — the big game', () => {
  it('etParts reads the ET weekday and clock', () => {
    // 2026-09-06 is a Sunday; 23:10Z = 7:10 PM EDT
    expect(etParts('2026-09-06T23:10:00Z')).toEqual({ date: '2026-09-06', dow: 0, minutes: 19 * 60 + 10 });
    expect(etParts('not a date')).toBeNull();
  });

  it('MLB: Sunday Night Baseball only', () => {
    expect(isBigGame({ league: 'MLB', game: { commence_time: '2026-09-06T23:10:00Z' } })).toBe(true);   // Sun 7:10 PM ET
    expect(isBigGame({ league: 'MLB', game: { commence_time: '2026-09-06T17:35:00Z' } })).toBe(false);  // Sun 1:35 PM ET
    expect(isBigGame({ league: 'MLB', game: { commence_time: '2026-09-02T23:10:00Z' } })).toBe(false);  // Wed 7:10 PM ET
  });

  it('MLB: a founder-named game goes on any day', () => {
    const overrides = { '2026-09-02': { MLB: 'Mariners @ Red Sox' } };
    const game = { commence_time: '2026-09-02T23:10:00Z', home_team: 'Boston Red Sox', away_team: 'Seattle Mariners' };
    expect(namedBigGame(overrides, '2026-09-02', 'MLB', game)).toBe(true);
    expect(isBigGame({ league: 'MLB', game, overrides })).toBe(true);
    expect(isBigGame({ league: 'MLB', game: { ...game, away_team: 'Houston Astros' }, overrides })).toBe(false);
  });

  it('NFL: the national window — Sunday night, any Monday or Thursday game', () => {
    expect(isBigGame({ league: 'NFL', game: { commence_time: '2026-09-14T00:20:00Z' } })).toBe(true);   // Sun 8:20 PM ET
    expect(isBigGame({ league: 'NFL', game: { commence_time: '2026-09-13T17:00:00Z' } })).toBe(false);  // Sun 1:00 PM ET
    expect(isBigGame({ league: 'NFL', game: { commence_time: '2026-09-15T00:15:00Z' } })).toBe(true);   // Mon 8:15 PM ET
    expect(isBigGame({ league: 'NFL', game: { commence_time: '2026-09-11T00:15:00Z' } })).toBe(true);   // Thu 8:15 PM ET
    expect(isBigGame({ league: 'NFL', game: { commence_time: '2026-09-12T23:00:00Z' } })).toBe(false);  // Sat
  });

  it('NCAAF: both ranked and the lowest combined ranking; else the highest-ranked team; else none', () => {
    const slate = [
      { id: 'a', homeRanking: 3, awayRanking: null, commence_time: '2026-09-05T16:00:00Z' },
      { id: 'b', homeRanking: 1, awayRanking: 5, commence_time: '2026-09-05T23:30:00Z' },
      { id: 'c', homeRanking: 2, awayRanking: 4, commence_time: '2026-09-05T20:00:00Z' },
      { id: 'd', homeRanking: null, awayRanking: null, commence_time: '2026-09-05T16:00:00Z' },
    ];
    expect(ncaafBigGameId(slate)).toBe('b');
    expect(ncaafBigGameId(slate.filter((g) => g.id !== 'b' && g.id !== 'c'))).toBe('a');
    expect(ncaafBigGameId([slate[3]])).toBeNull();
    expect(isBigGame({ league: 'NCAAF', game: slate[1], slate })).toBe(true);
    expect(isBigGame({ league: 'NCAAF', game: slate[2], slate })).toBe(false);
    // a one-game list (an exact-game child run) can never decide it on its own
    expect(isBigGame({ league: 'NCAAF', game: slate[1], slate: [slate[1]] })).toBe(false);
    expect(isBigGame({ league: 'NCAAF', game: slate[1], slate: [] })).toBe(false);
  });

  it('a tie on combined ranking goes to the later kickoff', () => {
    const slate = [
      { id: 'x', homeRanking: 2, awayRanking: 6, commence_time: '2026-09-05T16:00:00Z' },
      { id: 'y', homeRanking: 3, awayRanking: 5, commence_time: '2026-09-05T23:30:00Z' },
    ];
    expect(ncaafBigGameId(slate)).toBe('y');
  });
});

describe('winnersRules — the decision', () => {
  it('requires qualification even for the first dog or big game', () => {
    expect(winnersDecision({ firstDog: true, bigGame: true, verdict: 'WEAK' })).toEqual({ on_board: false, reason: null });
    expect(winnersDecision({ bigGame: true, verdict: 'WEAK' })).toEqual({ on_board: false, reason: null });
    expect(winnersDecision({ verdict: 'STRONG' })).toEqual({ on_board: true, reason: 'review' });
    expect(winnersDecision({ verdict: 'WEAK' })).toEqual({ on_board: false, reason: null });
    expect(winnersDecision({ verdict: null })).toEqual({ on_board: false, reason: null });
    expect(winnersDecision()).toEqual({ on_board: false, reason: null });
  });
});
