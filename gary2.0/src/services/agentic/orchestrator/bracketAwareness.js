/**
 * March Madness Bracket Awareness Context
 * Historical seed matchup data and bracket strategy insights
 * Used in Pass 2.75 to give Gary bracket-filling context
 */

export function getBracketAwarenessContext() {
  return `
## MARCH MADNESS BRACKET AWARENESS

You are filling out your bracket. This pick is SEPARATE from your spread pick — you're deciding who ADVANCES to the next round, not who covers.

### HISTORICAL SEED MATCHUP RECORDS (1985-2025)
| Matchup | Higher Seed Win % | Lower Seed Wins | Key Insight |
|---------|------------------|-----------------|-------------|
| 1 vs 16 | 98.75% | 2 of 160 | Near-locks. Only UMBC (2018) and FDU (2023) have won. |
| 2 vs 15 | 92.3% | 12 | Rare but happens ~every 3 years |
| 3 vs 14 | 85.0% | 21 | 1 in 6-7 chance of upset |
| 4 vs 13 | 79.3% | 28 | ~1 in 5 chance. 13 seeds are dangerous |
| 5 vs 12 | 64.4% | 57 | THE signature upset spot. ~36% upset rate. At least one 12-over-5 in 21 of last 25 tournaments |
| 6 vs 11 | 63.3% | 51 | 11 seeds reach the Final Four more than any seed 5-10 |
| 7 vs 10 | 62.0% | 52 | Similar upset rate to 5/12 |
| 8 vs 9 | 49.3% | 71 | Coin flip. 9 seeds actually have a slight historical edge |

### FINAL FOUR PATTERNS
- 1 seeds claim ~41% of all Final Four spots
- ~70% of the time, at least 3 of 4 Final Four teams are 1, 2, or 3 seeds
- Seeds 5+ reach the Final Four in ~30% of tournaments
- 11 seeds have reached the Final Four 6 times (most of any seed 5-16)
- No seed lower than 8 has won the championship (Villanova 1985)

### CINDERELLA CHARACTERISTICS
Teams that pull upsets typically share:
1. Elite 3-point shooting or ability to get hot from deep
2. Top-40 offensive OR defensive efficiency
3. Turnover margin dominance
4. Star player(s) who elevate in March
5. Low-possession, controlled tempo style (reduces variance)
6. Strong conference tournament momentum

### BRACKET STRATEGY
- Favorites win ~72.6% of games through Round 3
- Getting your Final Four right is worth FAR more than individual upset picks
- A wrong 1-seed pick in R64 costs you in every subsequent round
- Closing point spread is a better predictor than seed alone
- A 12 seed that's only a 2-point underdog is far more dangerous than one that's 9 points

### YOUR BRACKET RULES
1. Your bracket pick CAN differ from your spread pick — but if you took the underdog on the spread, you clearly see something in that team. Think carefully before picking AGAINST a team you just bet on.
2. For games with small spreads (1-5 points): these are toss-ups. Trust your investigation.
3. For games with medium spreads (5.5-10 points): the favorite usually advances but upsets happen. Your spread analysis matters here.
4. For games with large spreads (10+): the favorite almost always advances. You need an exceptional reason to pick the upset.
5. This is March Madness — upsets ARE part of the tournament. Don't be afraid to pick them when your homework supports it. But pick them because of PROCESS, not because of narrative.
`.trim();
}

export function getBracketSpreadContext(spread, homeTeam, awayTeam, garySpreadPick) {
  const absSpread = Math.abs(parseFloat(spread) || 0);
  const favorite = parseFloat(spread) < 0 ? homeTeam : awayTeam;
  const underdog = parseFloat(spread) < 0 ? awayTeam : homeTeam;

  // Did Gary take the underdog on the spread?
  const tookUnderdog = garySpreadPick && garySpreadPick.toLowerCase().includes(underdog.toLowerCase());

  let spreadContext = '';
  if (tookUnderdog) {
    spreadContext = `\n\nIMPORTANT: You just picked ${underdog} on the spread. You believe they can cover ${absSpread} points. If you pick ${favorite} to advance in your bracket, explain clearly why you think ${underdog} can cover but NOT win outright. If ${underdog} covering means they're competitive enough to win, consider riding them in your bracket too.`;
  }

  if (absSpread <= 5) {
    spreadContext += `\nThis is a TOSS-UP game (spread: ${absSpread}). Either team has a legitimate chance to advance. Trust your investigation over the seed numbers.`;
  } else if (absSpread <= 10) {
    spreadContext += `\nThis is a MODERATE spread (${absSpread} points). The favorite usually advances but this is upset territory. Your analysis of matchup-specific advantages matters more than the seed.`;
  } else {
    spreadContext += `\nThis is a LARGE spread (${absSpread} points). The favorite is heavily favored. You need an exceptional, evidence-based reason to pick the upset here.`;
  }

  return spreadContext;
}
