import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArchiveGamePicks } from '@/lib/gary/archive';

afterEach(() => vi.unstubAllGlobals());

function serve(picks: unknown, table = 'daily_picks') {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
    new URL(input).pathname.endsWith(`/${table}`)
      ? [{ date: '2026-09-04', week_start: '2026-09-01', picks }]
      : [],
  )));
}

describe('archive game-pick integrity', () => {
  it.each(['daily_picks', 'weekly_nfl_picks'])(
    'rejects a corrupt %s payload rather than hiding historical picks', async table => {
      for (const picks of ['{broken', '{}', [null], [{}], [{ pick: ' ' }], [{ pick: 'PENDING' }]]) {
        serve(picks, table);
        await expect(fetchArchiveGamePicks('2026-09-04')).rejects.toThrow('Malformed stored game picks');
      }
    },
  );

  it('does not present a partial record as complete when one ticket is broken', async () => {
    serve([{ pick: 'Cubs ML -110', league: 'MLB' }, { pick: null }]);
    await expect(fetchArchiveGamePicks('2026-09-04')).rejects.toThrow('Malformed stored game picks');
  });

  it.each([[], '[]', null, ''])('preserves confirmed empty archive storage (%j)', async picks => {
    serve(picks);
    expect(await fetchArchiveGamePicks('2026-09-04')).toEqual([]);
  });

  it('reads an original ticket unchanged after its feed recovers', async () => {
    serve('{broken');
    await expect(fetchArchiveGamePicks('2026-09-04')).rejects.toThrow('Malformed stored game picks');
    const ticket = { pick: 'Chiefs -3.5 -110', league: 'NFL', commence_time: '2026-09-04T20:00:00Z' };
    serve(JSON.stringify([ticket]), 'weekly_nfl_picks');
    expect(await fetchArchiveGamePicks('2026-09-04')).toEqual([ticket]);
  });
});
