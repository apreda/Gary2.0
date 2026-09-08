import { afterEach, expect, it, vi } from 'vitest';
import { hasXeraAnalysis, stripXeraFields } from '../../src/services/mlbMetricPolicy.js';

afterEach(() => vi.unstubAllGlobals());

it('strips nested excluded metrics and aliases without changing other measurements or the input', () => {
  const input = { era: 3.26, xera: 4.27, est_era: 4.27, era_minus_xera_diff: -1.01,
    nested: [{ expected_era: 4.27, est_ba: 0.25, xwoba: 0.31, whip: null }] };
  expect(stripXeraFields(input)).toEqual({ era: 3.26, nested: [{ est_ba: 0.25, xwoba: 0.31, whip: null }] });
  expect(input.xera).toBe(4.27);
  expect(hasXeraAnalysis(input)).toBe(true);
  expect(hasXeraAnalysis(stripXeraFields(input))).toBe(false);
  expect(hasXeraAnalysis({ xera: null, line: 'Actual ERA 3.26; xBA .250.' })).toBe(false);
});

it('keeps excluded Savant fields out of the returned data and its cache', async () => {
  vi.resetModules();
  const fetcher = vi.fn().mockResolvedValue(new Response('player_id,name,era,xera,est_era,era_minus_xera_diff,est_ba\n777,Fixture Pitcher,3.26,4.27,4.27,-1.01,0.25'));
  vi.stubGlobal('fetch', fetcher);
  const { getPitcherXStats } = await import('../../src/services/baseballSavantService.js');
  const first = await getPitcherXStats(2026), cached = await getPitcherXStats(2026);
  expect(first).toEqual([{ player_id: 777, name: 'Fixture Pitcher', era: 3.26, est_ba: 0.25 }]);
  expect(cached).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
