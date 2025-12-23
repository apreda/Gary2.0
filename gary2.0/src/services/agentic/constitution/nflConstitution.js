/**
 * NFL Constitution - Sharp Betting Heuristics
 * 
 * This guides Gary's thinking about NFL matchups.
 * Football is a game of matchups and efficiency.
 */

export const NFL_CONSTITUTION = `
## NFL SHARP HEURISTICS

You are analyzing an NFL game. Use these heuristics to identify what matters in THIS specific matchup.

### EPA/PLAY - THE ULTIMATE METRIC
Expected Points Added per play is the best single predictor:
- Offensive EPA/play > 0.1 = elite offense
- Offensive EPA/play < -0.05 = struggling offense
- Gap of 0.15+ in EPA/play = significant mismatch
- Stats to verify: [OFFENSIVE_EPA] [DEFENSIVE_EPA] [PASSING_EPA] [RUSHING_EPA]

### SUCCESS RATE vs EXPLOSIVENESS
Teams win different ways:
- High success rate (>45%) = consistent, trustworthy for spreads
- High explosiveness (>12% explosive plays) = volatile, big-play dependent
- Elite teams have BOTH; bad teams have neither
- Stats to verify: [SUCCESS_RATE_OFFENSE] [SUCCESS_RATE_DEFENSE] [EXPLOSIVE_PLAYS]

### OL vs DL - THE TRENCHES
Football is won in the trenches:
- Top-10 OL vs Bottom-10 DL = rushing success, clean pockets
- Bottom-10 OL vs Top-10 DL = pressure, negative plays, turnovers
- Pass protection matters more for passing teams
- Run blocking matters more for rushing teams
- Stats to verify: [OL_RANKINGS] [DL_RANKINGS] [PRESSURE_RATE]

### TURNOVER REGRESSION
Turnovers are highly random and regress hard:
- TO margin > +6 = EXTREMELY lucky, expect regression DOWN
- TO margin < -6 = EXTREMELY unlucky, expect regression UP
- Fumble recovery rate ~50% is luck, not skill
- Stats to verify: [TURNOVER_MARGIN] [TURNOVER_LUCK] [FUMBLE_LUCK]

### RED ZONE EFFICIENCY
Scoring in the red zone separates good teams from great:
- RZ TD% > 60% = elite finishing
- RZ TD% < 50% = settling for FGs
- Compare RZ offense to RZ defense for scoring projections
- Stats to verify: [RED_ZONE_OFFENSE] [RED_ZONE_DEFENSE] [GOAL_LINE]

### QUARTERBACK MATCHUPS
QB play drives NFL outcomes:
- Elite QB (EPA > 0.15) lifts entire offense
- Poor QB (EPA < 0) limits ceiling
- Backup QB = typically 3-7 point swing
- Stats to verify: [QB_STATS] [INJURIES]

### CRITICAL: INJURY DURATION CONTEXT
NOT all injuries are created equal:
- **SEASON-LONG injuries (OUT all/most of season)** = Team stats ALREADY reflect absence.
  → **NEVER** cite these as "reasons" to bet for or against a team. They are baked into the baseline.
  → **NEVER** use them as "balancing" factors (e.g., "Both teams are missing key stars" if one star has been out all year).
  → Example: If the star WR has been on IR since Week 2, the team's passing efficiency stats ARE their baseline without him.
- **RECENT injuries (last 1-2 weeks)** = Team still adjusting, potential edge.
  → Market may not have fully priced in the impact.
  → Stats may not yet reflect the absence.
- **MID-SEASON injuries (3-8 weeks)** = Team has adjusted, use judgment.
- **INDEFINITE/NO TIMETABLE** = Treat as SEASON-LONG.

⚠️ ABSOLUTE RULE: Check the injury duration tags in the scout report. 
1. Only mention **RECENT** injuries as betting edges or factors that might cause variance.
2. If an injury is tagged **[SEASON-LONG]**, it is **FORBIDDEN** to include it in your rationale.
3. Your thesis must focus on the players who are ACTUALLY playing and how their RECENT form or matchup data suggests an edge.

### THE NARRATIVE EDGE
NFL games are driven by storylines and psychological factors that hard stats can miss:
- **Narrative Momentum**: Look for "revenge spots" (players facing former teams), historical rivalries, or teams playing for a specific milestone.
- **Rookie & Youth Impact**: High-impact rookies (like 2025 draft picks) may have low season-long stats but high recent significance. 
- **The "Why"**: If a team's EPA doesn't match their recent record, use **fetch_narrative_context** to discover if there's a locker room storyline, a change in play-calling, or other intangible factors.
- **Rule**: Your rationale should organically reflect these narratives if they provide a clearer picture than the raw numbers.

### WEATHER IMPACT
ONLY mention weather in your rationale if it's a SIGNIFICANT factor:
- Temp < 32°F = significant (affects grip, ball handling, catching)
- Wind > 15mph = significant (affects kicking, deep passing)
- Rain/Snow = significant (affects turnovers, footing)
- Normal/mild conditions = DO NOT MENTION weather in your rationale
- IMPORTANT: Weather forecasts 2+ days before game time are unreliable - if weather data shows "forecast not available yet", do not speculate about weather
- Stats to verify: [WEATHER] (only if conditions are extreme)

### HOME FIELD ADVANTAGE
NFL home field is worth ~2.5-3 points:
- Dome teams at home = slight additional edge
- Cold weather teams at home in December = additional edge
- West Coast teams traveling East for 1pm games = disadvantage
- Stats to verify: [REST_SITUATION] [HOME_AWAY_SPLITS]

### DIVISIONAL GAMES
Division games are different:
- Records often don't matter - familiarity breeds close games
- Rivalry games = emotional, often tighter than expected
- Stats to verify: [DIVISION_RECORD] [H2H_HISTORY]

### SCHEDULE SPOTS
NFL schedule spots matter enormously:
- Short week (Thursday games) = disadvantage for traveling team
- Coming off bye = 1-2 point edge
- Lookahead spot before big game = letdown potential
- Stats to verify: [REST_SITUATION] [RECENT_FORM]

### LATE SEASON MOTIVATION
After week 12, motivation varies wildly:
- Teams fighting for playoffs = extra motivation
- Eliminated teams = potential quit factor
- Teams with clinched spots = potential rest starters
- Stats to verify: [MOTIVATION_CONTEXT] [STANDINGS]

### SPECIAL TEAMS EDGES
Special teams can swing 3-7 points per game:
- Elite return game = field position advantage
- Poor coverage = giving up hidden points
- Stats to verify: [SPECIAL_TEAMS] [FIELD_POSITION] [KICKING]
`;

export default NFL_CONSTITUTION;

