/**
 * NHL Constitution - Sharp Hockey Betting Heuristics
 * 
 * This guides Gary's thinking about NHL matchups.
 * Hockey is a game of possession, special teams, and goaltending.
 * 
 * NOTE: NHL is in BETA mode - uses BDL basic stats + Perplexity-sourced advanced analytics.
 */

export const NHL_CONSTITUTION = `
## NHL SHARP HEURISTICS (BETA - Supplemental Analytics)

Note: NHL picks use Perplexity-sourced advanced stats (Corsi, xG, PDO) in addition to API data.
Confidence levels may be slightly lower than NBA/NFL due to data source differences.

### CORSI & EXPECTED GOALS - THE GOLD STANDARD
These possession/chance-quality metrics are the best predictors in hockey:
- CF% (Corsi For %) > 52% = controlling play at 5v5
- xGF% (Expected Goals For %) > 52% = generating quality chances
- Team significantly outperforming xG = regression candidate (lucky)
- Team significantly underperforming xG = bounce-back candidate
- Stats to verify: [CORSI_FOR_PCT] [EXPECTED_GOALS] [SHOT_METRICS]

### HIGH-DANGER CHANCES (HDC) - BET THE PROCESS
Goals in hockey are "noisy" but chances are repeatable:
- Teams in top 10 for HDC will eventually convert, even if not scoring now
- Creating chances right in front of the crease = repeatable skill
- If team has high HDC but low goals, they're due for positive regression
- "Bet the process, not the results" - sharps love high-HDC underdogs
- Stats to verify: [SHOT_METRICS] [EXPECTED_GOALS]

### PDO - THE LUCK INDICATOR
PDO = team shooting% + team save% (league average = 100):
- PDO > 102 = running hot, expect regression DOWN
- PDO < 98 = running cold, expect regression UP
- Sustainable skill range: 99-101
- High PDO + weak underlying metrics = FADE candidate
- Stats to verify: [PDO] [SHOOTING_PCT] [SAVE_PCT]

### SPECIAL TEAMS - THE GREAT EQUALIZER
Power play and penalty kill are critical differentiators:
- PP% > 24% = elite power play (league avg ~20%)
- PP% < 17% = struggling power play
- PK% > 82% = elite penalty kill (league avg ~80%)
- PK% < 76% = vulnerable penalty kill
- Compare team PP% vs opponent PK% for scoring edge
- Stats to verify: [POWER_PLAY_PCT] [PENALTY_KILL_PCT] [SPECIAL_TEAMS]

### GOALTENDING - THE TANDEM ERA (2025 Critical Factor)
Hockey has moved away from "star goalie plays 70 games" - it's now a TANDEM LEAGUE:
- Save% > .920 = elite starter (trust in close games)
- Save% .910-.920 = league average
- Save% < .900 = significant liability (FADE the favorite if backup has sub-.900)
- Goals Saved Above Expected (GSAx) = true quality measure - better than raw SV%
- **GOALIE CONFIRMATION IS CRITICAL**: If starter vs backup is unclear, game is unpredictable
- Best tandems (2025): TOR (Stolarz/Woll), NJD (Markstrom/Allen), NYR (Shesterkin/backup)
- Back-to-back starts = fatigue factor (-0.010 to save%)
- **KEY RULE**: If favorite's backup goalie (sub-.900 SV%) is starting = FADE or skip
- Stats to verify: [GOALIE_STATS] [SAVE_PCT] [GOALS_AGAINST_AVG]

### SHOT VOLUME - CORSI PROXY
Shots for/against per game indicate possession when Corsi unavailable:
- Outshooting opponent by 5+ shots/game = sustained pressure
- Being outshot by 5+ = relying on goaltending/luck
- High shots + low goals = PDO regression candidate
- Stats to verify: [SHOTS_FOR] [SHOTS_AGAINST] [SHOT_DIFFERENTIAL]

### REST AND SCHEDULE DENSITY
Back-to-backs and travel matter significantly in hockey:
- Road team on back-to-back = 0.5-1 goal disadvantage
- Home team on back-to-back = ~0.3 goal disadvantage
- 3 games in 4 nights = significant fatigue factor
- Cross-timezone travel (3+ hours) = jet lag impact
- Stats to verify: [REST_SITUATION] [SCHEDULE] [TRAVEL]

### HOME ICE ADVANTAGE
NHL home teams win ~55% of games:
- Last change advantage = matchup control
- Line matching in offensive zone
- Favorable referee tendencies at home
- Crowd energy in tight, physical games
- Stats to verify: [HOME_AWAY_SPLITS]

### DIVISIONAL & RIVALRY GAMES
Familiarity breeds close games:
- Division games are often lower-scoring
- Playoff seeding implications intensify late season
- Historical grudge matches = more physicality, more penalties
- Stats to verify: [HEAD_TO_HEAD] [DIVISION_RECORD]

### REGRESSION INDICATORS
Look for teams due for correction:
- Record much better than expected (Pythagorean) = lucky
- High 1-goal game win rate (>60%) = unsustainable
- Overtime/shootout heavy record = regression likely
- Stats to verify: [LUCK_INDICATORS] [CLOSE_GAME_RECORD]

### LINEUP & INJURY CONTEXT
Key player availability matters:
- #1 goalie vs backup = 3-5 point swing
- Top-line forward out = reduced offense
- Top-pair defenseman out = PP/PK impact
- Stats to verify: [INJURIES] [LINEUP_CHANGES]

### BET TYPE SELECTION - PUCK LINE VS MONEYLINE
Always evaluate BOTH puck line (+1.5/-1.5) and moneyline:
- Prefer PUCK LINE +1.5 when:
  - Underdog has strong underlying metrics but inconsistent finishing
  - Close game expected (tight goalie matchup)
  - Road team with good shot metrics against home favorite
  - Odds are +120 or better on the +1.5
- Prefer MONEYLINE when:
  - Dog has legitimate upset potential (plus money ML)
  - Favorite's edge is large enough to win by 2+ (rare in NHL)
  - One-goal games are likely (~50% of NHL games)
- AVOID: Puck line bets with odds worse than -200 (too juicy)
- NHL games are typically close - puck line +1.5 hits ~70% for dogs
`;

export default NHL_CONSTITUTION;
