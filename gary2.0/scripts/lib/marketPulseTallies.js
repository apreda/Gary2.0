/**
 * Market Pulse tallies — one finished game into the running day counts.
 *
 * EVERY market number here must be PREGAME (the daily_slate morning snapshot).
 * The live BDL odds endpoint only keeps the LATEST vendor snapshot, and after a
 * final that snapshot is the settled in-game line: the winner's ML reads
 * ~-10000, the spread flips to the winner (a 13-1 blowout stored spread_home
 * 11.5), and the total collapses to the live ninth-inning number (a 1-0 final
 * stored total 1.5). Attributing favorites from that source made Aug 25 2026 —
 * a day pregame favorites went 4-11 — read as "favorites 12-3". Caught Aug 26;
 * settled-snapshot inputs are banned from tallies, not medianed around.
 *
 *  - favorite: the side with the MORE NEGATIVE pregame ML (a -102/-106 near
 *    pick-em still has a favorite; exactly equal MLs have none)
 *  - favs/dogs: decided by final score vs that pregame favorite
 *  - dogs flat-stake: +american-payout when the dog wins, −1 when it loses
 *  - overs: combined runs vs the PREGAME total (push when equal)
 *  A game with no pregame market number still counts toward games_counted; the
 *  tallies it can't ground are skipped, never guessed.
 */

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Flat 1u payout on a winning american price (+116 → 1.16, -102 → 0.98). */
export function americanPayout(ml) {
  const m = num(ml);
  if (m === null || m === 0) return null;
  return m > 0 ? m / 100 : 100 / -m;
}

/** 'home' | 'away' | null — the pregame-ML favorite (null: missing or dead-even). */
export function pregameFavorite(mlHome, mlAway) {
  const mh = num(mlHome);
  const ma = num(mlAway);
  if (mh === null || ma === null || mh === ma) return null;
  return mh < ma ? 'home' : 'away';
}

export function freshAcc() {
  return {
    overs_wins: 0,
    overs_losses: 0,
    overs_pushes: 0,
    fav_wins: 0,
    fav_losses: 0,
    dog_wins: 0,
    dog_losses: 0,
    dog_net_units: 0,
    games_counted: 0,
  };
}

/**
 * Accumulate one finished game. Mutates `acc`; returns the per-game meta record
 * (or null when the game has no final score or no pregame market at all).
 * All market inputs (total, spreadHome, mlHome, mlAway) must be PREGAME.
 */
export function accumulate(acc, { matchup, awayTeam, homeTeam, homeScore, awayScore, total, spreadHome, mlHome, mlAway }) {
  const hs = num(homeScore);
  const as = num(awayScore);
  if (hs === null || as === null) return null; // no final score → skip

  const t = num(total);
  const sh = num(spreadHome);
  const mh = num(mlHome);
  const ma = num(mlAway);

  // A game counts toward the slate only when it has BOTH a final score and at
  // least one usable pregame market number.
  const hasOdds = t !== null || sh !== null || mh !== null || ma !== null;
  if (!hasOdds) return null;

  acc.games_counted += 1;

  const combined = hs + as;
  let ouResult = null;
  if (t !== null) {
    if (combined > t) {
      acc.overs_wins += 1;
      ouResult = 'over';
    } else if (combined < t) {
      acc.overs_losses += 1;
      ouResult = 'under';
    } else {
      acc.overs_pushes += 1;
      ouResult = 'push';
    }
  }

  const winner = hs > as ? 'home' : as > hs ? 'away' : 'push';

  const favorite = pregameFavorite(mh, ma);
  if (favorite && winner !== 'push') {
    const dogMl = favorite === 'home' ? ma : mh;
    if (favorite === winner) {
      acc.fav_wins += 1;
      acc.dog_losses += 1;
      acc.dog_net_units -= 1;
    } else {
      acc.fav_losses += 1;
      acc.dog_wins += 1;
      acc.dog_net_units += americanPayout(dogMl) ?? 0;
    }
  }

  const winnerMl = winner === 'home' ? mh : winner === 'away' ? ma : null;
  let winnerIsDog = null;
  if (favorite && winner !== 'push') {
    winnerIsDog = winner !== favorite;
  } else if (winner !== 'push' && winnerMl !== null && winnerMl !== 0) {
    winnerIsDog = winnerMl > 0;
  }

  return {
    matchup,
    away_team: awayTeam,
    home_team: homeTeam,
    away_score: as,
    home_score: hs,
    total: t,                       // PREGAME total (daily_slate)
    combined,
    ouResult,
    favorite,                       // pregame-ML favorite ('home'|'away'|null)
    winner,                         // 'home' | 'away' | 'push'
    winner_team: winner === 'home' ? homeTeam : winner === 'away' ? awayTeam : null,
    spreadHome: sh,                 // PREGAME run/point line (daily_slate)
    ml_home: mh,                    // genuine PREGAME moneyline (daily_slate)
    ml_away: ma,                    // genuine PREGAME moneyline (daily_slate)
    winner_ml: winnerMl,            // the winning side's pregame ML
    winner_is_dog: winnerIsDog,     // true=winning dog, false=winning fav, null=n/a
  };
}
