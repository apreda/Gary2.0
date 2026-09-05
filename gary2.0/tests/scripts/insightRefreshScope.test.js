import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { insightRefreshOldIds } from '../../scripts/lib/insightRefreshScope.js';

describe('college lane continuation storage', () => {
  const existing = [{ id: 1, game_id: '10' }, { id: 2, game_id: '10' }, { id: 3, game_id: '20' }];
  it.each(['quarterback', 'injury'])('retains completed earlier games when %s resumes with later games', category => {
    expect(insightRefreshOldIds({ league: 'NCAAF', category, existing, fresh: [{ game_id: 30 }] })).toEqual([]);
    expect(insightRefreshOldIds({ league: 'NCAAF', category, existing, fresh: [{ game_id: 20 }] })).toEqual([3]);
  });
  it('replaces all previously observed entries only in the exact refreshed game', () => {
    expect(insightRefreshOldIds({ league: 'ncaaf', category: 'quarterback', existing, fresh: [{ game_id: 10 }] })).toEqual([1, 2]);
  });
  it('unknown game identity cannot authorize removing prior college rows', () => {
    expect(insightRefreshOldIds({ league: 'NCAAF', category: 'injury', existing, fresh: [{ game_id: null }, {}] })).toEqual([]);
  });
  it('preserves full-snapshot behavior for other leagues and categories', () => {
    for (const [league, category] of [['NFL', 'injury'], ['MLB', 'quarterback'], ['NCAAF', 'pace_script']]) {
      expect(insightRefreshOldIds({ league, category, existing, fresh: [{ game_id: 20 }] })).toEqual([1, 2, 3]);
    }
  });
  it('wires the exact-game identity into insert-before-delete persistence', () => {
    const source = readFileSync(new URL('../../run-insight-connections.js', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('async function replaceVolatileRows'), source.indexOf('/** Stored rows for (date, league)'));
    expect(block).toContain("select: 'id,category,game_id,meta'");
    expect(block).toContain('insightRefreshOldIds({ league, category, existing: existing || [], fresh })');
    expect(block.indexOf('await insertRows(fresh)')).toBeLessThan(block.indexOf("method: 'DELETE'"));
  });
});
