import { describe, it, expect, vi } from 'vitest';
import { createResultsRunner } from '../../scripts/lib/results/runner.js';

describe('scheduled MLB expectation review placement', () => {
  it('runs one bounded memory batch only after both target dates have settled', async () => {
    vi.stubEnv('GARY_MLB_JUDGMENT', 'on');
    const events = [];
    const reviewMlbExpectationBatch = vi.fn(async options => { events.push(`memory:${options.until}`); return { reviews: [], reviewed: 0 }; });
    const noop = () => {};
    const modules = {
      reviewMlbExpectationBatch, supabaseAdmin: {}, checkEraDrift: () => [],
      tagRationaleLanes: async () => [], printLaneTable: noop, readClosingLines: async () => [], printClosingLine: noop,
      readShadow: async () => [], printShadowRead: noop, gradeDiary: noop, runAutopsies: async () => ({ jobs: 0 }), printThreeWay: noop,
    };
    const context = {
      runOptions: { footballSettlements: false }, dateAtOffset: offset => offset === 0 ? '2026-09-09' : '2026-09-08',
      processPropBets: async () => ({ w: 0, l: 0, p: 0 }),
      processGenericGames: async (table, date) => { if (table === 'daily_picks') events.push(`graded:${date}`); return { w: 0, l: 0, p: 0 }; },
      runNightHighlights: noop, writeStreaks: noop, writeNflStreaks: async () => {}, gradeDarts: async () => {}, apiKey: 'fixture',
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { picks: [] } }) }) }) }) },
      loaders: Object.fromEntries(['era', 'lanes', 'closing', 'shadow', 'diary', 'memory', 'admin'].map(key => [key, async () => modules])), console: { log: noop, warn: noop },
    };
    await createResultsRunner(context).run();
    expect(events).toEqual(['graded:2026-09-09', 'graded:2026-09-08', 'memory:2026-09-09']);
    expect(reviewMlbExpectationBatch).toHaveBeenCalledExactlyOnceWith({ db: {}, since: '2026-09-08', until: '2026-09-09', limit: 2 });
    vi.unstubAllEnvs();
  });

  it('skips the batch while the judgment stages are off', async () => {
    vi.stubEnv('GARY_MLB_JUDGMENT', '');
    const reviewMlbExpectationBatch = vi.fn();
    const noop = () => {};
    const modules = {
      reviewMlbExpectationBatch, supabaseAdmin: {}, checkEraDrift: () => [],
      tagRationaleLanes: async () => [], printLaneTable: noop, readClosingLines: async () => [], printClosingLine: noop,
      readShadow: async () => [], printShadowRead: noop, gradeDiary: noop, runAutopsies: async () => ({ jobs: 0 }), printThreeWay: noop,
    };
    const context = {
      runOptions: { footballSettlements: false }, dateAtOffset: offset => offset === 0 ? '2026-09-09' : '2026-09-08',
      processPropBets: async () => ({ w: 0, l: 0, p: 0 }), processGenericGames: async () => ({ w: 0, l: 0, p: 0 }),
      runNightHighlights: noop, writeStreaks: noop, writeNflStreaks: async () => {}, gradeDarts: async () => {}, apiKey: 'fixture',
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { picks: [] } }) }) }) }) },
      loaders: Object.fromEntries(['era', 'lanes', 'closing', 'shadow', 'diary', 'memory', 'admin'].map(key => [key, async () => modules])), console: { log: noop, warn: noop },
    };
    await createResultsRunner(context).run();
    expect(reviewMlbExpectationBatch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
