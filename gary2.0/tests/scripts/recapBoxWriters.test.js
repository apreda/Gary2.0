import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { recapBoxComplete } from '../../src/services/recapBox.js';

const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('async function recapGradedPick('), source.indexOf('\nlet gameResultIdentityColumnAvailable;'));
const box = { away: { runs: 27, td: 3 }, home: { runs: 24, td: 3 } };
const args = { pick: { game_id: 457172, pick: 'SMU -2.5', awayTeam: 'SMU Mustangs', homeTeam: 'Florida State Seminoles' },
  league: 'NCAAF', gameDate: '2026-09-07', result: 'won', hs: 24, vs: 27, matchedGame: { id: 457172 } };

describe('the live local grader recap writer', () => {
  it.each(['missing', 'incomplete', 'complete', 'corrected score', 'new'])('persists the %s football box without rewriting an existing story', async mode => {
    const writes = [];
    const existing = mode === 'new' ? null : { id: 1453, result: 'won', headline: 'Original headline',
      box: mode === 'complete' ? box : mode === 'corrected score' ? { away: { runs: 28, td: 4 }, home: { runs: 24, td: 3 } }
        : mode === 'incomplete' ? { away: { runs: 27 }, home: { runs: 24 } } : null };
    let pending;
    const builder = { select: () => builder, eq: () => builder,
      maybeSingle: async () => ({ data: existing }),
      update: row => { pending = row; return builder; },
      insert: row => { pending = row; return builder; },
      then: resolve => { writes.push(pending); return resolve({ error: null }); } };
    const generateRecap = vi.fn().mockResolvedValue({ headline: 'New headline', recap: 'New story', bullets: [] });
    const loadRecapBox = vi.fn().mockResolvedValue(box);
    const collaborators = {
      supabase: { from: () => builder }, headlineNeedsRepair: () => false,
      loadRecapBox, recapBoxComplete, fetchMLBStats: vi.fn(), BDL_API_KEY: 'fixture',
      fetchGradedPropRowsAround: async () => [], filterPropsForGame: () => [], buildGameEvidence: () => 'final 27-24',
      generateRecap, console: { log() {}, warn() {}, error() {} },
    };
    const run = new Function(...Object.keys(collaborators), `return (${method});`)(...Object.values(collaborators));
    await run(args);
    if (mode === 'complete') {
      expect(writes).toEqual([]);
      expect(loadRecapBox).not.toHaveBeenCalled();
    } else {
      expect(writes).toHaveLength(1);
      expect(writes[0].box).toEqual(box);
      expect(loadRecapBox).toHaveBeenCalledWith(expect.objectContaining({ gameId: 457172, awayScore: 27, homeScore: 24 }));
    }
    if (mode !== 'new') {
      expect(generateRecap).not.toHaveBeenCalled();
      if (writes.length) expect(Object.keys(writes[0])).toEqual(['box']);
    } else expect(generateRecap).toHaveBeenCalledOnce();
  });
});
