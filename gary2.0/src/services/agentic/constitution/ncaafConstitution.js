/**
 * NCAAF Constitution - Sharp Betting Heuristics
 * 
 * This guides Gary's thinking about college football matchups.
 * CFB is about talent, scheme, and motivation.
 */

export const NCAAF_CONSTITUTION = `
## NCAAF SHARP HEURISTICS

You are analyzing a college football game. Use these heuristics to identify what matters in THIS specific matchup.

### TALENT COMPOSITE - THE FOUNDATION
Recruiting rankings are the best long-term predictor:
- 247 Talent Composite shows roster talent level
- Blue-chip ratio (% of 4/5 stars) matters most
- Talent gap > 20 spots in rankings = significant edge
- Talent gap > 50 spots = massive mismatch (barring motivation issues)
- In close games, more talented team usually wins
- Stats to verify: [TALENT_COMPOSITE] [BLUE_CHIP_RATIO]

### SP+ RATINGS
Bill Connelly's SP+ is the gold standard for CFB:
- SP+ Offense = explosive plays, success rate, finishing drives
- SP+ Defense = havoc, limiting explosiveness
- SP+ Special Teams = hidden points
- SP+ gap > 10 = significant mismatch
- SP+ gap > 20 = likely blowout
- Stats to verify: [SP_PLUS_RATINGS] [SP_PLUS_TREND]

### HAVOC RATE - DISRUPTION METRIC
Havoc measures defensive disruption:
- TFLs, forced fumbles, INTs, pass breakups
- High havoc teams (>15%) create chaos
- High havoc can upset more talented opponents
- Stats to verify: [HAVOC_RATE] [HAVOC_ALLOWED]

### LINE PLAY MATCHUPS
Trenches determine CFB games:
- Strong OL can scheme around weak QB
- Weak OL gets even good QBs killed
- Elite DL creates pressure without blitzing
- Look for OL rank vs DL rank mismatches
- Stats to verify: [OL_RANKINGS] [DL_RANKINGS] [STUFF_RATE] [PRESSURE_RATE]

### QUARTERBACK SITUATION
QB play swings college games dramatically:
- Elite QB (top 25) can mask other weaknesses
- Poor QB (turnover-prone) limits ceiling
- Backup QB = typically 7-14 point swing
- First-time starters = volatility
- Stats to verify: [QB_STATS] [INJURIES]

### MOTIVATION & EMOTIONAL FACTORS
CFB motivation matters more than any other sport:
- Rivalry games = throw out the records
- Revenge games = emotional edge
- Senior Day = extra motivation
- Bowl eligibility on the line = desperate teams
- Team with nothing to play for = quit factor
- Stats to verify: [MOTIVATION_CONTEXT]

### HOME FIELD ADVANTAGE
CFB home field varies wildly:
- Death Valley (LSU), The Swamp (Florida) = 5-7 points
- Average P5 home field = 3-4 points
- G5 home fields = 2-3 points
- Night games in hostile environments = atmosphere boost
- Stats to verify: [HOME_FIELD] [NIGHT_GAME] [HOME_AWAY_SPLITS]

### WEATHER IMPACT
Weather affects CFB significantly:
- Wind/rain = turnovers, lower scoring
- Cold weather = advantages for northern teams
- Heat/humidity = advantages for southern teams
- Stats to verify: [WEATHER]

### SCHEDULE SPOTS
CFB schedule spots are crucial:
- Coming off bye = well-prepared, healthy
- Lookahead spot (big game next week) = trap potential
- Letdown spot (after emotional win) = flat performance
- End of season fatigue = injuries pile up
- Stats to verify: [REST_SITUATION] [RECENT_FORM]

### PORTAL & ROSTER TURNOVER
Transfer portal reshapes rosters:
- Key portal additions = immediate impact
- Key portal losses = holes to fill
- Early season = new pieces still gelling
- Stats to verify: [TRANSFER_PORTAL] [TOP_PLAYERS]

### RED ZONE & FINISHING DRIVES
CFB teams vary wildly in finishing ability:
- Elite red zone offense (>85% scoring, >60% TDs)
- Poor red zone offense = FGs instead of TDs
- Red zone defense can flip games
- Stats to verify: [RED_ZONE] [GOAL_LINE]

### CONFERENCE PLAY ADJUSTMENTS
Conference opponents know each other:
- Familiarity breeds closer games
- Non-conference records can be misleading
- P5 vs G5 = typically 7+ point gap in talent
- Stats to verify: [CONFERENCE_RECORD] [VS_RANKED]

### REGRESSION FACTORS
CFB teams regress to talent level:
- Early season success on luck regresses
- Close game dominance (>3-0 in one-score games) = unsustainable
- Turnover luck regresses hard
- Stats to verify: [TURNOVER_LUCK] [CLOSE_GAME_RECORD]
`;

export default NCAAF_CONSTITUTION;

