import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildNflPlaySettlement, nflPlayActualForProp } from '../../scripts/lib/nflPlaySettlement.js';
const read = id => JSON.parse(gunzipSync(readFileSync(new URL(`../fixtures/nfl/bdl-game-${id}-settlement.json.gz`, import.meta.url))));
const actual = (fixture, player) => {
  const row = fixture.playerStats.find(r => `${r.player.first_name} ${r.player.last_name}` === player);
  return nflPlayActualForProp(buildNflPlaySettlement(fixture), { playerId: row.player.id, propType: 'anytime_touchdown' });
};
describe('September 20 complete NFL settlement receipts', () => {
  it.each([
    [1392233, 'Bijan Robinson', 0], [1392233, 'Jalen Coker', 0],
    [1392236, 'DK Metcalf', 0], [1392236, 'Hunter Henry', 0],
    [1392237, 'Breece Hall', 0], [1392237, 'Christian Watson', 1],
    [1392240, 'David Montgomery', 0], [1392240, "Ja'Marr Chase", 2],
    [1392242, 'Ashton Jeanty', 0], [1392242, 'Omarion Hampton', 1],
  ])('recovers %s %s from the final scoring ledger', (id, player, total) => {
    expect(actual(read(id), player)).toBe(total);
  });
  it('does not turn a provider return-TD double count into a grade for that returner', () => {
    const f = read(1392233), result = buildNflPlaySettlement(f);
    expect(result.issues).toContain('ambiguous_return_touchdowns:2391');
    expect(actual(f, 'Devin Lloyd')).toBeNull();
    expect(actual(f, 'Darren Waller')).toBe(2);
    f.plays = f.plays.filter(p => p.type_slug !== 'interception-return-touchdown');
    expect(actual(f, 'Jalen Coker')).toBeNull();
  });
  it('requires an identified, box-corroborated fumble returner', () => {
    const f = read(1392236);
    const scoring = f.plays.find(p => p.type_slug === 'sack-opp-fumble-recovery');
    scoring.short_text = scoring.short_text.replace('Elijah Ponder', 'Unknown Player');
    expect(actual(f, 'Hunter Henry')).toBeNull();
  });
  it('permits a final overtime clock but still rejects missing finality and later plays', () => {
    const f = read(1392237);
    f.plays.find(p => p.type_slug === 'end-of-game').period = 4;
    expect(actual(f, 'Christian Watson')).toBeNull();
  });
  it('reads the score off scoring plays only: a stale stamp on another row is ignored, a scoring play that does not add up is not', () => {
    const f = read(1392240);
    f.plays.find(p => p.id === '4018729344443').type_slug = 'pass-reception';
    expect(actual(f, "Ja'Marr Chase")).toBe(2);
    const g = read(1392240);
    const td = g.plays.find(p => p.scoring_play && p.type_slug === 'passing-touchdown');
    if (td.home_score > 0) td.home_score -= 1; else td.away_score -= 1;
    expect(actual(g, "Ja'Marr Chase")).toBeNull();
  });
  it('does not infer a zero or DNP for a player absent from the complete contributor box', () => {
    const f = read(1392240);
    expect(f.playerStats.some(r => r.player.id === 971)).toBe(false);
    expect(nflPlayActualForProp(buildNflPlaySettlement(f), { playerId: 971, propType: 'anytime_touchdown' })).toBeNull();
  });
  it('requires a corroborated safety, not arbitrary two-point play text', () => {
    const f = read(1392242);
    f.plays.find(p => p.short_text === 'Team Safety').short_text = 'Unknown scoring play';
    expect(actual(f, 'Omarion Hampton')).toBeNull();
  });
});
