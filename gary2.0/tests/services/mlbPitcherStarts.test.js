import { expect, it } from 'vitest';
import { loadMlbPitcherStarts } from '../../src/services/mlbPitcherStarts.js';

const start = { season: '2026', gameType: 'R', stat: { gamesStarted: 1 }, team: { id: 138 }, isHome: true };
it('supplies actual regular-season starts and home identity, excluding relief and spring appearances', async () => {
  const rows = [start, { ...start, stat: { gamesStarted: 0 } }, { ...start, gameType: 'S' },
    { ...start, season: '2025' }, { ...start, team: { id: 137 }, isHome: false }];
  expect(await loadMlbPitcherStarts(669461, 2026, async () => rows)).toEqual([
    { team: { id: 138 }, is_home: true }, { team: { id: 137 }, is_home: false },
  ]);
});
it.each([{ ...start, isHome: undefined }, { ...start, stat: {} }])('does not turn missing identity into zero home starts', async row => {
  await expect(loadMlbPitcherStarts(669461, 2026, async () => [row]))
    .rejects.toMatchObject({ code: 'required_data_unavailable', retryModel: false });
});
