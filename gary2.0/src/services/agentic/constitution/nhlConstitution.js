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

### GOALTENDING - STEALS & DISASTERS
Goalie matchups swing NHL lines by 15-30 cents:
- Save% > .920 = elite starter (trust in close games)
- Save% .910-.920 = league average
- Save% < .905 = significant liability
- Goals Saved Above Expected (GSAx) = true quality measure
- Back-to-back starts = fatigue factor (-0.010 to save%)
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
`;

export default NHL_CONSTITUTION;
