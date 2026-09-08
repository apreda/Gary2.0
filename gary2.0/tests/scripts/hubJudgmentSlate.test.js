import { expect, it, vi } from 'vitest';
import { loadHubJudgmentSlate } from '../../scripts/lib/hubJudgmentSlate.js';
import { hubJudgmentRefreshStages } from '../../scripts/lib/hubJudgmentRefresh.js';

it('reads the complete exact Eastern slate including late games and doubleheaders', async () => {
  const games = [{ id: 1, date: '2026-09-08T19:00:00Z' }, { id: 2, date: '2026-09-09T02:00:00Z' },
    { id: 3, date: '2026-09-09T19:00:00Z' }];
  const bdl = { getGames: vi.fn().mockResolvedValue(games) };
  expect((await loadHubJudgmentSlate({ bdl, date: '2026-09-08', league: 'MLB' })).map(game => game.id)).toEqual([1, 2]);
  expect(bdl.getGames.mock.calls[0][1]).toMatchObject({ dates: ['2026-09-08', '2026-09-09'], paginateAll: true });
});

it('cannot turn a failed or ambiguous schedule read into a healthy empty slate', async () => {
  const args = { date: '2026-09-08', league: 'MLB' };
  await expect(loadHubJudgmentSlate({ ...args, bdl: { getGames: vi.fn().mockRejectedValue(new Error('provider failed')) } }))
    .rejects.toThrow('provider failed');
  const bdl = { getGames: vi.fn().mockResolvedValue([{ id: 1, date: '2026-09-08T19:00:00Z' }, { id: 1, date: '2026-09-08T20:00:00Z' }]) };
  await expect(loadHubJudgmentSlate({ ...args, bdl })).rejects.toThrow('Conflicting');
});

it('uses the NBA actual timestamp and rejects date-only or timezone-free schedule rows', async () => {
  const game = { id: 100, date: '2026-09-08', datetime: '2026-09-09T02:00:00.000Z' };
  const args = { date: '2026-09-08', league: 'NBA' };
  expect(await loadHubJudgmentSlate({ ...args, bdl: { getGames: vi.fn().mockResolvedValue([game]) } })).toEqual([game]);
  for (const row of [{ id: 100, date: '2026-09-08' },
    { id: 100, date: '2026-09-08', datetime: '2026-09-08T19:00:00' }]) {
    await expect(loadHubJudgmentSlate({ ...args, bdl: { getGames: vi.fn().mockResolvedValue([row]) } }))
      .rejects.toThrow('exact game time');
  }
});

it('uses the Eastern window and bounded metadata-only refreshes for every supported league', () => {
  expect(hubJudgmentRefreshStages('2026-09-08', new Date('2026-09-08T09:59:00Z'))).toEqual([]);
  const stages = hubJudgmentRefreshStages('2026-09-08', new Date('2026-09-08T10:00:00Z'));
  expect(stages).toHaveLength(4);
  expect(stages.every(stage => stage.args.includes('--judgments-only') && stage.timeoutMs === 480_000)).toBe(true);
  // Winter: 10:00 UTC is still before the refresh window.
  expect(hubJudgmentRefreshStages('2026-12-08', new Date('2026-12-08T10:00:00Z'))).toEqual([]);
});
