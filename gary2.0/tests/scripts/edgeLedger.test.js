import { describe, expect, it } from 'vitest';
import { EDGE_FAMILIES, tagRationale, tallyByFamily } from '../../scripts/lib/edgeLedger.js';

// Sentences lifted verbatim from the real Aug 25 2026 rationales — the night
// the ledger exists to explain.
const RAYS_STYLE = [
  'This is the Rays moneyline because the portion of the game I trust most begins after the starters leave.',
  'Tampa Bay owns the clear advantage: a 2.37 ERA and 0.96 WHIP versus Detroit’s 3.72 ERA and 1.37 WHIP. Over the last three games, Rays relievers allowed three earned runs in 10.0 innings; Tigers relievers allowed nine in 12.2.',
  '',
  'The Rays have won two straight while the Tigers have lost six, but this is not a bet on streaks alone. Neither offense has been rolling—Tampa Bay has scored 2.6 runs per game over its last five and Detroit 2.8—so I want the side with the more dependable late-game structure. Tampa Bay is 18-13 in one-run games; Detroit is 12-22.',
].join('\n');

const NATS_STYLE = [
  'Andrew Alvarez has allowed four earned runs in 16.0 innings across his last three starts, while Mason Adams is making his MLB debut after a 3.67 ERA and 49 strikeouts in 49.0 Triple-A innings.',
  '',
  'Washington’s current bullpen arms carry a 4.19 ERA and 1.32 WHIP; Colorado’s carry a 4.91 ERA and 1.59 WHIP. Over the last seven games, the comparison is 3.00 against 5.34. Washington has also committed one error and allowed no unearned runs in that span.',
  '',
  'Colorado’s last-three contact was stronger—.393 xwOBA and 42.9% hard-hit versus Washington’s .332 and 25.9%—and the Rockies went 6-for-18 against Alvarez in July.',
].join('\n');

describe('rationale tagging (Aug 25 fixtures)', () => {
  it('hears the pen citations in both spellings', () => {
    const rays = tagRationale(RAYS_STYLE);
    expect(rays.families).toContain('pen_season');    // "2.37 ERA and 0.96 WHIP" pen framing
    expect(rays.families).toContain('pen_recency');   // "Over the last three games, Rays relievers allowed..."
    expect(rays.families).toContain('offense_recency');
    expect(rays.families).toContain('streaks_momentum');
    expect(rays.families).toContain('one_run_structure');
  });

  it('marks decisive families from the final paragraph only', () => {
    const rays = tagRationale(RAYS_STYLE);
    expect(rays.decisive).toContain('offense_recency');   // 2.6 R/G sits in the closer
    expect(rays.decisive).toContain('one_run_structure');
    expect(rays.decisive).not.toContain('pen_recency');   // pen evidence lived earlier
  });

  it('tags the Nats loss with the families the autopsy named', () => {
    const nats = tagRationale(NATS_STYLE);
    expect(nats.families).toContain('starter_recent_form');
    expect(nats.families).toContain('debut_uncertainty');
    expect(nats.families).toContain('pen_season');
    expect(nats.families).toContain('pen_recency');       // "Over the last seven games, 3.00 against 5.34"
    expect(nats.families).toContain('contact_quality');
    expect(nats.families).toContain('defense_cleanliness');
    expect(nats.families).toContain('h2h_history');       // "6-for-18 against Alvarez in July"
  });

  it('returns nothing for empty text', () => {
    expect(tagRationale('')).toEqual({ families: [], decisive: [] });
  });
});

describe('per-family tally', () => {
  it('counts a pick under every cited family and keeps decisive separate', () => {
    const rows = [
      { families: ['pen_recency', 'platoon_handedness'], decisive: ['pen_recency'], result: 'won' },
      { families: ['pen_recency'], decisive: [], result: 'lost' },
      { families: ['platoon_handedness'], decisive: ['platoon_handedness'], result: 'lost' },
      { families: ['pen_recency'], decisive: ['pen_recency'], result: 'push' }, // excluded
    ];
    const t = tallyByFamily(rows);
    expect(t.get('pen_recency')).toMatchObject({ cited: 2, wins: 1, losses: 1, decisiveWins: 1, decisiveLosses: 0 });
    expect(t.get('platoon_handedness')).toMatchObject({ cited: 2, wins: 1, losses: 1, decisiveWins: 0, decisiveLosses: 1 });
  });

  it('has a tally slot for every declared family', () => {
    const t = tallyByFamily([]);
    for (const f of EDGE_FAMILIES) expect(t.has(f.key)).toBe(true);
  });
});
