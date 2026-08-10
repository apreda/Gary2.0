/**
 * WINNERS SCORE v1 pins (founder GO, Aug 10 2026). The weekend's real
 * shapes: RL lays went 1-6, +1.5 dogs 2-0, and Gary's confidence band was
 * too compressed to rank anything — so the rank is ledger-empirical with
 * confidence as a small tiebreak, and thin classes fall back to neutral.
 */
import { describe, it, expect } from 'vitest';
import { classOf, classWinRates, winnersScore } from '../../../src/services/pickdesk/winnersScore.js';

describe('classOf', () => {
  it('reads the weekend ledger shapes', () => {
    expect(classOf('Phillies -1.5 -112')).toBe('rl_lay');
    expect(classOf('Athletics +1.5 -102')).toBe('rl_dog');
    expect(classOf('Rays ML +104')).toBe('ml_dog');
    expect(classOf('Guardians ML -125')).toBe('ml_fav_light');
    expect(classOf('Cubs ML -158')).toBe('ml_fav_heavy');
    expect(classOf('Padres moneyline — odds unavailable')).toBeNull();
  });
});

describe('classWinRates', () => {
  it('tallies won/lost per class and ignores voids', () => {
    const rows = [
      { pick_text: 'A -1.5 -120', result: 'lost' },
      { pick_text: 'B -1.5 -110', result: 'lost' },
      { pick_text: 'C -1.5 +119', result: 'won' },
      { pick_text: 'D +1.5 -102', result: 'won' },
      { pick_text: 'E ML +131', result: 'void' },
    ];
    expect(classWinRates(rows)).toEqual({
      rl_lay: { won: 1, lost: 2 },
      rl_dog: { won: 1, lost: 0 },
    });
  });
});

describe('winnersScore', () => {
  const rates = { rl_lay: { won: 2, lost: 8 }, ml_fav_light: { won: 12, lost: 6 } };

  it('ranks by the class prior with confidence as a small tiebreak', () => {
    // ml_fav_light: 12/18 = .667 base; conf .61 → +0.002
    expect(winnersScore('Guardians ML -125', 0.61, rates)).toBe(0.669);
    // rl_lay: 2/10 = .200 base; even a top-tick 0.64 barely moves it
    expect(winnersScore('Phillies -1.5 -112', 0.64, rates)).toBe(0.205);
  });

  it('falls back to neutral 0.5 when the class sample is under 8', () => {
    expect(winnersScore('Rays ML +104', 0.59, { ml_dog: { won: 3, lost: 1 } })).toBe(0.5);
  });

  it('handles missing confidence and missing class', () => {
    expect(winnersScore('Guardians ML -125', null, rates)).toBe(0.667);
    expect(winnersScore('odds unavailable', 0.6, rates)).toBeNull();
  });
});
