import { describe, expect, it } from 'vitest';
import { runCelebrations } from '../../src/services/cashRail/celebrateRunner.js';
import { pickDance, DANCES, danceUniqueFrames } from '../../src/services/cashRail/celebrations.js';

const board = { league: 'NFL', game_id: '1392323', status: 'live', hits: [
  { key: '935|first_td', who: 'Tucker Kraft', market: 'First TD scorer', price: 1100, elapsed: 592, when: 'Q1 5:08', play: '12-yd TD catch' },
  { key: '935|anytime_td|1', who: 'Tucker Kraft', market: 'Anytime TD', price: 195, elapsed: 592, when: 'Q1 5:08', play: '12-yd TD catch' },
  { key: 'game|ml|home', who: 'Packers', market: 'Moneyline', price: -174, elapsed: 3600, when: 'FINAL', play: 'Final 27–19' },
] };

function fakes({ existing = [], bgExists = false, failArt = false } = {}) {
  const rows = new Map(existing.map(k => [k, { status: 'ready' }]));
  const writes = { claims: [], ready: [], failed: [], art: [], uploads: [] };
  return {
    writes,
    db: {
      boards: async () => [board],
      existingPlayKeys: async () => [...rows.keys()],
      claim: async (row) => { if (rows.has(row.play_key)) return false; rows.set(row.play_key, row); writes.claims.push(row); return true; },
      markReady: async (key, assets) => { writes.ready.push({ key, assets }); },
      markFailed: async (key) => { writes.failed.push(key); },
    },
    bdl: { player: async (id) => ({ number: '85', team: 'GB' }) },
    art: async ({ prompt, slug }) => { if (failArt) throw new Error('boom'); writes.art.push(slug); return Buffer.from(slug); },
    store: {
      exists: async () => bgExists,
      put: async (path) => { writes.uploads.push(path); return `https://cdn/${path}`; },
      url: (path) => `https://cdn/${path}`,
    },
  };
}

describe('runCelebrations', () => {
  it('draws one celebration per qualifying play: the backdrop and each pose of its dance, in the player\'s number', async () => {
    const f = fakes();
    const n = await runCelebrations({ db: f.db, bdl: f.bdl, art: f.art, store: f.store, limit: 2 });
    expect(n).toBe(1);
    const dance = DANCES.find(d => d.id === pickDance('935@592'));
    expect(f.writes.claims[0]).toMatchObject({ league: 'NFL', game_id: '1392323', play_key: '935@592', hit_key: '935|first_td', price: 1100, kind: 'td', dance: dance.id, team: 'GB', number: '85' });
    expect(f.writes.art).toEqual(['bg', ...danceUniqueFrames(dance).map(x => x.slug)]);
    const a = f.writes.ready[0].assets;
    expect(a.bg).toBe('https://cdn/bg/GB-td.webp');
    expect(Object.keys(a.frames).sort()).toEqual(danceUniqueFrames(dance).map(x => x.slug).sort());
    expect(a.seq).toEqual(dance.seq);
  });

  it('reuses a team backdrop that already exists', async () => {
    const f = fakes({ bgExists: true });
    await runCelebrations({ db: f.db, bdl: f.bdl, art: f.art, store: f.store, limit: 2 });
    expect(f.writes.art).not.toContain('bg');
    expect(f.writes.ready[0].assets.bg).toBe('https://cdn/bg/GB-td.webp');
  });

  it('skips plays already drawn', async () => {
    const f = fakes({ existing: ['935@592'] });
    expect(await runCelebrations({ db: f.db, bdl: f.bdl, art: f.art, store: f.store, limit: 2 })).toBe(0);
    expect(f.writes.art).toEqual([]);
  });

  it('marks a play failed when the art cannot be drawn, so it is never half-shown', async () => {
    const f = fakes({ failArt: true });
    await runCelebrations({ db: f.db, bdl: f.bdl, art: f.art, store: f.store, limit: 2 });
    expect(f.writes.failed).toEqual(['935@592']);
    expect(f.writes.ready).toEqual([]);
  });
});
