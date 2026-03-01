/**
 * Flash Investigation Methodology — Per-Sport Factor Lists + Socratic Questions
 *
 * This file contains the comprehensive investigation framework that the Flash
 * research assistant uses to conduct thorough pre-game research. Flash investigates
 * every factor, connects dots, and reports findings — Gary Pro makes the decisions.
 *
 * Adapted from the per-sport constitution checklists and orchestrator investigation
 * prompts that were previously in Gary's constitution (removed to prevent pattern
 * repetition). Now Flash handles thoroughness; Gary handles judgment.
 */

// ═══════════════════════════════════════════════════════════════════════
// NBA INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NBA_FACTORS = `## INVESTIGATION CHECKLIST — NBA

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. EFFICIENCY
**Tokens:** NET_RATING, OFFENSIVE_RATING, DEFENSIVE_RATING, EFFICIENCY_LAST_10, EFFICIENCY_TREND
- Compare L5/L10 ratings to season baselines for both teams
- If there's a gap > 5pts between L5 and season, investigate: did the roster change? Did schedule quality change? Is shooting variance the driver?
- Cross-reference: do the efficiency trends overlap with any injury timeline?

### 2. PACE & TEMPO
**Tokens:** PACE, PACE_LAST_10, PACE_HOME_AWAY
- What's each team's pace? Is there a significant mismatch?
- Has either team's pace changed recently (L10 vs season)?
- Does the pace matchup favor either side? Fast team vs slow team — who controls tempo?

### 3. FOUR FACTORS (OFFENSE)
**Tokens:** EFG_PCT, TURNOVER_RATE, OREB_RATE, FT_RATE
- Compare all four factors for both teams
- Which factor shows the biggest gap? Is that gap structural (consistent all season) or recent (L5 divergence)?
- If eFG% diverges from season in L5, check whether it's volume change (more 3PA) or percentage spike (unsustainable)

### 4. FOUR FACTORS (DEFENSE)
**Tokens:** OPP_EFG_PCT, OPP_TOV_RATE, OPP_FT_RATE, DREB_RATE
- Compare defensive four factors for both teams
- Does one team's offensive strength attack the other's specific defensive weakness?

### 5. SHOOTING PROFILE
**Tokens:** THREE_PT_SHOOTING, PAINT_SCORING, THREE_PT_DEFENSE, PAINT_DEFENSE, PERIMETER_DEFENSE, TRANSITION_DEFENSE
- How does each team score? 3PT-dependent or paint-attack?
- Compare each team's offensive shooting zones to the opponent's defensive profile in those zones
- If a team's L5 3P% is 5%+ above season, note this as potential regression risk

### 6. STANDINGS & CONTEXT
**Tokens:** STANDINGS, CONFERENCE_STANDING
- Playoff implications? Seeding battles? Tanking?
- Is either team in a motivational spot (clinch, elimination, meaningless)?

### 7. RECENT FORM
**Tokens:** RECENT_FORM, QUARTER_SCORING, FIRST_HALF_SCORING, SECOND_HALF_SCORING
- L5/L10 performance vs season — what's driving any divergence?
- WHO was playing during the recent stretch? Is the roster the same as tonight?
- What do the MARGINS look like? Winning by 2 every game vs winning by 15 tells different stories
- A 4-game win streak with a star back ≠ the same team that lost 5 straight without him

### 8. INJURIES & ROSTER
**Tokens:** INJURIES, TOP_PLAYERS, USAGE_RATES, MINUTES_TREND, LINEUP_NET_RATINGS, BENCH_DEPTH

**For each injured player listed in the scout report:**
The scout report labels each injury with a market-aware duration tag. Use these to guide your investigation depth:

**FRESH and SHORT-TERM injuries require full investigation:**
- Investigate: Who is getting the minutes in that player's role since the injury?
- Investigate: What is the replacement player's production profile — both in the games since the injury AND their season-long stats?
- Investigate: How has the team performed in the games without the injured player vs their season average?
- Investigate: What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?
- For each FRESH or SHORT-TERM injury: How long has the market known about this absence? Has the line had time to fully adjust?

**LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
- The team's current stats already reflect life without this player. Do not treat as new information.

- **If L5/L10 diverges 7+ from season**, pull game logs for top usage players — who's driving it?

**RETURNING PLAYERS:**
When a player is listed as GTD or Questionable after missing time:
- Check their GP (games played) stat — a low GP relative to team games played means they've been on-and-off
- Investigate: How does the team perform WITH vs WITHOUT this player?
- Is this player's absence a pattern the team is accustomed to, or a genuine disruption?
- If they return tonight, expect potential minutes restriction and reintegration effects

### 9. SCHEDULE & REST
**Tokens:** REST_SITUATION, BACK_TO_BACK, TRAVEL_SITUATION, SCHEDULE_STRENGTH
- What is this team's ACTUAL record and efficiency on B2Bs/short rest this season?
- Is there evidence fatigue affected recent performance, or is it just the schedule narrative?
- Travel context: time zone shifts, road trip length

### 10. HEAD-TO-HEAD
**Tokens:** H2H_HISTORY, VS_ELITE_TEAMS
- Were those H2H games with same personnel? Same venue? Different point in season?
- Was the result structural (scheme mismatch) or variance (one team shot 15% from 3)?
- What's DIFFERENT tonight? Different roster health, different venue, different form

### 11. CLOSE GAMES & VARIANCE
**Tokens:** CLUTCH_STATS, BLOWOUT_TENDENCY, LUCK_ADJUSTED, HOME_AWAY_SPLITS
- Close game record vs expected record — is either team due for regression?
- Home/away efficiency splits — what SPECIFIC metric changes?
- Investigate whether the spread is being moved by home court or by the travel, rest, and schedule context surrounding this game.

## DEEP INVESTIGATION — NBA-SPECIFIC

### PROCESS METRICS — WHERE IS THE GAP?
Investigate the process behind each team's results — shooting efficiency, ball security, second chances, and free throw generation.
- Where is the biggest process gap between these two teams?
- Which gap is most relevant given how these teams play against each other?
- Does the matchup amplify or neutralize any of these gaps?

### QUESTIONABLE / GTD / DOUBTFUL PLAYERS INVESTIGATION
When a key player is QUESTIONABLE, GTD, or DOUBTFUL:
- **Check their GP stat:** Compare to team games played. A player with 35 GP when the team has played 55 games has missed 20 games — this is an on-and-off pattern, not a fresh disruption.
- **On-and-off pattern:** If the player frequently misses games, investigate the team's performance WITH vs WITHOUT them. Has the market already learned this pattern? The spread may already reflect the probability of absence.
- **Fresh GTD after extended absence:** This could signal a RETURN. Investigate the team's data without this player and what adding them back would mean. Expect potential minutes restriction.
- **DOUBTFUL players:** Likely absent — investigate how the team has performed without them and whether the spread reflects the absence.
- **The key question:** Is the market treating this as a fresh injury (big line move) or a known pattern (minimal move)? Pull the data to see which is correct.

### GAME CONTEXT
- **Margin check**: Do these teams' styles produce close games or wide margins? What does the Net Rating gap and pace matchup suggest about game flow?
- **Spread vs stats check**: If the stats show a close matchup but the spread is large, investigate what's driving the spread beyond the stats. If the stats show a clear gap but the spread is small, investigate what the market might be seeing that the stats don't capture.
- **Injury timing**: How long has each player been out? What do the team's stats look like during the absence? What does the current spread tell you about how the market assessed this roster?
- **Key numbers**: If this spread sits on a key number, investigate which side benefits most

### TEAM IDENTITY — UNDERSTAND WHY, NOT JUST WHAT
- **Shooting identity**: What does the scoring profile show about how this team creates offense?
- **Ball security**: What does the turnover data reveal?
- **Pace identity**: What does the tempo data show about how this matchup plays out?
- **Depth**: What does the minutes distribution tell you about roster depth?

**INSTEAD OF HOME/AWAY RECORDS:**
- "Their road record is 7-14 — but WHY?" → Investigate what the data shows about their performance splits
- Don't say "they play well at home" — ask: "WHAT do they do better at home?" The answer tells you if that advantage applies to THIS game

### REGRESSION & TREND DETECTION
When L5/L10 diverges from season baseline:
- What evidence distinguishes a real shift from variance?
- Are the key contributors outperforming their baselines, and is that likely to continue?
- Season avg = baseline identity. L5/L10 = current form. The gap tells the story.
- Which of this team's strengths are stable vs volatile — and what does that mean for tonight?

### WHAT'S IN THE SPREAD?
The spread prices in more than raw team quality. Records, rankings, home court, schedule context, and the SPOT all move lines.

**CAUSAL VS DESCRIPTIVE:**
- Records, rankings, and streaks DESCRIBE — they tell you what happened. They explain why the line is set where it is. But "40-20" can't tell you which side of tonight's spread is the better bet.
- Stats that measure HOW a team plays EXPLAIN — they reveal what's causing the results and how each team's strengths match up against the opponent's weaknesses.
- The SPOT — venue, schedule, rest situations, emotional context — creates variance that shapes how tonight plays out.
- Investigate all three layers: descriptive context (explains the line), causal metrics (explains the matchup), AND situational factors (the spot).

When you cite a record, ranking, or situation — ask: "Is this describing what happened, or explaining what will happen tonight?"

**FOR LARGE SPREADS (8+ points):**
Large spreads are about MARGIN, not just winning. Investigate:
- Does the depth comparison for BOTH teams support or undermine this margin?
- In the NBA, rotation depth and bench quality determine whether a team can sustain a lead. How does rotation depth affect whether a team can extend or close a gap?
- Which team's depth is the bigger factor — can the deeper team pile on, or can the shorter rotation hold on?

### INJURY MARKET TIMING
The scout report labels each injury with a market-aware duration tag. Use these to guide your investigation depth:

**FRESH and SHORT-TERM injuries require full investigation:**
- Investigate: Who is getting the minutes in that player's role since the injury?
- Investigate: What is the replacement player's production profile — both in the games since the injury AND their season-long stats?
- Investigate: How has the team performed in the games without the injured player vs their season average?
- Investigate: What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?
- For each FRESH or SHORT-TERM injury: How long has the market known about this absence? Has the line had time to fully adjust?

**LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
- The team's current stats already reflect life without this player. Do not treat as new information.

### YOUR SCOUT REPORT IS YOUR BASELINE (DO NOT RE-FETCH)
- **Advanced Metrics (season baseline):** Net Rating, Offensive/Defensive Rating, Four Factors, Pace — the spread likely already reflects these
- **Standings:** Conference standing, playoff positioning
- **Recent Form:** L5/L10 game-by-game scores, margins, statistical trends
- **H2H History:** Previous matchups this season
- **Injuries:** Full injury report with freshness labels
- **Roster Depth:** Top players per team with stats and usage rates

This is the BASELINE — who these teams are. Your investigation should focus on what's DIFFERENT about THIS game vs the baseline.

### NBA INVESTIGATION TRIGGERS
Watch for these patterns that require deeper investigation:
- **Schedule Spot**: Back-to-backs, road trips, rest advantages — what does the data show about each team's performance in similar schedule spots this season?
- **Revenge / Rematch**: NBA teams play 3-4 times per season. What changed since the last meeting — roster health, form, lineup adjustments?
- **Home Court Factor**: Investigate what the home/away data reveals about venue impact for each team, and what that means relative to the spread.
- **Regression Check**: When L5/L10 shooting or efficiency diverges from the season baseline, what does the evidence show about sustainability?
- **Market Efficiency**: NBA lines are heavily bet — investigate whether transient factors (rest, travel, injury timing) are creating a gap between the data and the number.`;

// ═══════════════════════════════════════════════════════════════════════
// NFL INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NFL_FACTORS = `## INVESTIGATION CHECKLIST — NFL

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. EFFICIENCY (EPA)
**Tokens:** OFFENSIVE_EPA, DEFENSIVE_EPA, PASSING_EPA, RUSHING_EPA, EPA_LAST_5
- Compare EPA/play for both teams — offense and defense
- L5 EPA vs season — has something changed? Opponent quality during that stretch?
- Passing vs rushing EPA split — where is each team's efficiency concentrated?

### 2. SUCCESS RATE
**Tokens:** SUCCESS_RATE_OFFENSE, SUCCESS_RATE_DEFENSE, EARLY_DOWN_SUCCESS, LATE_DOWN_EFFICIENCY
- Early-down success rate drives game script
- Late-down efficiency (3rd down conversions) sustains drives
- Compare both teams across both dimensions

### 3. TRENCHES (O-LINE / D-LINE)
**Tokens:** OL_RANKINGS, DL_RANKINGS, PRESSURE_RATE, TIME_TO_THROW
- Pressure rate comparison — can one team's pass rush exploit the other's protection?
- Time to throw affects the entire passing game
- Run blocking affects rushing EPA

### 4. QB SITUATION
**Tokens:** QB_STATS
- Efficiency metrics, mobility, deep ball accuracy
- Performance under pressure
- Any change at QB? Backup QB data?

### 5. SKILL PLAYERS
**Tokens:** RB_STATS, WR_TE_STATS, DEFENSIVE_PLAYMAKERS
- Key matchups: WR vs CB, TE vs LB, RB in pass game
- Who are the playmakers and how might they be used?

### 6. TURNOVERS
**Tokens:** TURNOVER_MARGIN, TURNOVER_LUCK, FUMBLE_LUCK
- Turnover margin vs expected — is either team due for regression?
- Fumble luck (fumbles lost vs fumbles forced) — unstable metric

### 7. RED ZONE
**Tokens:** RED_ZONE_OFFENSE, RED_ZONE_DEFENSE, GOAL_LINE
- Red zone TD% for both teams — offense and defense
- A team that moves the ball but settles for FGs has a different profile than one that converts

### 8. EXPLOSIVE PLAYS
**Tokens:** EXPLOSIVE_PLAYS, EXPLOSIVE_ALLOWED
- Big play frequency (20+ yard gains) — created and allowed
- Explosive plays are high-variance but game-changing

### 9. SPECIAL TEAMS
**Tokens:** SPECIAL_TEAMS, KICKING, FIELD_POSITION
- Kicking accuracy, return game, field position battle
- In close games, field position and kicking can be decisive

### 10. RECENT FORM
**Tokens:** RECENT_FORM, QUARTER_SCORING, FIRST_HALF_TRENDS, SECOND_HALF_TRENDS
- 17-game season means tiny samples. A pick-six can swing a result
- What do recent margins look like? Close losses vs blowouts?
- First-half vs second-half trends — does either team fade or surge?

### 11. INJURIES
**Tokens:** INJURIES
- QB injuries reshape the entire offense. OL injuries change protection and run lanes
- How long has each player been out? What's the team's performance since?

### 12. SCHEDULE & REST
**Tokens:** REST_SITUATION, SCHEDULE_CONTEXT, HOME_AWAY_SPLITS
- Short week vs long week? Coming off bye?
- Travel context, time zone shifts
- Home/away splits

### 13. STANDINGS & DIVISION
**Tokens:** STANDINGS, DIVISION_RECORD
- Playoff implications, division race
- Division games have familiarity factor

### 14. H2H & DIVISION HISTORY
**Tokens:** H2H_HISTORY
- Divisional teams play twice — there may be a recent meeting with relevant data
- Non-divisional teams may not have played this season

### 15. COACHING
**Tokens:** FOURTH_DOWN_TENDENCY, TWO_MINUTE_DRILL
- Aggressive vs conservative? Fourth-down decisions?
- Two-minute drill efficiency

### 16. VARIANCE
**Tokens:** VARIANCE_CONSISTENCY
- Consistent performers vs boom-or-bust teams
- One-score game record vs expected

## DEEP INVESTIGATION — NFL-SPECIFIC

### KEY INVESTIGATION AREAS
NFL games are scarce (17 per team). Every detail matters. Investigate thoroughly.
- **Personnel**: What do the key players' recent game logs reveal? Who's trending up or down?
- **Matchup dynamics**: What does each team bring to this matchup? How do their strengths and weaknesses interact?
- **Situational efficiency**: What does the data show about each team in key situations?
- **Context**: What environmental, scheduling, or situational factors could shape THIS game?
- **Depth**: If key players are out, what does the data show about performance without them?

A 5-game NFL sample is 30% of the season. Investigate the WHY behind the numbers, not just the WHAT.

### STRUCTURAL MATCHUP AVENUE
Sometimes the game is decided by ONE SPECIFIC MATCHUP where a team's strength meets the opponent's weakness.

**When to explore:**
- One team has an elite unit facing a compromised unit
- A key player is returning/missing that changes how the team operates
- The styles of play create a specific clash point
- The spread feels "off" and you're looking for why

**The question:** "Is there a specific unit-vs-unit matchup where one team has a physical advantage that could determine the game's outcome?"

When investigating matchups, consider whether statistical success TRANSLATES to THIS specific opponent. Has this unit/player faced THIS archetype before? What happened?

### ROSTER CONTEXT PRINCIPLE
Recent performance trends are only meaningful if the ROSTER THIS WEEK matches the roster that created those trends.

When you see a trend, ask: "Does this week's roster match the roster that created this trend?" If not, investigate what the data says about the CURRENT roster version.

### TEAM IDENTITY — NFL-SPECIFIC
- **Offensive identity**: How does each team score? What does the data show about their style?
- **Defensive identity**: How does each team stop opponents? What does the data show?
- **Trench identity**: What does the line of scrimmage data show for each team?
- **Turnover profile**: What does each team's turnover data show — skill-driven or variance?
- **Situational identity**: Where does each team excel or struggle in key situations?

After identifying each team's style: How do these styles interact? What does each team bring to the matchup? How does that compare to what the spread implies?

### TIMEFRAME & REGRESSION
- L5 EPA above season? Real improvement or weak opponents? Check schedule quality
- L5 turnover margin extreme? Skill (INTs) or luck (fumbles)? Check the breakdown
- Which of this team's strengths are built on stable factors vs volatile ones — and what does that mean for tonight?
- Compare L5 to season baselines — what does the gap reveal?

### SITUATIONAL CONTEXT
- **Short week matters most when:** Combined with travel, or when a physical team played a grueling game
- **Bye weeks are mixed:** Rest is real, but rust is too — investigate how this specific team performs post-bye
- **Divisional games:** Division games often tighter than records suggest. H2H history can reveal matchup-specific patterns
- **Home field:** Dome teams at home vs outdoor visitors? Cold weather teams in December?
- **Weather:** For outdoor games, use fetch_narrative_context to search for weather conditions. Temperature and wind forecasts are reliable; precipitation less so
- **Late season motivation:** After week 12, investigate playoff picture, clinch scenarios, "spoiler" factor. Motivation is a soft factor — narratives mean nothing without performance data backing them up`;

// ═══════════════════════════════════════════════════════════════════════
// NHL INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NHL_FACTORS = `## INVESTIGATION CHECKLIST — NHL

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. POSSESSION METRICS
**Tokens:** CORSI_FOR_PCT, EXPECTED_GOALS, SHOT_DIFFERENTIAL, HIGH_DANGER_CHANCES, SHOT_QUALITY
- Corsi% and xGF% tell different stories — Corsi is volume, xG accounts for shot quality
- High-danger chance differential is the purest possession metric
- Compare 5v5 possession metrics for both teams

### 2. GOALTENDING
**Tokens:** GOALIE_STATS, SAVE_PCT, GOALS_AGAINST_AVG, GOALIE_MATCHUP, NHL_GSAX, NHL_GOALIE_RECENT_FORM, NHL_HIGH_DANGER_SV_PCT
- Who starts tonight? Season save% vs L10 save% — is the goalie hot or cold?
- GSAx (Goals Saved Above Expected) — true skill vs luck
- High-danger save% — performance on tough shots
- A streak with one goalie doesn't transfer to a different goalie

### 3. SPECIAL TEAMS
**Tokens:** POWER_PLAY_PCT, PENALTY_KILL_PCT, SPECIAL_TEAMS, PP_OPPORTUNITIES
- PP% vs PK% matchup — does one team's power play exploit the other's PK weakness?
- PP opportunity volume matters — a team that draws penalties vs one that doesn't

### 4. SCORING
**Tokens:** GOALS_FOR, GOALS_AGAINST, GOAL_DIFFERENTIAL
- Goal differential is a baseline. Scoring first affects game script
- Compare 5v5 goal rates to overall — does special teams inflate the numbers?

### 5. SHOT VOLUME
**Tokens:** SHOTS_FOR, SHOTS_AGAINST, SHOT_METRICS
- Shot volume vs shot quality — which matters more for this matchup?

### 6. LUCK & REGRESSION
**Tokens:** PDO, LUCK_INDICATORS, SHOOTING_REGRESSION, CLOSE_GAME_RECORD, ONE_GOAL_GAMES, OVERTIME_RECORD
- PDO (shooting% + save%) — values far from 100 regress toward it
- Shooting% regression — is either team's scoring unsustainably high or low?
- One-goal game record vs expected — luck or clutch?

### 7. RECENT FORM
**Tokens:** RECENT_FORM, HOT_PLAYERS
- L5/L10 results — same goalie? Same lineup? Same opponent quality?
- Hot players can drive short-term results

### 8. KEY PLAYERS & LINES
**Tokens:** TOP_SCORERS, TOP_PLAYERS, LINE_COMBINATIONS
- Top-6 forward production vs bottom-6 — depth scoring?
- Defensive pair matchups

### 9. INJURIES
**Tokens:** INJURIES
- Goalie injuries change everything
- Key forward/defenseman absences — how has the team adapted?

**FRESH and SHORT-TERM injuries require full investigation:**
- Investigate: Who is getting the minutes in that player's role since the injury?
- Investigate: What is the replacement player's production profile — both in the games since the injury AND their season-long stats?
- Investigate: How has the team performed in the games without the injured player vs their season average?
- Investigate: What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?
- For each FRESH or SHORT-TERM injury: How long has the market known about this absence? Has the line had time to fully adjust?

**LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
- The team's current stats already reflect life without this player. Do not treat as new information.

### 10. SCHEDULE & REST
**Tokens:** REST_SITUATION, BACK_TO_BACK
- B2B may mean a different goalie — that changes the matchup entirely
- Travel burden (cross-country road trips)

### 11. HOME ICE
**Tokens:** HOME_ICE, ROAD_PERFORMANCE, HOME_AWAY_SPLITS
- Last change advantage at home — matchup control
- Home/road splits for both teams

### 12. H2H & DIVISION
**Tokens:** H2H_HISTORY, DIVISION_STANDING, FACEOFF_PCT, POSSESSION_METRICS
- Divisional teams play multiple times — recent meetings are relevant
- Faceoff% affects possession

### 13. STANDINGS
**Tokens:** STANDINGS, POINTS_PCT, STREAK, PLAYOFF_POSITION
- Playoff race context — who needs the points?

### 14. VARIANCE & CONSISTENCY
**Tokens:** REGULATION_WIN_PCT, MARGIN_VARIANCE
- Regulation win% strips OT/SO variance
- Moneyline includes OT/SO — regulation dominance and OT variance are different

## DEEP INVESTIGATION — NHL-SPECIFIC

### KEY INVESTIGATION AREAS
Hockey outcomes are heavily goaltender-dependent and possession-driven.
- **Goaltending matchup**: Who is starting? What does recent form reveal vs season baseline?
- **Possession and shot quality**: What do the 5v5 metrics reveal about territorial control and chance quality?
- **Special teams**: What does PP% and PK% show? How do they interact in this matchup?
- **Schedule and fatigue**: Rest situation, B2B, compressed schedule? Who's in net on the second night?
- **Game structure**: Faceoff%, shot volume, close-game data — what does the process look like?

### H2H SWEEP CONTEXT
NHL division rivals play 3-4 times per year. When you see a 3-0 or 4-0 sweep developing, investigate:
- **Opponent quality**: Is the swept team actually an elite-tier team?
- **Division rival?**: Division games carry extra weight and motivation
- **Goaltending matchup**: Is tonight's starter the same as previous games? Has either goalie been on a hot/cold streak?
- **How did the sweep happen?**: Close games (1-goal margins) or blowouts?
- **Line adjustments**: Have coaches shuffled lines after previous meetings?
- **Playoff seeding**: Are there playoff seeding implications for either team?
- Use points percentage (not win%) — NHL uses points (OT losses = 1 point)

**The question:** "What does the current data tell me about THIS game — regardless of H2H record? Investigate whether the conditions from previous meetings still apply tonight."

### POSSESSION & PDO DEEP INVESTIGATION
Does THIS team's underlying possession data tell a different story than their record? What's driving any gap?

**PDO Investigation:**
- Investigate each team's PDO — what does it reveal about the sustainability of their results?
- What's driving the extreme PDO — shooting variance, goalie performance, or both?
- Is THIS team's starting goalie the same one who drove the PDO? Has the goalie changed?
- How many games into the streak are they? Has there been any partial correction already?
- What's THIS team's underlying shot quality (CF%, xG) — are they generating/allowing good chances regardless of PDO?

### TEAM IDENTITY — NHL-SPECIFIC
- **Possession identity**: What does the possession data reveal about this team's playing style?
- **Scoring quality**: What does the shot quality data tell you about how they create offense?
- **Special teams dependency**: What does the 5v5 vs special teams scoring breakdown reveal?
- **Depth**: What does the scoring distribution across lines tell you about depth?
- **Goaltending stability**: What does the goaltending data show — concentrated in one goalie or shared?

### STREAK SUSTAINABILITY
Is this streak backed by possession dominance (CF%, xG) or luck (PDO, OT wins)? Investigate whether the underlying metrics support continuation.

### THE TEAM TAKING THE ICE TONIGHT
- If they've gone 8-4 since losing their top-line center, that's who they are now
- For long-term injuries (IR/LTIR), investigate: Has the team played enough games without this player that their current stats reflect the adjusted roster?
- Investigate recent line combinations — how does the current structure compare to earlier in the season?
- "Am I analyzing the team taking the ice tonight, or a version of them from earlier in the season?"`;

// ═══════════════════════════════════════════════════════════════════════
// NCAAB INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NCAAB_FACTORS = `## INVESTIGATION CHECKLIST — NCAAB

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. EFFICIENCY RATINGS
**Tokens:** NCAAB_OFFENSIVE_RATING, NCAAB_DEFENSIVE_RATING, NET_RATING, NCAAB_L5_EFFICIENCY, NCAAB_BARTTORVIK
- AdjO, AdjD, AdjEM (adjusted efficiency margin) — the core metrics
- L5 efficiency vs season — has something changed? Conference schedule vs non-conference?
- Compare efficiency with and without key players

### 2. FOUR FACTORS
**Tokens:** NCAAB_FOUR_FACTORS, NCAAB_EFG_PCT, NCAAB_TS_PCT, TURNOVER_RATE, OREB_RATE, FT_RATE
- Compare eFG%, TOV%, ORB%, FT Rate for BOTH teams
- Which factor shows the biggest gap? Is that gap consistent or recent?
- Conference play four factors vs overall — schedule quality affects these

### 3. SCORING & SHOOTING
**Tokens:** SCORING, FG_PCT, THREE_PT_SHOOTING
- Scoring distribution — 3PT-dependent or paint-attack?
- 3PT shooting in conference play vs overall
- Home vs road shooting splits

### 4. DEFENSIVE STATS
**Tokens:** REBOUNDS, STEALS, BLOCKS
- Rebounding differential — does one team dominate the glass?
- Turnover forcing vs ball security matchup
- Shot-blocking presence

### 5. TEMPO
**Tokens:** NCAAB_TEMPO
- Pace mismatch — who controls tempo?
- Does either team play significantly faster or slower?
- A slow-tempo team vs a fast-tempo team — which style prevails?

### 6. RECENT FORM
**Tokens:** RECENT_FORM
- L5 vs season trends — who was playing during each stretch?
- Conference play form vs overall — opponent quality matters
- Are recent results with the current roster?

### 7. KEY PLAYER PERFORMANCE
**Tokens:** TOP_PLAYERS
- College basketball has 7-8 man rotations. A single absence changes a team more
- Top player usage, efficiency, and impact
- Freshman vs veteran — does experience show up in the data?

### 8. INJURIES
**Tokens:** INJURIES
- College rosters are thin — one injury matters more than in pro sports
- How long has each player been out? Team performance during absence?
- Fresh GTD/Questionable — could signal a return

### 9. SCHEDULE & REST
**Tokens:** REST_SITUATION
- Mid-week vs weekend games — travel and preparation time
- Conference tournament fatigue or regular season grind?

### 10. HOME COURT & VENUE
**Tokens:** HOME_AWAY_SPLITS, NCAAB_VENUE
- Home court effects are real and significant in college
- Home/away efficiency splits — what SPECIFIC metric changes?
- How does this team play at home vs how do they play on the road?
- Investigate how much of the spread is driven by home court — is the number reflecting the venue, crowd, and travel dynamics accurately, or is it over or undervaluing either side because of where this game is being played?

### 11. HEAD-TO-HEAD
**Tokens:** H2H_HISTORY
- Conference teams play twice — the first meeting may be relevant
- Were conditions similar? Same venue? Same roster health?
- Non-conference opponents rarely have H2H data

### 12. ASSISTS & PLAYMAKING
**Tokens:** ASSISTS
- Ball movement, assist rate — is the offense flowing or hero-ball?
- Assist-to-turnover ratio

## DEEP INVESTIGATION — NCAAB-SPECIFIC

### YOUR SCOUT REPORT IS YOUR BASELINE (DO NOT RE-FETCH)
- **Advanced Metrics (season baseline):** Barttorvik (T-Rank, AdjEM, AdjO, AdjD, Tempo, Barthag), NET ranking, SOS — the spread likely already reflects these
- **Rankings:** AP Poll, Coaches Poll
- **Home Court:** Home/away records, margins, home/away splits
- **Recent Form:** L5 game-by-game scores, margins, L5 statistical trends
- **H2H History:** Previous matchups this season
- **Injuries:** Full injury report with freshness labels
- **Roster Depth:** Top 9 players per team with stats

This is the BASELINE — who these teams are. Your investigation should focus on what's DIFFERENT about THIS game vs the baseline.

### WHAT'S IN THE SPREAD?
The spread prices in more than raw team quality. Records, rankings, home court, conference context, and the SPOT all move lines.

**CAUSAL VS DESCRIPTIVE:**
- Records, rankings, and streaks DESCRIBE — they tell you what happened. They explain why the line is set where it is. But "9-8" can't tell you which side of tonight's spread is the better bet.
- Stats that measure HOW a team plays EXPLAIN — they reveal what's causing the results and how each team's strengths match up against the opponent's weaknesses.
- The SPOT — venue, schedule, conference dynamics, emotional context — creates variance that shapes how tonight plays out.
- Investigate all three layers: descriptive context (explains the line), causal metrics (explains the matchup), AND situational factors (the spot).

When you cite a record, ranking, or situation — ask: "Is this describing what happened, or explaining what will happen tonight?"

### NCAAB INVESTIGATION TRIGGERS
Watch for these patterns that require deeper investigation:
- **Conference vs Non-Conference**: A team's performance in conference play may differ significantly. Which is more relevant?
- **SOS Filter**: Is either team's record inflated? Refer to the SOS data in your scout report.
- **Conference Rematch**: Second meeting between rivals. Coaching adjustments may shift dynamics.
- **Home Court Factor**: Investigate what the home/away data shows about venue impact for each team, and what that means relative to the spread.
- **Regression Check**: When recent shooting diverges from the season baseline, what does the evidence show about sustainability?

### HOME COURT & VENUE
College home court effects tend to be larger than pro sports. Investigate what the data shows for THIS matchup:
- What does each team's home vs road statistical profile show?
- What does the gap — or lack of one — tell you about the venue factor for this game?
- Is this a conference game? Familiarity can reduce OR amplify the home court effect — investigate which applies.
- Does the road team have evidence of performing well in hostile environments?
- Call NCAAB_VENUE to get the arena name. Cameron Indoor Stadium is different from a neutral-site arena.

**DO NOT CITE HOME/AWAY RECORDS AS EVIDENCE** — Investigate the data behind them.

### DEPTH INVESTIGATION — Bench & Rotation
- Your scout report includes Top 9 players — use this to understand depth
- Does one team rely heavily on 2-3 players while the other has balanced scoring?
- How might foul trouble affect each team differently given their depth?
- If the stars are neutralized, what does each team's supporting cast look like?

**FOR LARGE SPREADS (11+ points):**
Large spreads are about MARGIN, not just winning. Investigate:
- Does the depth comparison for BOTH teams support or undermine this margin?
- In NCAAB, benches are shorter (7-8 players). How does rotation depth affect whether a team can sustain a lead?
- Which team's depth is the bigger factor — can the deeper team pile on, or can the shorter rotation hold on?

### STRENGTH OF SCHEDULE
360+ Division I teams with MASSIVE quality variance — SOS is a critical lens.
- Check BOTH teams' SOS rankings — Is one battle-tested while the other padded stats?
- Look at Quad records — Quad 1 wins are worth more than beating #300 teams
- Conference context — Big Ten #8 faced tougher opponents than mid-major #8
- Recent schedule — Has the team played tough opponents RECENTLY? If most L10 opponents were weak, recent numbers may be inflated

### H2H SWEEP CONTEXT (NCAAB-SPECIFIC)
When a conference rival has been swept this season (0-2), investigate:
- What is the swept team's overall quality (ranking, win rate, AdjEM)?
- Have there been coaching/scheme adjustments since the last meeting? Conference opponents have film and familiarity
- Is your thesis built on structural matchup evidence, or just assuming "they've won twice so they'll win again"?
- Investigate the conditions of each prior meeting — were the margins close or dominant? What's different tonight?

### INJURY INVESTIGATION (NCAAB-SPECIFIC)
The scout report labels each injury with a market-aware duration tag. Use these to guide your investigation depth:

**FRESH (0-10 days) and SHORT-TERM (10-20 days) injuries require full investigation:**
- For each FRESH or SHORT-TERM injury, investigate:
  1. Who is getting the minutes in that player's role since the injury?
  2. What are that replacement player's stats — both in the games since the injury AND their season-long production profile?
  3. How has the team performed in the games without the injured player vs their season average?
  4. What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?
- For each FRESH or SHORT-TERM injury: How long has the market known about this absence? Has the line had time to fully adjust?

**LONG-TERM (20+ days) injuries — market has fully adjusted:**
- The team's current stats already reflect life without this player. Do not treat as new information.
- Only investigate if there is a return date approaching that could change the picture.

**SEASON-LONG injuries — non-factor:**
- Player has not played this season. The team you are evaluating has never included this player. Skip entirely.`;

// ═══════════════════════════════════════════════════════════════════════
// NCAAF INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NCAAF_FACTORS = `## INVESTIGATION CHECKLIST — NCAAF

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. ADVANCED EFFICIENCY
**Tokens:** NCAAF_SP_PLUS_RATINGS, NCAAF_FPI_RATINGS, NCAAF_EPA
- SP+ and FPI ratings capture true team quality adjusted for opponents
- EPA per play — the foundation of efficiency analysis
- Compare offensive and defensive ratings separately

### 2. SUCCESS RATE
**Tokens:** NCAAF_SUCCESS_RATE
- Gaining what you need on each down — the most stable efficiency metric
- Compare offensive and defensive success rates

### 3. TRENCHES
**Tokens:** NCAAF_PASS_EFFICIENCY, NCAAF_RUSH_EFFICIENCY, OL_RANKINGS, DL_RANKINGS, PRESSURE_RATE
- Line play drives everything in college football
- Pass protection vs pass rush matchup
- Run blocking vs run defense matchup

### 4. OFFENSE
**Tokens:** NCAAF_PASSING_OFFENSE, NCAAF_RUSHING_OFFENSE, NCAAF_TOTAL_OFFENSE
- Pass/run balance — is the offense one-dimensional?
- Explosive play capability

### 5. DEFENSE
**Tokens:** NCAAF_DEFENSE
- Yards allowed, points allowed, scoring defense
- FCS opponents inflate stats — conference play numbers are more relevant

### 6. QB SITUATION
**Tokens:** QB_STATS, TOP_PLAYERS
- QB efficiency, decision-making, mobility
- Any change at QB? Transfer portal additions?

### 7. HAVOC & TURNOVERS
**Tokens:** NCAAF_HAVOC, NCAAF_TURNOVER_MARGIN, TURNOVER_LUCK
- Havoc rate (TFLs, PBUs, forced fumbles) — defensive disruption
- Turnover margin vs expected — regression risk?

### 8. EXPLOSIVE PLAYS
**Tokens:** NCAAF_EXPLOSIVE_PLAYS
- Big play frequency — game-changing in college where depth drops off

### 9. RED ZONE
**Tokens:** NCAAF_REDZONE
- Red zone TD% vs FG% — converting drives into 7 vs 3

### 10. RECENT FORM
**Tokens:** RECENT_FORM, SCORING
- 12 regular season games = tiny samples
- FCS opponents inflate recent numbers
- Conference play results vs overall

### 11. CLOSE GAMES
**Tokens:** CLOSE_GAME_RECORD
- One-score game record vs expected — is this team clutch or lucky?

### 12. INJURIES
**Tokens:** INJURIES, TOP_PLAYERS
- Opt-outs, transfers, suspensions, freshmen emerging
- The team playing tonight may be different from a month ago

### 13. HOME FIELD
**Tokens:** HOME_AWAY_SPLITS
- Home field matters significantly in college
- What specific metrics change at home vs road?

### 14. STRENGTH OF SCHEDULE
**Tokens:** NCAAF_STRENGTH_OF_SCHEDULE, NCAAF_CONFERENCE_STRENGTH, NCAAF_VS_POWER_OPPONENTS
- How good are the teams they beat? How bad are the teams they lost to?
- Conference strength affects what the numbers mean

## DEEP INVESTIGATION — NCAAF-SPECIFIC

### BOWL/CFP MOTIVATION — INVESTIGATE, DON'T ASSUME
Motivation narratives are popular but need verification:
- **OPT-OUTS are the real factor:** Which players are sitting? This is concrete, not narrative.
- **Motivation claims need evidence:** What does the recent performance data and personnel decisions show about each team's preparation and engagement?
- **Long layoffs affect everyone:** But some teams use it to heal injuries, others get rusty

**The question:** "What does the data show about each team's motivation and preparation for this game?"

### TALENT GAP INVESTIGATION
In college football, talent differentials are significant between tiers:
- **P4 vs G5:** Investigate SP+ ratings and performance vs Power 4 opponents — does the data show a tier gap?
- **Investigate the matchups:** What does each team bring to this matchup? How do their strengths and weaknesses interact?

**The question:** "What does the SP+/FPI data show about the gap between these teams?"

### THE TEAM ON THE FIELD TODAY
College rosters evolve dramatically through seasons and bowls:
- **Bowl opt-outs are massive:** A team missing 3 starters to the draft is a different team
- **Transfer portal:** Players who entered may not be engaged in bowl prep
- **Injury returns:** A player back from injury for the bowl changes the equation

**The question:** "Am I analyzing the team taking the field today with today's available roster?"

### NCAAF TEAM IDENTITY
- **Offensive identity**: What does the data show about how each team scores?
- **Defensive identity**: What does the data show about how each team stops opponents?
- **Trench identity**: What does the line of scrimmage data show for each team?
- **Talent gap**: What does the efficiency and talent data show about the gap between these teams?
- **Turnover profile**: What does the turnover data reveal — what's driven by repeatable skill vs what's variance?

### NCAAF REGRESSION AWARENESS
- **FCS-inflated stats**: What does the opponent quality look like during recent stretches?
- **Fumble recovery rate far from 50%**: Investigate sustainability
- **Extreme red zone TD%**: Investigate sustainability
- **L5 above season average**: Real improvement or weak schedule?

### H2H — INVESTIGATE THE CONDITIONS
Most NCAAF teams play rarely or never. If you have H2H data:
- **What were the circumstances?** Same venue? Same players available? Different point in the season?
- **Was the result structural or variance?** Did one team expose a real scheme mismatch, or was there a pick-six or special teams fluke?
- **What's DIFFERENT tonight?** Different venue, different injuries, different opt-outs, different form. A team that lost by 20 in Week 3 may be entirely different by December.

H2H tells you what happened under THOSE specific conditions. Investigate whether those conditions apply tonight.`;

// ═══════════════════════════════════════════════════════════════════════
// FACTOR MAPPING (sport key → factor string)
// ═══════════════════════════════════════════════════════════════════════

const FLASH_INVESTIGATION_FACTORS = {
  basketball_nba: NBA_FACTORS,
  NBA: NBA_FACTORS,
  americanfootball_nfl: NFL_FACTORS,
  NFL: NFL_FACTORS,
  icehockey_nhl: NHL_FACTORS,
  NHL: NHL_FACTORS,
  basketball_ncaab: NCAAB_FACTORS,
  NCAAB: NCAAB_FACTORS,
  americanfootball_ncaaf: NCAAF_FACTORS,
  NCAAF: NCAAF_FACTORS,
};

// ═══════════════════════════════════════════════════════════════════════
// INVESTIGATION PROTOCOL (moved from Gary's buildPass1Message)
// ═══════════════════════════════════════════════════════════════════════

function getInvestigationProtocol() {
  return `## INVESTIGATION PROTOCOL

### THE SYMMETRY RULE
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad investigation

### CHECKLIST APPROACH
- Work through the numbered checklist above IN ORDER
- For each factor: call the listed tokens, report findings for both teams, then move to the next
- A thorough investigation typically requires 18-30+ stat calls
- After completing all factors, check your coverage — did you skip any?
- DO NOT claim "Team X is on a hot streak" without verifying WHO is driving it
- DO NOT cite a recent loss as evidence without knowing WHO PLAYED in that game

### INJURY CROSS-CHECK
Read the injury report for each team:
- Which starters or key rotation players are OUT tonight?
- For each absence: How long has the market known? Do the team's recent stats include games without this player?
- Newly out players: investigate how their absence changes the picture vs L5 data
- Long-term absences (10+ games): the current stats already reflect this — don't treat as new information

### TRIGGER INVESTIGATION
The Scout Report may include "INVESTIGATION TRIGGERS" — situations flagged for deeper investigation. For each trigger, call stats to verify whether it matters for THIS game. Do NOT dismiss triggers without checking.`;
}

// ═══════════════════════════════════════════════════════════════════════
// TIMEFRAME INVESTIGATION (moved from Gary's buildSystemPrompt)
// ═══════════════════════════════════════════════════════════════════════

function getTimeframeInvestigation() {
  return `## CHOOSING YOUR TIMEFRAME

Different games call for different lenses. Consider which timeframe matters most for THIS specific game.

- Has the roster changed recently? If yes, recent form may better reflect the current team.
- Is recent form against strong or weak opponents? Context matters.
- Is a metric spiking in L5 vs season? Investigate whether it's a real shift or variance.
- For stable rosters with no major changes, season data may be MORE reliable than a 5-game sample.

You have L5, L10, and season data available. Use whatever timeframe your investigation tells you is most relevant. Do not default to any single timeframe — investigate and decide.`;
}

// ═══════════════════════════════════════════════════════════════════════
// REST/TRAVEL INVESTIGATION (moved from Gary's buildSystemPrompt)
// ═══════════════════════════════════════════════════════════════════════

function getRestTravelInvestigation() {
  return `## REST/TRAVEL & RECENT FORM INVESTIGATION

For recent form: check opponent quality, margins, and who was playing. "4-1 vs tanking teams" ≠ "4-1 vs contenders."

For rest/travel factors: investigate the team's ACTUAL record and performance in similar situations this season, not just the narrative. Check whether the data supports the rest/travel claim for THIS team.`;
}

// ═══════════════════════════════════════════════════════════════════════
// INJURY TIMING AWARENESS (moved from Gary's scout report)
// ═══════════════════════════════════════════════════════════════════════

function getInjuryTimingAwareness() {
  return `## INJURY TIMING & L5 STAT WINDOW

The scout report includes duration tags showing how long each player has been out. Use these to connect injuries to the stat windows you're investigating:

- **5+ games missed**: The team's L5 stats already reflect the roster WITHOUT this player. Those stats ARE the current team — the absence is baked in.
- **0-2 games missed**: L5 stats may still reflect the pre-injury roster. Limited data on how the team performs without this player.
- **Returning from absence**: A player coming back changes the team's composition. Recent stats may not reflect what the team looks like WITH this player back.
- **Questionable/GTD**: Assume they play unless ruled out. Do not build a case around their potential absence.

When reporting injury findings, connect the absence timeline to the stat window: "Player X has been out 12 games — the L5 and L10 data reflects the team without him" or "Player Y was ruled out yesterday — the L5 data still includes games where he played."`;
}

// ═══════════════════════════════════════════════════════════════════════
// NARRATIVE VERIFICATION (moved from Gary's core_principles)
// ═══════════════════════════════════════════════════════════════════════

function getNarrativeVerificationMethodology() {
  return `## VERIFYING NARRATIVE CLAIMS

For narrative-based findings (clutch performance, revenge games, historical dominance, etc.):

**USE fetch_narrative_context TO FIND:**
- Articles about the player/team's historical performance in similar situations
- Analyst commentary on the storyline you're considering
- Verified situational records from sports articles

**IF YOU FIND A SOURCED STAT → REPORT IT WITH CONFIDENCE**
**IF NO SPECIFIC STAT EXISTS → ACKNOWLEDGE THE GAP AND MOVE ON**

Focus on what you CAN verify. Don't fill gaps with tactical speculation.

**DO NOT:**
- Invent statistics that weren't in any source
- Search BDL/structured data for things that don't exist (e.g., "must-win game records" — BDL doesn't have situational splits)
- Claim precise records (8-2, 15-3) without a source
- Make up "how the game will play out" narratives

**THE RULE:** Stick to what your investigation found. If you have the stat, report it confidently. If you don't, move on.`;
}

// ═══════════════════════════════════════════════════════════════════════
// PLAYER-TO-TEAM INVESTIGATION (moved from Gary's core_principles)
// ═══════════════════════════════════════════════════════════════════════

function getPlayerToTeamMethodology() {
  return `## PLAYER-SPECIFIC INVESTIGATION (CONTEXT FOR TEAM PERFORMANCE)

- **Use player stats to EXPLAIN team performance**: If team efficiency changed, player data can show WHO is driving it
- **Investigate role changes**: Usage shifts, returning players, or injuries can explain WHY the team looks different
- **Connect to TEAM outcomes**: Player insights help you understand team performance — the TEAM is what matters for spreads
- If L5/L10 diverges 7+ from season, pull game logs for top usage players — who's driving it?`;
}

// ═══════════════════════════════════════════════════════════════════════
// CROSS-REFERENCE METHODOLOGY
// ═══════════════════════════════════════════════════════════════════════

function getCrossReferenceMethodology() {
  return `## CONNECTING THE DOTS

Your job isn't just to report each factor in isolation — it's to find the connections between them.

- When you find an L5/L10 trend, check if it overlaps with a roster change or injury timeline. A shift that started the same game a key player went down is a CONNECTION, not two separate findings.
- When you see H2H results, verify the personnel match tonight's rosters. A team winning 3 of 4 vs an opponent means less if two of those games were with a different starting lineup.
- When form diverges from season, investigate whether it's schedule-driven or structural. A 5-game winning streak against bottom-10 teams tells a different story than 5 wins against playoff teams.
- If a stat spikes in L5 vs season, check the opponent quality during that stretch. Good numbers against bad teams is different from good numbers against good teams.
- If a player has been out for X games, look at the team's stats during that EXACT window. Don't just say "they're missing Player X" — say "in the 8 games without Player X, their offensive rating dropped from 115.2 to 108.7."
- When you see a travel or rest factor, check the team's actual performance in similar situations this season, not just the narrative.`;
}

// ═══════════════════════════════════════════════════════════════════════
// SPREAD-AWARE INVESTIGATION
// ═══════════════════════════════════════════════════════════════════════

function getSpreadAwareInvestigation(sport, spread) {
  if (!spread && spread !== 0) return '';

  const abs = Math.abs(spread);
  const sportNorm = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();

  // NBA spread context
  if (sportNorm === 'NBA') {
    if (abs >= 8) {
      return `\n## SPREAD CONTEXT: LARGE SPREAD (${abs} points)
Large spreads are about MARGIN, not just winning. Investigate:
- Bench depth and unit efficiency for both teams — can the favorite maintain the margin when starters rest?
- Does the underdog have a pace or style that compresses margins?
- Are these teams playing close games or blowouts recently?`;
    }
    if (abs < 5) {
      return `\n## SPREAD CONTEXT: CLOSE SPREAD (${abs} points)
Close spreads are about WHO WINS as much as margin. Investigate:
- Close-game performance and clutch metrics for both teams
- Late-game execution — who do they go to?
- One-score game record vs expected`;
    }
  }

  // NCAAB spread context
  if (sportNorm === 'NCAAB') {
    if (abs >= 11) {
      return `\n## SPREAD CONTEXT: LARGE SPREAD (${abs} points)
Large college spreads ask "is the gap THIS big?" Investigate:
- Depth and rotation — can the favorite sustain pressure with an 8-man rotation?
- Does the underdog have any factor (tempo, rebounding, FT rate) that compresses margins?
- Is this a conference game where familiarity compresses margins?`;
    }
    if (abs < 5) {
      return `\n## SPREAD CONTEXT: CLOSE SPREAD (${abs} points)
Close college spreads — investigate:
- Home court factor — is it fully captured in this spread?
- Experience in close games — veteran teams vs young teams
- Foul shooting — games decided by FTs at the end`;
    }
  }

  // NHL spread context (always ML-focused)
  if (sportNorm === 'NHL') {
    return `\n## SPREAD CONTEXT: NHL MONEYLINE
Moneyline includes OT/SO. Investigate:
- Regulation win% for both teams — how often does each team WIN in regulation vs go to OT?
- Goalie matchup quality — the single biggest factor in NHL betting
- One-goal game record and OT record`;
  }

  return '';
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT: getFlashInvestigationPrompt
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get the full Flash investigation prompt for a given sport and spread.
 *
 * @param {string} sport - Sport key (e.g., 'basketball_nba', 'NBA')
 * @param {number|null} spread - The game spread (for spread-aware investigation)
 * @returns {string} - Full investigation methodology prompt
 */
export function getFlashInvestigationPrompt(sport, spread = null) {
  const factors = FLASH_INVESTIGATION_FACTORS[sport] || FLASH_INVESTIGATION_FACTORS.NBA;
  const protocol = getInvestigationProtocol();
  const timeframe = getTimeframeInvestigation();
  const restTravel = getRestTravelInvestigation();
  const injuryTiming = getInjuryTimingAwareness();
  const narrative = getNarrativeVerificationMethodology();
  const playerTeam = getPlayerToTeamMethodology();
  const crossRef = getCrossReferenceMethodology();
  const spreadContext = getSpreadAwareInvestigation(sport, spread);
  return `${factors}

${protocol}

${timeframe}

${restTravel}

${injuryTiming}

${narrative}

${playerTeam}

${crossRef}
${spreadContext}`;
}
