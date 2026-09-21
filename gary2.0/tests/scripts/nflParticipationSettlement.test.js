import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { nflParticipatingReceiverZero } from '../../scripts/lib/nflParticipationSettlement.js';
const sample = () => JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/nfl/gesicki-1392240-participation.json.gz', import.meta.url))));
describe('NFL absent receiving contributor with independent participation', () => {
  it('establishes zero yards and catches only after 21 dated offensive snaps and 20 catches/207 yards reconcile', () => {
    const f = sample();
    expect(nflParticipatingReceiverZero(f)).toBe(0);
    expect(nflParticipatingReceiverZero({ ...f, market: 'receptions' })).toBe(0);
  });
  it.each([
    ['wrong week', f => { f.game.week = 3; }],
    ['wrong date', f => { f.game.date = '2026-09-13T17:00:00Z'; }],
    ['wrong provider ID', f => { f.pick.player_id = 123; }],
    ['wrong player name', f => { f.pick.player = 'Different Player'; }],
    ['wrong team', f => { f.player.team.id = 123; }],
    ['no positive participation', f => { f.snaps.find(r => r.player === 'Mike Gesicki').offense_snaps = '0'; }],
    ['missing snap report', f => { f.snaps = []; }],
    ['ambiguous snap name', f => { f.snaps.push(f.snaps.find(r => r.player === 'Mike Gesicki')); }],
    ['partial box', f => { f.rows[0]._football_box_complete = false; }],
    ['other game box', f => { f.rows[0]._game_id = '123'; }],
    ['live game', f => { f.game.status = 'In Progress'; }],
    ['missing receiver yards', f => { f.rows.find(r => r.receptions > 0).receiving_yards = null; }],
    ['unreconciled catches', f => { f.rows.find(r => r.receptions > 0).receptions++; }],
    ['unreconciled yards', f => { f.rows.find(r => r.receptions > 0).receiving_yards++; }],
    ['unsupported market', f => { f.market = 'rushing_yards'; }],
  ])('leaves %s pending', (_, change) => {
    const f = sample(); change(f); expect(nflParticipatingReceiverZero(f)).toBeNull();
  });
});
