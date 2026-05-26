/**
 * March Madness Bracket Awareness Context
 * Historical seed matchup data and tournament facts
 *
 * NO Layer 3 violations — awareness only, no strategy instructions.
 * Gary decides what matters based on his investigation.
 */

export function getBracketAwarenessContext() {
  return `
## MARCH MADNESS BRACKET AWARENESS

You are filling out your bracket. This pick is SEPARATE from your spread pick — you're deciding who ADVANCES to the next round, not who covers.

### HISTORICAL SEED MATCHUP RECORDS (1985-2025)
| Matchup | Higher Seed Win % | Upset Rate | Tournament Context |
|---------|------------------|------------|-------------------|
| 1 vs 16 | 98.75% | 1.25% | 2 upsets in 160 games (UMBC 2018, FDU 2023) |
| 2 vs 15 | 92.3% | 7.7% | Happens roughly every 3 years |
| 3 vs 14 | 85.0% | 15% | 1 in 6-7 chance. Multiple 14-seeds have reached the Sweet 16 |
| 4 vs 13 | 79.3% | 20.7% | ~1 in 5 chance. 13 seeds are historically dangerous |
| 5 vs 12 | 64.4% | 35.6% | THE signature upset spot. At least one 12-over-5 in 21 of last 25 tournaments |
| 6 vs 11 | 63.3% | 36.7% | 11 seeds have reached the Final Four 6 times — more than any seed 5-10 |
| 7 vs 10 | 62.0% | 38% | Similar upset rate to 5/12 — nearly a coin flip |
| 8 vs 9 | 49.3% | 50.7% | 9 seeds actually have a slight historical edge. True coin flip. |

### TOURNAMENT REALITY
- Every single tournament has upsets. There has never been a tournament where all favorites won.
- The last time all four 1-seeds reached the Final Four was 2008. It almost never happens.
- On average, 7-8 games per tournament are won by the lower seed in the first two rounds alone.
- Seeds 5-12 are where the tournament gets unpredictable — the matchup matters far more than the seed.
- 11 seeds have reached the Final Four 6 times. A 7 or 8 seed has won the national championship.
- Conference strength and strength of schedule often matter more than seed number — a 5-seed from a power conference can be significantly better than a 4-seed from a weaker one.

### WHAT THE RESEARCH SHOWS ABOUT TOURNAMENT PERFORMANCE

These are the factors that academic and statistical research has identified as most correlated with tournament outcomes. They are presented as awareness — what to notice and investigate — not as rules for how to pick.

- Turnover rate: Harvard Sports Analysis research found a 1% decrease in turnover rate increases upset probability by 26%. This was the #1 statistically significant predictor across 144 tournament games. First-half underdogs averaging 11 turnovers or fewer are 88-61 ATS (58.2%) in R64 since 2011.

- Free throw discipline: The #2 statistically significant predictor. Teams shooting 77%+ from the line with a spread of 6 or less are 60-34 ATS (64%). Disciplined defense — not sending opponents to the line — and converting your own free throws decide close tournament games.

- Guard play in isolation: System offenses break down against defenses a team has never seen. When games get tight, it becomes an isolation game. The ability to create your own shot against an unfamiliar defense is the skill that translates most consistently in single-elimination.

- Tempo mismatch: Understanding how a team's pace clashes with its opponent. A team that can impose its preferred tempo on an opponent forces the game into unfamiliar territory.

- Three-point attempt rate: Teams that attempt a high percentage of shots from three create variance. Variance compresses margins and changes the distribution of outcomes in a single game.

- Narrative factors: Coaching tournament track record, conference tournament momentum, program history in March, first-time tournament appearances — these shape the environment even if they don't appear in regression models. They are part of the tournament picture.

### YOUR BRACKET APPROACH
- Pick who you believe wins each game.
- Seeds tell you who the committee thinks is better, but the matchup tells you who actually wins.
- Every tournament has upsets.
`.trim();
}

export function getBracketSpreadContext(spread, homeTeam, awayTeam, garySpreadPick) {
  const absSpread = Math.abs(parseFloat(spread) || 0);
  const favorite = parseFloat(spread) < 0 ? homeTeam : awayTeam;
  const underdog = parseFloat(spread) < 0 ? awayTeam : homeTeam;

  let spreadContext = '';

  // ATS consistency: if spread is tight (<8), bracket pick should match the ATS pick
  if (garySpreadPick && absSpread < 8) {
    spreadContext = `\nYOUR ATS PICK: ${garySpreadPick}. The spread is only ${absSpread} points — covering and winning are the same thing at this margin. You MUST pick the same team to advance that you picked on the spread. Do not contradict your ATS analysis.`;
  } else if (garySpreadPick && absSpread >= 8) {
    // Wide spread — covering and winning outright are different, OK to differ
    const tookUnderdog = garySpreadPick.toLowerCase().includes(underdog.toLowerCase());
    if (tookUnderdog) {
      spreadContext = `\nYOUR ATS PICK: ${garySpreadPick}. The spread is ${absSpread} points — covering ${absSpread} and winning outright are different things. It is reasonable to take ${underdog} on the spread but pick ${favorite} to advance.`;
    }
  }

  if (absSpread <= 5) {
    spreadContext += `\nSpread: ${absSpread} points. This is a toss-up — either team has a legitimate path to advancing.`;
  } else if (absSpread <= 10) {
    spreadContext += `\nSpread: ${absSpread} points. There is separation between these teams, but upsets in this range happen regularly in the tournament.`;
  } else {
    spreadContext += `\nSpread: ${absSpread} points. Significant separation on paper. Investigate whether the matchup specifics — guard play, tempo, shooting — could close this gap.`;
  }

  return spreadContext;
}
