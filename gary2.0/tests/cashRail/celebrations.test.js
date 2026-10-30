import { describe, expect, it } from 'vitest';
import { celebrationPlays, pickDance, DANCES, danceUniqueFrames, posePrompt, bgSpec, TEAM_LOOKS } from '../../src/services/cashRail/celebrations.js';

const hit = (key, who, market, price, elapsed, extra = {}) => ({ key, who, market, price, elapsed, when: 'Q1 5:08', play: '12-yd TD catch', ...extra });

describe('which hits get a celebration', () => {
  it('celebrates every touchdown play and any hit +800 or longer, once per play, with the best price on that play', () => {
    const plays = celebrationPlays([
      hit('935|first_td', 'Tucker Kraft', 'First TD scorer', 1100, 592),
      hit('935|anytime_td|1', 'Tucker Kraft', 'Anytime TD', 195, 592),
      hit('935|anytime_td_1q|1', 'Tucker Kraft', 'Anytime TD · 1st quarter', 900, 592),
      hit('480|receiving_yards', 'Matthew Golden', 'Rec yards', 414, 2715, { rungs: [{ label: '100+', price: 414 }] }),
      hit('77|receptions', 'Chuba Hubbard', 'Receptions', 1520, 3100, { rungs: [{ label: '7+', price: 1520 }] }),
      hit('game|spread|home|-3.5', 'Packers', 'Spread −3.5', -102, 3600),
    ]);
    expect(plays.map(p => [p.playKey, p.hit.key, p.kind])).toEqual([
      ['935@592', '935|first_td', 'td'],
      ['77@3100', '77|receptions', 'big'],
    ]);
    expect(plays[0].playerId).toBe('935');
  });

  it('never celebrates a game line', () => {
    expect(celebrationPlays([hit('game|ml|away', 'Panthers', 'Moneyline', 900, 3600)])).toEqual([]);
  });
});

describe('the dance', () => {
  it('has sixteen celebrations and picks the same one for the same play every time', () => {
    expect(DANCES.length).toBe(16);
    expect(pickDance('935@592', 'td')).toBe(pickDance('935@592', 'td'));
    const picked = new Set(Array.from({ length: 40 }, (_, i) => pickDance(`${i}@${i * 7}`, 'td')));
    expect(picked.size).toBeGreaterThan(8);
  });

  it('a touchdown can spike it or dunk it; a big cash that is not a score never celebrates with the ball', () => {
    const keys = Array.from({ length: 200 }, (_, i) => `${i}@${i * 13}`);
    const scoring = new Set(DANCES.filter(d => d.scoring).map(d => d.id));
    expect([...scoring]).toEqual(expect.arrayContaining(['spike', 'dunk']));
    expect(keys.some(k => scoring.has(pickDance(k, 'td')))).toBe(true);
    expect(keys.every(k => !scoring.has(pickDance(k, 'big')))).toBe(true);
  });

  it('the goalpost dunk stands Gary in front of a goalpost', () => {
    expect(DANCES.find(d => d.id === 'dunk').prop).toBe('goalpost');
  });

  it('draws each distinct pose once even when the routine repeats it', () => {
    const griddy = DANCES.find(d => d.id === 'griddy');
    expect(griddy.seq.length).toBeGreaterThan(danceUniqueFrames(griddy).length);
    expect(new Set(danceUniqueFrames(griddy).map(f => f.slug)).size).toBe(danceUniqueFrames(griddy).length);
  });
});

describe('the art prompts', () => {
  it('dresses Gary in the scorer\'s number and his team\'s colors, never a logo', () => {
    const p = posePrompt('arms up', TEAM_LOOKS.GB, '85');
    expect(p).toContain('number 85');
    expect(p).toContain(TEAM_LOOKS.GB.uniform);
    expect(p).toMatch(/no logos/i);
    expect(p).toMatch(/^NEW POSE/);
    expect(p).toMatch(/no rude or obscene gestures/i);
    expect(p).toMatch(/black football cleats/i);
  });

  it('has a look for all 32 teams', () => {
    expect(Object.keys(TEAM_LOOKS).length).toBe(32);
    for (const t of Object.values(TEAM_LOOKS)) expect(t.uniform && t.bg).toBeTruthy();
  });

  it('puts the right word behind him: touchdown, interception, or a big cash', () => {
    expect(bgSpec('td', 'GB').word).toBe('TOUCHDOWN!');
    expect(bgSpec('int', 'CAR').word).toBe('PICKED OFF!');
    expect(bgSpec('big', 'CAR').word).toBe('CASHED!');
    expect(bgSpec('td', 'GB').key).toBe('bg/GB-td');
  });
});
