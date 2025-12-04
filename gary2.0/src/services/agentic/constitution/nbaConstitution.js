/**
 * NBA Constitution - Sharp Betting Heuristics
 * 
 * This guides Gary's thinking about NBA matchups.
 * These are PATTERNS to look for, not rules to follow blindly.
 */

export const NBA_CONSTITUTION = `
## NBA SHARP HEURISTICS

You are analyzing an NBA game. Use these heuristics to identify what matters in THIS specific matchup.

### PACE CLASH SITUATIONS
When teams have significantly different pace profiles:
- Fast team (Pace > 101) vs Slow team (Pace < 97) = VOLATILITY
- The fast team wants chaos; the slow team wants control
- Consider: Who dictates the game script? Home team usually controls pace better.
- Stats to verify: [PACE] [PACE_HOME_AWAY]

### REST & FATIGUE EDGES
Rest advantages are often underpriced:
- 2+ days rest vs Back-to-Back = 2-4 point swing
- B2B + cross-country travel = additional 1-2 points
- 4+ days rest can mean rust, not advantage
- Stats to verify: [REST_SITUATION]

### EFFICIENCY GAPS
Offensive and Defensive Rating tell the real story:
- ORtg gap > 5 points = significant offensive edge
- DRtg gap > 5 points = significant defensive edge
- NetRtg is the ultimate predictor of team quality
- Stats to verify: [OFFENSIVE_RATING] [DEFENSIVE_RATING] [NET_RATING]

### FOUR FACTORS MISMATCHES
Dean Oliver's Four Factors predict 90%+ of outcomes:
1. eFG% (shooting efficiency) - Most important
2. TOV% (turnover rate) - Ball security
3. ORB% (offensive rebounding) - Second chances
4. FT Rate (free throw rate) - Getting to the line
- Look for 2+ factors strongly favoring one side
- Stats to verify: [EFG_PCT] [TURNOVER_RATE] [OREB_RATE] [FT_RATE]

### DEFENSIVE SCHEME MATCHUPS
Different defenses struggle against different offenses:
- Elite paint defense (#1-10) vs paint-heavy offense = trouble for offense
- Elite perimeter defense vs 3PT-heavy offense = trouble for offense
- Poor transition defense vs fast-paced team = trouble for defense
- Stats to verify: [PAINT_DEFENSE] [PERIMETER_DEFENSE] [PAINT_SCORING] [THREE_PT_SHOOTING]

### INJURY IMPACT
Star player injuries swing lines 3-7 points:
- Top-10 player out = 4-6 point swing
- Secondary star out = 2-3 point swing
- Role player out = rarely significant unless it's the backup
- Stats to verify: [INJURIES] [TOP_PLAYERS] [USAGE_RATES]

### HOME COURT ADVANTAGE
NBA home court is worth ~2.5-3 points on average:
- Elite home courts (Denver altitude, Utah) = 4+ points
- Bad home courts (LAC, some rebuilding teams) = 1-2 points
- Stats to verify: [HOME_AWAY_SPLITS]

### SCHEDULE SPOTS
Look for letdown and lookahead spots:
- After emotional win vs rival = potential letdown
- Before marquee matchup = potential lookahead
- 4th game in 5 nights = fatigue spot
- Stats to verify: [RECENT_FORM] [SCHEDULE_STRENGTH]

### CLUTCH PERFORMANCE
Some teams consistently close games, others collapse:
- Strong clutch teams (top 10) can be trusted in close games
- Weak clutch teams (bottom 10) often blow leads
- Stats to verify: [CLUTCH_STATS]

### REGRESSION INDICATORS
Teams that are "lucky" will regress:
- Record significantly better than Pythagorean expectation = lucky
- High close-game win rate (>60%) = often unsustainable
- Stats to verify: [LUCK_ADJUSTED] [CLOSE_GAME_RECORD]
`;

export default NBA_CONSTITUTION;

