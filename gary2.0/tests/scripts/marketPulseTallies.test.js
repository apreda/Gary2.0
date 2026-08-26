import { describe, expect, it } from 'vitest';
import { accumulate, americanPayout, freshAcc, pregameFavorite } from '../../scripts/lib/marketPulseTallies.js';

// The real 2026-08-25 MLB slate: pregame MLs frozen in daily_slate + finals.
// Pregame favorites went 4-11 that night; the settled-snapshot attribution this
// module replaced reported it as 12-3 (the live feed's post-game spread flips
// to the winner). This fixture pins the honest answer.
const AUG_25 = [
  { away: 'Rays', home: 'Tigers', as: 1, hs: 4, mlA: -126, mlH: 116 },
  { away: 'Red Sox', home: 'Marlins', as: 7, hs: 3, mlA: -142, mlH: 132 },
  { away: 'Rockies', home: 'Nationals', as: 3, hs: 1, mlA: 136, mlH: -146 },
  { away: 'Astros', home: 'Yankees', as: 9, hs: 7, mlA: 130, mlH: -140 },
  { away: 'Royals', home: 'Blue Jays', as: 5, hs: 3, mlA: 116, mlH: -126 },
  { away: 'Brewers', home: 'Mets', as: 2, hs: 3, mlA: -156, mlH: 144 },
  { away: 'Dodgers', home: 'Braves', as: 3, hs: 4, mlA: -148, mlH: 138 },
  { away: 'Rangers', home: 'White Sox', as: 7, hs: 11, mlA: -110, mlH: 100 },
  { away: 'Orioles', home: 'Cardinals', as: 13, hs: 1, mlA: 116, mlH: -126 },
  { away: 'Guardians', home: 'Angels', as: 8, hs: 6, mlA: -138, mlH: 128 },
  { away: 'Twins', home: 'Athletics', as: 2, hs: 4, mlA: -144, mlH: 134 },
  { away: 'Cubs', home: 'Diamondbacks', as: 4, hs: 5, mlA: -108, mlH: 100 },
  { away: 'Phillies', home: 'Mariners', as: 1, hs: 4, mlA: 100, mlH: -110 },
  { away: 'Pirates', home: 'Padres', as: 1, hs: 0, mlA: 112, mlH: -122 },
  { away: 'Reds', home: 'Giants', as: 1, hs: 3, mlA: -102, mlH: -106 },
];

function play(games) {
  const acc = freshAcc();
  const meta = [];
  for (const g of games) {
    const rec = accumulate(acc, {
      matchup: `${g.away} @ ${g.home}`,
      awayTeam: g.away,
      homeTeam: g.home,
      homeScore: g.hs,
      awayScore: g.as,
      total: g.total ?? null,
      spreadHome: g.spreadHome ?? null,
      mlHome: g.mlH ?? null,
      mlAway: g.mlA ?? null,
    });
    if (rec) meta.push(rec);
  }
  return { acc, meta };
}

describe('pregame-ML favorite attribution (the Aug 25 2026 regression)', () => {
  it('scores the real Aug 25 slate favorites 4-11, dogs 11-4 — never the settled 12-3', () => {
    const { acc } = play(AUG_25);
    expect(acc.games_counted).toBe(15);
    expect(acc.fav_wins).toBe(4);
    expect(acc.fav_losses).toBe(11);
    expect(acc.dog_wins).toBe(11);
    expect(acc.dog_losses).toBe(4);
  });

  it('pays the dogs their actual pregame prices', () => {
    const { acc } = play(AUG_25);
    // 11 winning dogs at their +ML (Reds -102 game: the dog is the LESS
    // negative side, Reds, who lost → -1), 4 losing dogs at -1 each.
    const dogWins =
      116 / 100 + // Tigers
      136 / 100 + // Rockies
      130 / 100 + // Astros
      116 / 100 + // Royals
      144 / 100 + // Mets
      138 / 100 + // Braves
      100 / 100 + // White Sox
      116 / 100 + // Orioles
      134 / 100 + // Athletics
      100 / 100 + // Diamondbacks
      112 / 100;  // Pirates
    expect(acc.dog_net_units).toBeCloseTo(dogWins - 4, 10);
  });

  it('finds a favorite inside a both-negative near-pick-em and none in a dead heat', () => {
    expect(pregameFavorite(-106, -102)).toBe('home'); // Giants -106 vs Reds -102
    expect(pregameFavorite(-110, -110)).toBe(null);
    expect(pregameFavorite(null, 130)).toBe(null);
  });

  it('counts a game with no pregame market nowhere, and one with only a total in O/U only', () => {
    const { acc } = play([
      { away: 'A', home: 'B', as: 2, hs: 1 }, // no market at all → not counted
      { away: 'C', home: 'D', as: 5, hs: 4, total: 8.5 }, // O/U only
    ]);
    expect(acc.games_counted).toBe(1);
    expect(acc.overs_wins).toBe(1);
    expect(acc.fav_wins + acc.fav_losses + acc.dog_wins + acc.dog_losses).toBe(0);
    expect(acc.dog_net_units).toBe(0);
  });

  it('grades overs against the pregame total, with pushes', () => {
    const { acc } = play([
      { away: 'A', home: 'B', as: 5, hs: 4, total: 8.5, mlA: -120, mlH: 110 }, // 9 > 8.5 over
      { away: 'C', home: 'D', as: 1, hs: 0, total: 7.5, mlA: 112, mlH: -122 }, // 1 < 7.5 under
      { away: 'E', home: 'F', as: 4, hs: 4, total: 8, mlA: -120, mlH: 110 },   // push (tied final also pushes sides)
    ]);
    expect(acc.overs_wins).toBe(1);
    expect(acc.overs_losses).toBe(1);
    expect(acc.overs_pushes).toBe(1);
    expect(acc.fav_wins + acc.fav_losses).toBe(2); // the tie contributes no side result
  });

  it('stamps winner_is_dog from the pregame favorite, Giants near-pick-em included', () => {
    const { meta } = play(AUG_25);
    const giants = meta.find((m) => m.matchup === 'Reds @ Giants');
    expect(giants.favorite).toBe('home');
    expect(giants.winner_is_dog).toBe(false); // Giants -106 were the favorite and won
    const tigers = meta.find((m) => m.matchup === 'Rays @ Tigers');
    expect(tigers.winner_is_dog).toBe(true);
  });
});

describe('americanPayout', () => {
  it('converts both signs and refuses garbage', () => {
    expect(americanPayout(116)).toBeCloseTo(1.16, 10);
    expect(americanPayout(-102)).toBeCloseTo(100 / 102, 10);
    expect(americanPayout(0)).toBe(null);
    expect(americanPayout(null)).toBe(null);
  });
});
