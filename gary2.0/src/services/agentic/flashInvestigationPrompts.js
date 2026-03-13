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
- Compare the gaps across all four factors. Are any gaps consistent across the season or only recent (L5 divergence)?
- If eFG% diverges from season in L5, check whether it's volume change (more 3PA) or percentage change — and what does the historical variance look like

### 4. FOUR FACTORS (DEFENSE)
**Tokens:** OPP_EFG_PCT, OPP_TOV_RATE, OPP_FT_RATE, DREB_RATE
- Compare defensive four factors for both teams
- Compare each team's offensive profile to the opponent's defensive profile. Where do they align or diverge?

### 5. SHOOTING PROFILE
**Tokens:** THREE_PT_SHOOTING, PAINT_SCORING, THREE_PT_DEFENSE, PAINT_DEFENSE, PERIMETER_DEFENSE, TRANSITION_DEFENSE
- How does each team score? 3PT-dependent or paint-attack?
- Compare each team's offensive shooting zones to the opponent's defensive profile in those zones
- If a team's L5 3P% is 5%+ above season, note the gap and check what the historical variance and opponent 3P defense look like

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

**PRICED IN, LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
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
- Close game record vs expected record — investigate what variance factors explain any gap
- Home/away efficiency splits — what SPECIFIC metric changes?

## DEEP INVESTIGATION — NBA-SPECIFIC

### PROCESS METRICS
Investigate the process behind each team's results — shooting efficiency, ball security, second chances, and free throw generation.
- What process gaps exist between these two teams?
- How do each team's strengths and weaknesses interact in this matchup?
- Does the matchup amplify or neutralize any of these gaps?

### QUESTIONABLE / GTD / DOUBTFUL PLAYERS INVESTIGATION
When a key player is QUESTIONABLE, GTD, or DOUBTFUL:
- **Check their GP stat:** Compare to team games played. A player with 35 GP when the team has played 55 games has missed 20 games — this is an on-and-off pattern, not a fresh disruption.
- **On-and-off pattern:** If the player frequently misses games, investigate the team's performance WITH vs WITHOUT them.
- **Fresh GTD after extended absence:** This could signal a RETURN. Investigate the team's data without this player and what adding them back would mean. Expect potential minutes restriction.
- **DOUBTFUL players:** Likely absent — investigate how the team has performed without them.

### GAME CONTEXT
- **Margin check**: Do these teams' styles produce close games or wide margins? What does the Net Rating gap and pace matchup tell you about the types of games these teams typically produce?
- **Injury timing**: How long has each player been out? What do the team's stats look like during the absence?

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
- Which of this team's strengths are consistent across the season vs which show high variance?

### SPREAD AWARENESS
Report your findings factually. Gary will evaluate which factors matter for this number.

### YOUR SCOUT REPORT IS YOUR BASELINE
The scout report provides a starting point — advanced metrics, standings, recent form, H2H history, injuries, and roster depth. This is the BASELINE of who these teams are. You are free to re-fetch any stat for deeper investigation. Your investigation should focus on what's DIFFERENT about THIS game vs the baseline.

### NBA INVESTIGATION TRIGGERS
Watch for these patterns that require deeper investigation:
- **Schedule Spot**: Back-to-backs, road trips, rest advantages — what does the data show about each team's performance in similar schedule spots this season?
- **Revenge / Rematch**: NBA teams play 3-4 times per season. What changed since the last meeting — roster health, form, lineup adjustments?
- **Home Court Factor**: Investigate what the home/away data reveals about venue impact for each team.
- **Regression Check**: When L5/L10 shooting or efficiency diverges from the season baseline, what does the historical variance and sample size show?`;

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
- How does each team's pass rush compare to the opponent's pass protection?
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
- Turnover margin vs expected — investigate what drives any gap
- Fumble variance (fumbles lost vs fumbles forced)

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
- Team variance and consistency patterns
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

### SPECIFIC MATCHUP INVESTIGATION
Examine specific unit-vs-unit matchups where there's a clear capability gap.

**When to explore:**
- One team has an elite unit facing a compromised unit
- A key player is returning/missing that changes how the team operates
- The styles of play create a specific clash point

**The question:** "Are there specific unit-vs-unit matchups with notable capability differences?"

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
- Which of this team's strengths are built on consistent factors vs which show high variance?
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
- Corsi% and xGF% measure different aspects of possession
- High-danger chance differential measures quality scoring chances
- Compare 5v5 possession metrics for both teams

### 2. GOALTENDING
**Tokens:** GOALIE_STATS, SAVE_PCT, GOALS_AGAINST_AVG, GOALIE_MATCHUP, NHL_GSAX, NHL_GOALIE_RECENT_FORM, NHL_HIGH_DANGER_SV_PCT
- Who starts tonight? Compare season save% vs L10 save%.
- GSAx (Goals Saved Above Expected)
- High-danger save% — performance on tough shots
- A streak with one goalie doesn't transfer to a different goalie

### 3. SPECIAL TEAMS
**Tokens:** POWER_PLAY_PCT, PENALTY_KILL_PCT, SPECIAL_TEAMS, PP_OPPORTUNITIES
- PP% vs PK% matchup — how do the PP% and PK% compare in this matchup?
- PP opportunity volume matters — a team that draws penalties vs one that doesn't

### 4. SCORING
**Tokens:** GOALS_FOR, GOALS_AGAINST, GOAL_DIFFERENTIAL
- Goal differential is a baseline. Scoring first affects game script
- Compare 5v5 goal rates to overall — does special teams inflate the numbers?

### 5. SHOT VOLUME
**Tokens:** SHOTS_FOR, SHOTS_AGAINST, SHOT_METRICS
- Shot volume vs shot quality — which matters more for this matchup?

### 6. VARIANCE & SUSTAINABILITY
**Tokens:** PDO, LUCK_INDICATORS, SHOOTING_REGRESSION, CLOSE_GAME_RECORD, ONE_GOAL_GAMES, OVERTIME_RECORD
- PDO (shooting% + save%) — check where each team's value sits relative to 100
- Shooting% variance — what does the historical rate look like vs current?
- One-goal game record — investigate what's driving it

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

**PRICED IN, LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
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
- For each H2H meeting this season: who started in net? What were the scores? Were they close games or blowouts?
- What drove the results in previous meetings — goaltending, special teams, puck luck, or process?
- Have conditions changed since previous meetings (different goalie, roster changes, schedule context)?
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
Hockey outcomes are shaped by goaltending, possession, and special teams — no single factor consistently dominates.
- **Possession and shot quality**: What do the 5v5 metrics reveal about territorial control and chance quality?
- **Special teams**: What does PP% and PK% show? How do they interact in this matchup?
- **Goaltending matchup**: Who is starting? What does recent form reveal vs season baseline?
- **Schedule and fatigue**: Rest situation, B2B, compressed schedule? Who's in net on the second night?
- **Game structure**: Faceoff%, shot volume, close-game data — what does the process look like?

### H2H SWEEP CONTEXT
NHL division rivals play 3-4 times per year. When you see a 3-0 or 4-0 sweep developing, investigate:
- **Opponent quality**: Is the swept team actually an elite-tier team?
- **Division rival?**: Division games carry extra weight and motivation
- **Goaltending matchup**: Is tonight's starter the same as previous games? Compare each goalie's recent save% vs season save%.
- **How did the sweep happen?**: Close games (1-goal margins) or blowouts?
- **Line adjustments**: Have coaches shuffled lines after previous meetings?
- **Playoff seeding**: Are there playoff seeding implications for either team?
- Use points percentage (not win%) — NHL uses points (OT losses = 1 point)

**The question:** "What does the current data tell me about THIS game — regardless of H2H record? Investigate whether the conditions from previous meetings still apply tonight."

### POSSESSION & PDO DEEP INVESTIGATION
Does THIS team's underlying possession data tell a different story than their record? What's driving any gap?

**PDO Investigation:**
- Investigate each team's PDO — what does it show about the components driving their results (shooting% and save%)?
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
What's driving this streak — possession, goaltending, special teams, shooting variance, schedule, or some combination? What does the underlying data show?

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
- Report actual stat values (AdjOE 117.5, AdjDE 98.2) — not ranking ordinals (64th, 103rd). If you include a ranking, always pair it with the actual value.
- L5 efficiency vs season — has something changed? Conference schedule vs non-conference?
- Compare efficiency with and without key players

### 2. FOUR FACTORS
**Tokens:** NCAAB_FOUR_FACTORS, NCAAB_EFG_PCT, NCAAB_TS_PCT, TURNOVER_RATE, OREB_RATE, FT_RATE
- Compare eFG%, TOV%, ORB%, FT Rate for BOTH teams
- Compare the gaps across all four factors. Are any gaps consistent or recent?
- Tournament opponent quality vs season-long opponents — are the four factors built against comparable competition?

### 3. SCORING & SHOOTING
**Tokens:** SCORING, FG_PCT, THREE_PT_SHOOTING
- Scoring distribution — 3PT-dependent or paint-attack?
- 3PT shooting against tournament-caliber opponents vs overall
- Home vs road shooting splits

### 4. DEFENSIVE STATS
**Tokens:** REBOUNDS, STEALS, BLOCKS
- Rebounding differential — what does each team's rebounding rate look like on both ends?
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
- Recent form against quality opponents vs overall — opponent quality matters
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
- Report the rest situation factually — double-byes, back-to-backs, games played in the last week
- Conference tournament rest differentials are the most visible scheduling factor in college basketball — the market prices them aggressively and the spread already reflects any rest advantage
- The market treats rest as a positive — but rest can also mean rust
- For teams that played yesterday: how did the last game go? Was it close, overtime, or a blowout? How many minutes did key players log?
- For teams on a bye: how many days since their last competitive game?

### 10. TOURNAMENT RUN & STORYLINES
**Tokens:** GROUNDING_SEARCH
- Use a grounding search to find each team's tournament run so far — results, margins, key performances, and how they got to this round
- Report the current storylines and narratives surrounding each team entering this game — momentum, upsets, breakout players, coaching storylines, bracket position
- This is context Gary cannot get from season-long stats — tournament-specific momentum and narrative are real factors in how the public is betting and how the line is set

### 11. NEUTRAL SITE & VENUE
**Tokens:** NCAAB_VENUE, GROUNDING_SEARCH
- Tournament games are on neutral courts — home court advantage is removed
- Use a grounding search to investigate the venue — arena details, location, regional proximity to either team, whether the crowd is expected to favor one side
- Investigate each team's tournament history — how have they performed in past tournaments? What round did they reach? How does their program historically handle tournament pressure?
- What are analysts, media, and the public saying about each team and this matchup heading into tonight?

### 12. HEAD-TO-HEAD
**Tokens:** H2H_HISTORY
- Tournament opponents often have limited or no H2H history
- If a previous meeting exists, were conditions similar? Same roster health?

### 13. ASSISTS & PLAYMAKING
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

### SPREAD AWARENESS
Report your findings factually. Gary will evaluate which factors matter for this number.

### NCAAB TOURNAMENT INVESTIGATION TRIGGERS
Watch for these patterns that require deeper investigation:
- **SOS Filter**: Strength of schedule varies enormously across 360+ Division I teams. A team's record built against weaker competition may not translate to this tournament opponent. Refer to the SOS data in your scout report.
- **Seeding Context**: Seeds are assigned by the selection committee based primarily on conference, strength of schedule, and season-long metrics. Seeds are a positioning tool — they are not predictions of tournament performance and spreads are not set based on seeding.
- **Upset Market**: The public actively tries to pick upsets during the tournament. This moves lines — sometimes putting so much action on a lower seed that the line shifts to even or favors the "underdog." The team the public treats as the upset special is sometimes the public side.
- **Tournament Experience**: Coaches and players who have been in the tournament before handle the intensity, preparation, and pressure differently. First-time tournament teams and first-time coaches face an environment that regular season and conference tournament games do not replicate.
- **Regression Check**: When recent shooting diverges from the season baseline, tournament intensity and unfamiliar opponents can amplify or suppress that divergence. Sample size from the tournament itself is small — season-long baselines are the more reliable foundation.

### NEUTRAL SITE & VENUE
Tournament games are played on neutral courts — home court advantage is removed from the equation. Investigate what the data shows for THIS matchup:
- Road and neutral-site performance data is more relevant than home splits for tournament games
- Some "neutral" sites are geographically closer to one team — regional proximity can create a de facto home crowd
- Investigate each team's performance away from their home court — how do they play when the home crowd is not a factor?
- Call NCAAB_VENUE to confirm the arena and location

**Road and neutral-site stats are the relevant lens for tournament evaluation.**

### DEPTH INVESTIGATION — Bench & Rotation
- Your scout report includes Top 9 players — use this to understand depth
- Does one team rely heavily on 2-3 players while the other has balanced scoring?
- How might foul trouble affect each team differently given their depth?
- If the stars are neutralized, what does each team's supporting cast look like?

**FOR LARGE SPREADS (10+ points):**
Investigate depth for BOTH teams — in NCAAB, benches are shorter (7-8 players). What does the minutes distribution look like?

### STRENGTH OF SCHEDULE
360+ Division I teams with massive quality variance — SOS is a critical lens for tournament evaluation.
- Check BOTH teams' SOS rankings — a team battle-tested in a power conference faced different opposition than a mid-major with a weaker schedule
- Look at Quad records — Quad 1 wins carry more weight than volume wins against lower-tier opponents
- Conference context — the gap between conferences is real, and tournament matchups regularly pit teams from different competitive environments against each other
- The selection committee already used SOS for seeding — investigate whether the matchup data tells a different story than the seed line suggests

### H2H CONTEXT (NCAAB TOURNAMENT)
Tournament opponents often have limited or no head-to-head history:
- If these teams met earlier this season, were conditions similar? Same roster health, same venue type?
- Cross-conference matchups in the tournament mean most opponents have never played each other — the H2H token may return nothing, and that is expected
- If a previous meeting exists, the result is already in the public's perception and in the line

### INJURY INVESTIGATION (NCAAB-SPECIFIC)
The scout report labels each injury with a market-aware duration tag. Use these to guide your investigation depth:

**FRESH (0-10 days) and SHORT-TERM (10-20 days) injuries require full investigation:**
- For each FRESH or SHORT-TERM injury, investigate:
  1. Who is getting the minutes in that player's role since the injury?
  2. What are that replacement player's stats — both in the games since the injury AND their season-long production profile?
  3. How has the team performed in the games without the injured player vs their season average?
  4. What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?

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
- Line play is fundamental in college football
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
- One-score game record vs expected — investigate what drives the gap

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
- **Was the result structural or variance?** Did the result reflect a scheme mismatch, or was it driven by high-variance plays?
- **What's DIFFERENT tonight?** Different venue, different injuries, different opt-outs, different form. A team that lost by 20 in Week 3 may be entirely different by December.

H2H tells you what happened under THOSE specific conditions. Investigate whether those conditions apply tonight.`;

// ═══════════════════════════════════════════════════════════════════════
// FACTOR MAPPING (sport key → factor string)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// MLB/WBC INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const MLB_FACTORS = `## INVESTIGATION CHECKLIST — MLB/WBC

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

### 1. STARTING PITCHER MATCHUP
**Tokens:** MLB_STARTING_PITCHERS, TOP_PLAYERS
- Who is starting for each team? What are their MLB career stats (ERA, WHIP, K/9, W-L)?
- How do they match up against the opposing lineup's handedness and power profile?
- Any recent performance data or pitch count concerns?

### 2. BULLPEN DEPTH & AVAILABILITY
**Tokens:** MLB_BULLPEN
- Who pitched in the last 1-2 games? What was their workload?
- Which relievers are available and which are likely unavailable?
- Any elite closers or setup men that shift late-game leverage?

### 3. KEY HITTERS & LINEUP
**Tokens:** MLB_KEY_HITTERS, MLB_LINEUP
- Who are the top 3-4 hitters in each lineup? What are their career MLB stats?
- Are there platoon advantages (LHB vs RHP or vice versa)?
- Any confirmed batting orders or notable lineup changes?

### 4. WBC TOURNAMENT RESULTS
**Tokens:** RECENT_FORM, MLB_WBC_RESULTS, STANDINGS
- What are each team's WBC results so far in this tournament?
- Pool standings — what's at stake? Must-win? Already clinched?
- Any momentum or form from earlier WBC games?

### 5. HEAD-TO-HEAD & HISTORY
**Tokens:** H2H_HISTORY
- Have these countries played each other in previous WBCs?
- Any historical pattern (one country dominating the other)?

### 6. REST & SCHEDULE
**Tokens:** REST_SITUATION
- How many days since each team's last game?
- Did either team play a high-stress game (extra innings, long bullpen usage) recently?

### 7. VENUE & CONDITIONS
- Is this game indoor (Tokyo Dome) or outdoor (Miami, Houston)?
- Weather conditions for outdoor venues — wind, temperature, humidity
- Park factor context — how does this venue play?

### 8. INJURIES & ROSTER UPDATES
**Tokens:** INJURIES
- Any scratches, day-to-day concerns, or last-minute roster changes?
- Any players pulled from previous WBC games with undisclosed issues?

### 9. ODDS & PUBLIC PERCEPTION
**Tokens:** MLB_ODDS
- What are the current moneyline odds? Is one side getting heavy public action?
- Is the line moving? In which direction and why?`;

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
  baseball_mlb: MLB_FACTORS,
  MLB: MLB_FACTORS,
  WBC: MLB_FACTORS,
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
- Verified factual updates (injury status, roster moves, schedule context, confirmed quotes, suspension/coaching news)
- Historical game facts (results, margins, opponent names, venue context)
- Verifiable situational records from sourced reporting

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
// GROUNDING FACT-ONLY RULES (FLASH SEARCH SCOPE)
// ═══════════════════════════════════════════════════════════════════════

function getGroundingFactOnlyRules() {
  return `## GROUNDING SEARCH RULES (FACTS ONLY)

When using fetch_narrative_context, use factual information only.

[YES] ALLOWED:
- Injury status and availability updates (OUT/QUESTIONABLE/RETURNED)
- Weather conditions, travel/logistics, schedule/venue details
- Roster transactions and team news (trades, waives, suspensions, coaching changes)
- Historical game facts (scores, results, margins, opponent names)

[NO] PROHIBITED:
- Betting picks, expert bets, tipster recommendations
- Outcome predictions or opinion takes ("Team X will win", "lock", "best bet")
- Market microstructure claims (sharp/public reports, line-move narratives) unless concrete support exists in provided data

If a source mixes facts and opinions, keep only the factual parts and discard the rest.`;
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
// OBSERVABLE SPREAD DRIVERS (ALL SPORTS)
// ═══════════════════════════════════════════════════════════════════════

function getObservableSpreadDriversMethodology() {
  return `## OBSERVABLE SPREAD DRIVERS (FACTUAL AWARENESS)

These are practical drivers that can influence where a spread/price is set. Report facts and evidence only.

- **Schedule load:** Back-to-backs, 3-in-5, travel burden, timezone shifts, altitude, and tip/starting-time context.
- **Injury timing:** Fresh absences can add uncertainty; long-running absences are often reflected in team baseline performance.
- **Recency anchoring:** Recent blowout wins/losses and visible streaks can affect perception.
- **Opponent-quality adjusted form:** Recent results are more informative when adjusted for who those games were against and who played.
- **Standings/reputation pressure:** Rankings, brand/team reputation, and season record can shape perception.
- **Home-court / venue narratives:** Senior night, revenge context, must-win framing, and crowd/venue effects can influence price.
- **Matchup mechanics:** Pace control, shot profile clashes, turnover/rebounding interactions, and style fit can alter expected game shape.
- **Rotation depth/stability:** Bench depth and role continuity can change how outcomes scale over full game minutes.

When you discuss these drivers:
- Use concrete evidence from this game context (numbers, named opponents, roster/timeline details).
- Avoid market microstructure claims unless directly supported by provided data.
- Keep findings factual; do not make pick directives.`;
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
At this spread size, the question is which side of the spread is the better bet at this number tonight. Large spreads can be inflated by recent blowouts, injuries, streaks, and public perception. Investigate:
- Bench depth and unit efficiency for both teams
- Pace and style matchup — what do scoring patterns look like?
- Are recent results (blowouts, streaks) driving this number beyond what the matchup data supports?`;
    }
    if (abs < 4) {
      return `\n## SPREAD CONTEXT: CLOSE SPREAD (${abs} points)
At this spread size, covering the spread and winning are nearly the same thing. The question is which side is the better value at this number. Investigate:
- Close-game performance for both teams
- How each team performs in one-possession games
- Whether the number reflects the actual matchup or narrative factors`;
    }
  }

  // NCAAB spread context
  if (sportNorm === 'NCAAB') {
    if (abs >= 11) {
      return `\n## SPREAD CONTEXT: LARGE SPREAD (${abs} points)
Large college spreads ask whether the gap is really THIS big at this number. Investigate:
- Depth and rotation — what does the minutes distribution look like for both teams?
- Tempo, rebounding, and FT rate matchup
- Is this a conference rematch? What was the box score last time and how familiar are these two teams with each other?`;
    }
    if (abs < 5) {
      return `\n## SPREAD CONTEXT: CLOSE SPREAD (${abs} points)
At this spread size, which side is the better value at this number? Investigate:
- Home court data — what do the home/road splits show for each team?
- Experience in close games — veteran teams vs young teams
- Free throw shooting and late-game execution`;
    }
  }

  // NHL: ML or Puck Line
  if (sportNorm === 'NHL') {
    return `\n## LINE CONTEXT: NHL MONEYLINE / PUCK LINE
Moneyline includes OT/SO. Puck line (-1.5/+1.5) requires the favorite to win by 2+ goals (regulation + OT only, no shootout).
Both bet types are available — investigate the matchup to understand which side and which bet type fit the data.`;
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
  const groundingRules = getGroundingFactOnlyRules();
  const playerTeam = getPlayerToTeamMethodology();
  const crossRef = getCrossReferenceMethodology();
  const spreadDrivers = getObservableSpreadDriversMethodology();
  const spreadContext = getSpreadAwareInvestigation(sport, spread);
  return `${factors}

${protocol}

${timeframe}

${restTravel}

${injuryTiming}

${narrative}

${groundingRules}

${playerTeam}

${crossRef}

${spreadDrivers}
${spreadContext}`;
}
