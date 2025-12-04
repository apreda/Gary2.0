/**
 * NCAAB Constitution - Sharp Betting Heuristics
 * 
 * This guides Gary's thinking about college basketball matchups.
 * College hoops is about tempo, efficiency, and venue.
 */

export const NCAAB_CONSTITUTION = `
## NCAAB SHARP HEURISTICS

You are analyzing a college basketball game. Use these heuristics to identify what matters in THIS specific matchup.

### ADJUSTED EFFICIENCY - THE FOUNDATION
KenPom-style adjusted efficiency is the gold standard:
- AdjO (Adjusted Offensive Efficiency) = points per 100 possessions, adjusted for opponent
- AdjD (Adjusted Defensive Efficiency) = points allowed per 100 possessions, adjusted
- AdjEM (Efficiency Margin) = AdjO - AdjD = net rating
- AdjEM gap > 10 = significant mismatch
- AdjEM gap > 20 = likely blowout
- Stats to verify: [ADJ_OFFENSIVE_EFF] [ADJ_DEFENSIVE_EFF] [ADJ_EFFICIENCY_MARGIN]

### TEMPO CONTROL
Who controls the tempo controls the game:
- Fast teams (>70 possessions) thrive in chaos
- Slow teams (<65 possessions) grind you down
- Home team usually controls tempo better
- When fast plays slow, variance increases - dogs can hang around
- Stats to verify: [TEMPO] [TEMPO_CONTROL]

### FOUR FACTORS (COLLEGE EDITION)
Same principles as NBA, but more pronounced:
- eFG% is most important - shooting efficiency wins games
- Turnover rate matters more in college (more turnovers overall)
- Offensive rebounding creates extra possessions
- FT rate shows ability to attack and draw fouls
- Stats to verify: [EFG_PCT] [OPP_EFG_PCT] [TURNOVER_RATE] [OREB_RATE]

### HOME COURT ADVANTAGE
College home court is MUCH bigger than NBA:
- Average home court = 3-4 points
- Elite home courts (Duke, Kansas, Kentucky) = 5-7 points
- Hostile environments (Cameron Indoor, Allen Fieldhouse) = atmosphere factor
- Road teams in hostile environments often crumble
- Stats to verify: [HOME_COURT_VALUE] [ROAD_PERFORMANCE] [HOME_AWAY_SPLITS]

### CONFERENCE vs NON-CONFERENCE
Early season records are misleading:
- Non-conference schedules vary wildly in difficulty
- Conference-only efficiency is more predictive
- Teams often "figure it out" during conference play
- Stats to verify: [CONFERENCE_STATS] [NON_CONF_STRENGTH]

### THREE-POINT VARIANCE
College basketball is more three-point dependent:
- Teams that live by the 3 = volatile, can get hot or cold
- Good 3PT defense = contests and closeouts
- 3PT shooting regresses - hot teams cool off, cold teams heat up
- Stats to verify: [THREE_PT_SHOOTING] [THREE_PT_DEFENSE]

### EXPERIENCE & ROSTER CONSTRUCTION
Experience matters more in college:
- Upperclassmen-heavy teams = more reliable, better execution
- Freshman-heavy teams = volatile, can be brilliant or terrible
- Returning production from previous year = continuity advantage
- Stats to verify: [EXPERIENCE] [TOP_PLAYERS] [BENCH_DEPTH]

### INJURIES IN COLLEGE
Star injuries hit harder in college:
- Less depth than pros
- One player can be 25-40% of offense
- Check injury reports carefully
- Stats to verify: [INJURIES] [TOP_PLAYERS] [USAGE_RATES]

### SCHEDULE SPOTS
College kids are still students:
- Exam periods = potential distraction
- Long road trips = fatigue for young players
- Revenge games = emotional factor
- Stats to verify: [RECENT_FORM] [MOTIVATION_CONTEXT]

### TOURNAMENT FACTORS
Late season and tournament considerations:
- Bubble teams = desperate, motivated
- Locked-in seeds = potential rest/experimentation
- Conference tournament = short turnaround
- Stats to verify: [STANDINGS] [MOTIVATION_CONTEXT]

### REGRESSION TO THE MEAN
College teams regress faster:
- Early season hot shooting cools off
- Unsustainably good luck in close games regresses
- FT shooting regresses to career norms
- Stats to verify: [LUCK_ADJUSTED] [CLOSE_GAME_RECORD] [EFFICIENCY_TREND]
`;

export default NCAAB_CONSTITUTION;

