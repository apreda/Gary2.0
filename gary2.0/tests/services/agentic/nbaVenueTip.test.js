// A game away from the home arena reads its tip on the venue's clock (Nov 10 2026 data round, pass 2: Nuggets vs Pacers
// in Mexico City on Nov 7 read "Tip: 5:00 PM ET in Indiana.").
import { describe, expect, it } from 'vitest';
import { venueTip } from '../../../src/services/gary/agentic/orchestrator/nbaRead.js';

describe('venueTip', () => {
  it("gives the venue's local clock and city, and nothing for an evening tip there", () => {
    expect(venueTip('2026-11-07T22:00:00Z', 'Mexico City')).toBe('Tip: 5:00 PM ET, 4:00 PM local in Mexico City.');
    expect(venueTip('2026-11-08T00:30:00Z', 'Mexico City')).toBeNull();
    expect(venueTip('2026-11-07T22:00:00Z', 'Nowhere')).toBeNull();
  });
});
