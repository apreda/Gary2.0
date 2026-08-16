import { describe, expect, it } from 'vitest';
import { computeHeatCheck } from '../../../src/services/insights/computers/heatCheck.js';

describe('heatCheck lineup reader wiring', () => {
  it('initializes the shared lineup reader before processing an empty slate', async () => {
    await expect(computeHeatCheck({
      games: [],
      season: 2026,
      date: '2026-08-16',
      bdl: {},
      helpers: { gameLabel: () => '' },
    })).resolves.toEqual([]);
  });
});
