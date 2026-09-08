import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, vi } from 'vitest';

// Execute the actual date orchestration and nightly function with fixture
// dependencies. Loading the CLI itself would start real grading at import time.
const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const main = source.slice(source.indexOf('async function main(targetDate'), source.indexOf('// The full grade+recap run remains TODAY'));
const run = source.slice(source.indexOf('async function run()'), source.indexOf('\nrun().catch'));

describe('scheduled MLB expectation review placement', () => {
  it('runs one bounded memory batch only after both target dates have settled', async () => {
    const events = [];
    const reviewMlbExpectationBatch = vi.fn(async options => { events.push(`memory:${options.until}`); return { reviews: [], reviewed: 0 }; });
    const noop = () => {};
    const modules = {
      reviewMlbExpectationBatch, supabaseAdmin: {}, checkEraDrift: () => [],
      tagRationaleLanes: async () => [], printLaneTable: noop, readClosingLines: async () => [], printClosingLine: noop,
      readShadow: async () => [], printShadowRead: noop, gradeDiary: noop, runAutopsies: async () => ({ jobs: 0 }), printThreeWay: noop,
    };
    const context = {
      RUN_OPTIONS: { footballSettlements: false }, getTargetDates: () => ['2026-09-09', '2026-09-08'],
      processPropBets: async () => ({ w: 0, l: 0, p: 0 }),
      processGenericGames: async (table, date) => { if (table === 'daily_picks') events.push(`graded:${date}`); return { w: 0, l: 0, p: 0 }; },
      nflWeekStartForDate: date => date, runNightHighlights: noop, writeStreaks: noop, BDL_API_KEY: 'fixture',
      supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { picks: [] } }) }) }) }) },
      loadModule: async () => modules, console: { log: noop, warn: noop },
    };
    await runInNewContext(`${main}\n${run}\nrun()`.replaceAll('await import(', 'await loadModule('), context);
    expect(events).toEqual(['graded:2026-09-09', 'graded:2026-09-08', 'memory:2026-09-09']);
    expect(reviewMlbExpectationBatch).toHaveBeenCalledExactlyOnceWith({ db: {}, since: '2026-09-08', until: '2026-09-09', limit: 2 });
  });
});
