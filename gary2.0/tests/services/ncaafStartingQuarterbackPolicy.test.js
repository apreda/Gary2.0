import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatStartingQBs } from '../../src/services/agentic/scoutReport/sports/nfl.js';

const ncaafScoutSource = readFileSync(
  new URL('../../src/services/agentic/scoutReport/sports/ncaaf.js', import.meta.url),
  'utf8',
);

const nflScoutSource = readFileSync(
  new URL('../../src/services/agentic/scoutReport/sports/nfl.js', import.meta.url),
  'utf8',
);

describe('NCAAF starting-quarterback evidence policy', () => {
  it('never labels a passing leader or fallback sentinel as a confirmed starter', () => {
    const unsupported = {
      sport: 'NCAAF',
      home: { name: 'Passing Yardage Leader', source: 'bdl_stats', passingYards: 1200 },
      away: { name: 'See grounded context', source: 'grounding' },
    };

    expect(formatStartingQBs('Home College', 'Away College', unsupported)).toBe('');
  });

  it('does not import or render the NFL starting-QB section in the college scout builder', () => {
    expect(ncaafScoutSource).not.toContain('fetchStartingQBs');
    expect(ncaafScoutSource).not.toContain('formatStartingQBs');
    expect(ncaafScoutSource).not.toContain('STARTING QUARTERBACKS THIS WEEK');
  });

  /**
   * The reverse direction, added Aug 25 2026 on the founder's order to stop
   * sports leaking into each other.
   *
   * sports/nfl.js used to carry NCAAF's starting-QB resolution behind
   * `isNCAAF` branches — 131 lines that NOTHING could reach, because
   * buildNcaafScoutReport is college's entry point and the only caller here
   * passes a hardcoded 'NFL'. Unreachable code in a file named for another
   * sport is where a defect hides longest: one of those branches called a
   * ballDontLieService method that had never been defined, inside a
   * try/catch, and nobody noticed for as long as it existed.
   *
   * The rail in formatStartingQBs stays — it is policy, not routing.
   */
  it('keeps college fetch logic out of the NFL scout builder', () => {
    expect(nflScoutSource).not.toContain('isNCAAF');
    expect(nflScoutSource).not.toContain('fetchNCAAFStartingQBFromStats');
    expect(nflScoutSource).not.toContain('americanfootball_ncaaf');
  });

  it('still refuses to present a college passing leader as a confirmed starter', () => {
    // Routing moved; the anti-fabrication guard did not.
    expect(nflScoutSource).toContain("=== 'NCAAF') return ''");
  });
});
