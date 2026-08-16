import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatStartingQBs } from '../../src/services/agentic/scoutReport/sports/nfl.js';

const ncaafScoutSource = readFileSync(
  new URL('../../src/services/agentic/scoutReport/sports/ncaaf.js', import.meta.url),
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
});
