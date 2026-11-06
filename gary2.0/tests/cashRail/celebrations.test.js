import { describe, expect, it } from 'vitest';
import { celebrationPlays, cardWords, pickDance, DANCES, danceUniqueFrames, posePrompt, bgSpec, TEAM_LOOKS } from '../../src/services/cashRail/celebrations.js';

const hit = (key, who, market, price, elapsed, extra = {}) => ({ key, who, market, price, elapsed, when: 'Q1 5:08', play: '12-yd TD catch', ...extra });

const q1 = { period: 1, clock_display: '5:08' }; // 592 seconds in
const part = (type, player_id) => ({ type, player_id });
const play = (type_slug, participants, extra = {}) => ({ ...q1, type_slug, participants, stat_yardage: 0, text: '', ...extra });

describe('which plays get a celebration', () => {
  const tdRun = play('rushing-touchdown', [part('rusher', 518), part('xp_kicker', 9)], { scoring_play: true, stat_yardage: 65 });

  it('celebrates a touchdown of any kind, a 40-yard pass or run, an interception and a lost fumble', () => {
    const kinds = plays => celebrationPlays(plays).map(p => [p.playKey, String(p.playerId), p.kind]);
    expect(kinds([tdRun])).toEqual([['518@592', '518', 'td']]);
    expect(kinds([play('kickoff-return-touchdown', [part('kickoff_returner', 3), part('kickoff_kicker', 4)], { scoring_play: true })])).toEqual([['3@592', '3', 'td']]);
    expect(kinds([play('pass-reception', [part('receiver', 7), part('passer', 2)], { stat_yardage: 40 })])).toEqual([['7@592', '7', 'long']]);
    expect(kinds([play('rush', [part('rusher', 8)], { stat_yardage: 52 })])).toEqual([['8@592', '8', 'long']]);
    // Gary wears the defender's number; the key is the quarterback's, whose bet is the row on the board.
    expect(kinds([play('pass-interception-return', [part('interception_returner', 44), part('passer', 2)])])).toEqual([['2@592', '44', 'int']]);
    expect(kinds([play('fumble-recovery-opponent', [part('fumbler', 5), part('recoverer', 66)])])).toEqual([['66@592', '66', 'fumble']]);
    expect(kinds([play('muffed-punt-recovery-opponent', [part('fumbler', 5), part('recoverer', 67)])])).toEqual([['67@592', '67', 'fumble']]);
  });

  it('leaves out everything else, however long the price', () => {
    const none = [
      play('pass-reception', [part('receiver', 7)], { stat_yardage: 39 }),
      play('rush', [part('rusher', 8)], { stat_yardage: 12 }),
      play('fumble-recovery-own', [part('fumbler', 5), part('recoverer', 6)]),
      play('sack', [part('sacker', 90), part('passer', 2)]),
      play('field-goal-good', [part('field_goal_kicker', 1)], { scoring_play: true }),
      play('rush', [part('rusher', 8)], { stat_yardage: 70, text: 'J.Hill for 70 yards. PENALTY on BLT, Holding - No Play.' }),
    ];
    const pricey = [hit('7|receptions', 'Chuba Hubbard', 'Receptions', 1520, 592)];
    expect(celebrationPlays(none, pricey)).toEqual([]);
  });

  it('names a touchdown for its best touchdown bet, even when a yardage bet on the same run paid more', () => {
    const run = [
      hit('518|anytime_td|1', 'Justice Hill', 'Anytime TD', 575, 592),
      hit('518|first_td', 'Justice Hill', 'First TD scorer', 600, 592),
      hit('518|longest_rush', 'Justice Hill', 'Longest run', 186, 592),
      hit('518|rushing_yards', 'Justice Hill', 'Rush yards', 3200, 592),
    ];
    for (const hits of [run, [...run].reverse()]) {
      expect(celebrationPlays([tdRun], hits)[0].hit.key).toBe('518|first_td');
    }
  });

  it('finds the bet a long gain or an interception paid, and only on that play', () => {
    const long = play('pass-reception', [part('receiver', 7), part('passer', 2)], { stat_yardage: 45 });
    const hits = [
      hit('7|receptions', 'Tee Higgins', 'Receptions', 900, 592),
      hit('7|receiving_yards', 'Tee Higgins', 'Rec yards', 414, 592),
      hit('7|longest_reception', 'Tee Higgins', 'Longest catch', 300, 700),
      hit('2|interceptions', 'Drake Maye', 'Interceptions thrown', 140, 592),
    ];
    expect(celebrationPlays([long], hits)[0].hit.key).toBe('7|receiving_yards');
    const pick = play('pass-interception-return', [part('interception_returner', 44), part('passer', 2)]);
    expect(celebrationPlays([pick], hits)[0].hit.key).toBe('2|interceptions');
    expect(celebrationPlays([play('rush', [part('rusher', 8)], { stat_yardage: 50 })], hits)[0].hit).toBeNull();
  });
});

describe('what the card says', () => {
  const said = (kind, slug, yards, h, name, other) => cardWords({ kind, slug, yards, hit: h }, name, other);

  it('with a bet, shows that bet and never credits one it is not', () => {
    const td = hit('518|anytime_td|1', 'Justice Hill', 'Anytime TD', 575, 592, { play: '65-yd TD run' });
    expect(said('td', 'rushing-touchdown', 65, td, 'Justice Hill')).toEqual({ who: 'Justice Hill', market: 'Anytime TD', play: '65-yd TD run' });
    const yards = hit('7|receiving_yards', 'Tee Higgins', 'Rec yards', 414, 592, { rungs: [{ label: '100+', price: 414 }], play: '45-yd catch · 110 yds' });
    expect(said('long', 'pass-reception', 45, yards, 'Tee Higgins')).toEqual({ who: 'Tee Higgins', market: 'Rec yards 100+', play: '45-yd catch' });
    const thrown = hit('2|interceptions', 'Drake Maye', 'Interceptions thrown', 140, 592);
    expect(said('int', 'pass-interception-return', 0, thrown, "D'Marco Jackson", 'Drake Maye')).toEqual({ who: "D'Marco Jackson", market: 'Interception', play: 'Drake Maye interceptions thrown' });
    expect(said('td', 'interception-return-touchdown', 40, thrown, "D'Marco Jackson", 'Drake Maye')).toEqual({ who: "D'Marco Jackson", market: 'Pick six', play: 'Drake Maye interceptions thrown' });
  });

  it('without a bet, puts the play where the price would sit', () => {
    expect(said('long', 'rush', 52, null, 'Bob Lee')).toEqual({ who: 'Bob Lee', market: '52-yd run', play: null, stat: { big: '52', small: 'YARDS' } });
    expect(said('int', 'pass-interception-return', 0, null, 'Bob Lee', 'Drake Maye')).toEqual({ who: 'Bob Lee', market: 'Interception', play: 'Picked off Drake Maye', stat: { big: 'INT', small: 'PICKED OFF' } });
    expect(said('fumble', 'fumble-recovery-opponent', 0, null, 'Bob Lee', 'Kay Black')).toEqual({ who: 'Bob Lee', market: 'Fumble recovery', play: 'Kay Black fumbled', stat: { big: 'FUMBLE', small: 'RECOVERED' } });
    expect(said('td', 'kickoff-return-touchdown', 98, null, 'Bob Lee')).toEqual({ who: 'Bob Lee', market: 'Kickoff return TD', play: '98 yards', stat: { big: 'TD', small: 'SCORED' } });
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

  it('has a look for all 32 teams, under the abbreviations BDL sends', () => {
    expect(Object.keys(TEAM_LOOKS).sort()).toEqual(['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WSH']);
    for (const t of Object.values(TEAM_LOOKS)) expect(t.uniform && t.bg).toBeTruthy();
  });

  it('puts the right word behind him: touchdown, interception, or a big cash', () => {
    expect(bgSpec('td', 'GB').word).toBe('TOUCHDOWN!');
    expect(bgSpec('int', 'CAR').word).toBe('PICKED OFF!');
    expect(bgSpec('big', 'CAR').word).toBe('CASHED!');
    expect(bgSpec('td', 'GB').key).toBe('bg/GB-td');
  });
});
