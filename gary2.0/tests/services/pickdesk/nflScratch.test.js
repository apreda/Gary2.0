import { describe, it, expect } from 'vitest';
import { namesOut, scratchFor, scratchNflPlays } from '../../../src/services/pickdesk/nflScratch.js';

const rows = [
  { player: { first_name: 'Justin', last_name: 'Jefferson' }, status: 'Out' },
  { player: { first_name: 'T.J.', last_name: 'Hockenson' }, status: 'Questionable' },
  { player: { first_name: 'Sam', last_name: 'Darnold' }, status: 'Inactive' },
  { player: { first_name: 'Jordan', last_name: 'Mason' }, injury_status: 'out' },
];

describe('NFL inactives scratch', () => {
  it('collects Out and Inactive only', () => {
    expect([...namesOut(rows)].sort()).toEqual(['jordan mason', 'justin jefferson', 'sam darnold']);
  });
  it('scratches a game play whose brief or rationale leans on an inactive, and a prop on that player', () => {
    const out = namesOut(rows);
    expect(scratchFor({ kind: 'game', pick_snapshot: { brief: { reasons: ['Jefferson vs a thin secondary'] }, rationale: '' } }, out)).toBe('justin jefferson');
    expect(scratchFor({ kind: 'game', pick_snapshot: { brief: null, rationale: 'Sam Darnold has been sharp.' } }, out)).toBe('sam darnold');
    expect(scratchFor({ kind: 'game', pick_snapshot: { brief: { reasons: ['Hockenson usage'] }, rationale: 'The pass rush.' } }, out)).toBeNull();
    expect(scratchFor({ kind: 'game', pick_snapshot: { rationale: 'Mason is a common word but a short surname needs the full name.' } }, out)).toBeNull();
    expect(scratchFor({ kind: 'prop', pick_snapshot: { player: 'Justin Jefferson', rationale: '' } }, out)).toBe('justin jefferson');
    expect(scratchFor({ kind: 'prop', pick_snapshot: { player: 'Jordan Addison', rationale: 'Jefferson draws coverage.' } }, out)).toBeNull();
  });
  it('scratches only plays inside the inactives window, through the database function', async () => {
    const now = Date.parse('2026-09-27T15:00:00Z');
    const calls = [];
    const client = {
      from: (table) => ({
        select: () => ({
          eq: () => ({ is: () => ({ gte: async () => ({ data: [
            { candidate_id: 1, kind: 'game', pick_snapshot: { rationale: 'Justin Jefferson wins outside.' } },
            { candidate_id: 2, kind: 'game', pick_snapshot: { rationale: 'Justin Jefferson wins outside.' } },
            { candidate_id: 3, kind: 'prop', pick_snapshot: { player: 'Sam Darnold' } },
          ] }) }) }),
          in: async () => ({ data: [
            { id: 1, commence_time: '2026-09-27T16:25:00Z' }, // 85 min: in the window
            { id: 2, commence_time: '2026-09-27T20:00:00Z' }, // 5 hours: not yet
            { id: 3, commence_time: '2026-09-27T16:00:00Z' }, // 60 min: in the window
          ] }),
        }),
      }),
      rpc: async (name, args) => { calls.push([name, args]); return { data: true }; },
    };
    const n = await scratchNflPlays(client, { now, injuries: async () => rows, log: { log: () => {}, error: () => {} } });
    expect(n).toBe(2);
    expect(calls).toEqual([
      ['scratch_winners_play', { p_candidate_id: 1, p_reason: 'justin jefferson inactive' }],
      ['scratch_winners_play', { p_candidate_id: 3, p_reason: 'sam darnold inactive' }],
    ]);
  });
});
