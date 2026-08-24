import { describe, it, expect } from 'vitest';
import { ticketNumbersDrift, restatementAcceptable } from '../../scripts/lib/ticketRestate.js';

// Real cases from the Aug 24 preseason audit — stored ticket vs the numbers
// the card's prose actually argued.
describe('ticketNumbersDrift — the audit cases', () => {
  it('Bills +3 -105 arguing "+2.5" drifts', () => {
    const prose = 'The Browns are laying 2.5 at home. Cleveland has not demonstrated a measurable advantage that warrants laying 2.5. I want the cushion with the underdog. Give me Buffalo +2.5.';
    expect(ticketNumbersDrift(prose, 3, -105)).toBe(true);
  });

  it('Chargers +1.5 -115 arguing "+1 at -110" drifts', () => {
    const prose = 'I’m taking the Chargers +1 at -110. The real wager begins when they leave.';
    expect(ticketNumbersDrift(prose, 1.5, -115)).toBe(true);
  });

  it('Packers +6.5 arguing "5.5" drifts', () => {
    const prose = 'The board is charging bettors 5.5 points to follow those results. That additional uncertainty makes 5.5 valuable.';
    expect(ticketNumbersDrift(prose, 6.5, -112)).toBe(true);
  });

  it('Lions -0.5 +100 arguing "lay the 1.5 points" drifts', () => {
    const prose = 'At a price still below a field goal, I will trust Detroit’s clearer listed quarterback ladder and lay the 1.5 points.';
    expect(ticketNumbersDrift(prose, -0.5, 100)).toBe(true);
  });

  it('Falcons +3.5 -102 arguing "-120" (price-only drift) drifts', () => {
    const prose = 'I’m taking the Falcons +3.5 at -120 because this price asks the Colts to cover beyond a field goal.';
    expect(ticketNumbersDrift(prose, 3.5, -102)).toBe(true);
  });

  it('Chiefs +6 -114 arguing "+5.5 at -106" drifts', () => {
    const prose = 'I’m taking Kansas City +5.5 at -106 because the Chiefs have the more credible four-quarter path at this number. I do not see enough verified separation to lay 5.5 points.';
    expect(ticketNumbersDrift(prose, 6, -114)).toBe(true);
  });

  it('Cardinals -0.5 -105 arguing "-1.5 and -102" drifts', () => {
    const prose = 'At -1.5 and -102, that is enough for me to put the ticket on Arizona.';
    expect(ticketNumbersDrift(prose, -0.5, -105)).toBe(true);
  });
});

describe('ticketNumbersDrift — the clean cases', () => {
  it('Titans -3 -107 with NO quoted numbers stays clean (the dodge is fine prose)', () => {
    const prose = 'Tennessee’s commitment to meaningful first-unit work still carries enough value to lay the points. I’m laying the points with Tennessee.';
    expect(ticketNumbersDrift(prose, -3, -107)).toBe(false);
  });

  it('Ravens +3.5 -110 quoting exactly +3.5 stays clean', () => {
    const prose = 'I will take Baltimore +3.5. The stronger measured quarterback baseline, equal rest and valuable hook beyond a field goal make Baltimore the side of the price I trust.';
    expect(ticketNumbersDrift(prose, 3.5, -110)).toBe(false);
  });

  it('final scores and stat lines never read as spreads', () => {
    const prose = 'Cleveland won 27-14 last week and allowed 6.8 yards per play; the total sat over 41.';
    expect(ticketNumbersDrift(prose, 3, -110)).toBe(false);
  });

  it('QB season stats with odds-like magnitudes do not trip the odds check', () => {
    const prose = 'Rodgers threw for 3,322 yards and 24 touchdowns across 16 games; Smith had 17 interceptions.';
    expect(ticketNumbersDrift(prose, 1.5, -114)).toBe(false);
  });
});

describe('restatementAcceptable', () => {
  const original = 'The Browns are laying 2.5 at home. I want the cushion with the underdog. Give me Buffalo +2.5 and the plan that survives the rotations, because this game belongs to the reserves.';

  it('accepts a faithful restatement that now quotes the ticket', () => {
    const restated = 'The Browns are laying 3 at home. I want the cushion with the underdog. Give me Buffalo +3 and the plan that survives the rotations, because this game belongs to the reserves.';
    expect(restatementAcceptable(original, restated, 3, -105)).toBe(true);
  });

  it('rejects a restatement that still quotes the old number', () => {
    const restated = 'The Browns are laying 2.5 at home. Give me Buffalo +3 and the plan that survives the rotations, because this game belongs to the reserves either way tonight.';
    expect(restatementAcceptable(original, restated, 3, -105)).toBe(false);
  });

  it('rejects a rewrite that changed the card’s size (new arguments smell)', () => {
    const restated = 'Buffalo +3.';
    expect(restatementAcceptable(original, restated, 3, -105)).toBe(false);
  });

  it('rejects an empty or number-free restatement', () => {
    expect(restatementAcceptable(original, '', 3, -105)).toBe(false);
    const dodge = 'The Browns are laying points at home. I want the cushion with the underdog. Give me Buffalo and the plan that survives the rotations, because this game belongs to the reserves.';
    expect(restatementAcceptable(original, dodge, 3, -105)).toBe(false);
  });
});
