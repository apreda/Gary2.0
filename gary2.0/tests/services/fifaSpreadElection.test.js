// Un-trap the stripped favorite (Jul 7 2026, founder-approved option 1).
//
// July knockout forensics: favorites heavier than -200 lose their ML to the
// menu strip, forcing Gary onto AH -1.5 — but knockout favorites most often
// win by exactly ONE goal (5 of 9 July matches the stronger side won), the
// one outcome -1.5 can't cash (Colombia -1.5, France -1.5, Argentina -1.5
// all lost on one-goal wins). Fix: when the favorite is stripped, elect the
// LOWEST rung whose favorite side is still playable (not heavier than -200,
// the same threshold as the strip), whole lines included — AH -1.0 PUSHES on
// a one-goal win, and soccerGrading already supports push. Unstripped
// favorites keep the classic balanced-juice half-goal election.
import { describe, it, expect } from 'vitest';
import { selectConsensusOdds } from '../../src/services/fifaWorldCupService.js';

const rung = (side, handicap, odds) => ({ side, handicap: String(handicap), american_odds: odds });
const spreadMarket = (outcomes) => ({ type: 'spread', period: 'match', scope: 'match', key: 'spread_match_match_asian_handicap', outcomes });

function oddsRow({ mlHome, mlAway, rungs }) {
  return {
    vendor: 'draftkings',
    moneyline_home_odds: mlHome,
    moneyline_draw_odds: 300,
    moneyline_away_odds: mlAway,
    spread_home_value: null,
    total_value: null,
    markets: [spreadMarket(rungs)],
  };
}

describe('AH election un-traps stripped favorites', () => {
  it('stripped favorite (-295): elects the lowest playable rung — the whole-line -1.0', () => {
    const row = oddsRow({
      mlHome: -295, mlAway: 750,
      rungs: [
        rung('home', -0.5, -280), rung('away', 0.5, 230),
        rung('home', -1.0, -165), rung('away', 1.0, 140),
        rung('home', -1.5, 100), rung('away', 1.5, -120),
      ],
    });
    const q = selectConsensusOdds([row]);
    expect(q.spread.homeValue).toBe(-1.0);
    expect(q.spread.homeOdds).toBe(-165);
  });

  it('mega favorite (-900): -1.0 is too juicy, elects the lowest rung under the -200 cap', () => {
    const row = oddsRow({
      mlHome: -900, mlAway: 1800,
      rungs: [
        rung('home', -1.0, -350), rung('away', 1.0, 280),
        rung('home', -1.5, -180), rung('away', 1.5, 150),
        rung('home', -2.0, 105), rung('away', 2.0, -125),
      ],
    });
    const q = selectConsensusOdds([row]);
    expect(q.spread.homeValue).toBe(-1.5);
    expect(q.spread.homeOdds).toBe(-180);
  });

  it('unstripped favorite (-150): classic election unchanged — half-goal main line, never a whole line', () => {
    const row = oddsRow({
      mlHome: -150, mlAway: 380,
      rungs: [
        rung('home', -0.5, -110), rung('away', 0.5, -110),
        rung('home', -1.0, 130), rung('away', 1.0, -155),
        rung('home', -1.5, 240), rung('away', 1.5, -300),
      ],
    });
    const q = selectConsensusOdds([row]);
    expect(q.spread.homeValue).toBe(-0.5);
    expect(q.spread.homeOdds).toBe(-110);
  });

  it('stripped away favorite works symmetrically', () => {
    const row = oddsRow({
      mlHome: 700, mlAway: -260,
      rungs: [
        rung('home', 0.5, 220), rung('away', -0.5, -270),
        rung('home', 1.0, 135), rung('away', -1.0, -160),
        rung('home', 1.5, -115), rung('away', -1.5, -105),
      ],
    });
    const q = selectConsensusOdds([row]);
    expect(q.spread.homeValue).toBe(1.0);
    expect(q.spread.awayOdds).toBe(-160);
  });
});
