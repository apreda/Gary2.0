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

For any factor, you have access to both season-long stats AND recent team stats (fetch_team_recent_stats with num_games 1, 3, or 5). You can use these alongside the season tokens listed per factor whenever comparing recent performance to the season baseline would be useful.

### 1. EFFICIENCY
**Tokens:** NET_RATING, OFFENSIVE_RATING, DEFENSIVE_RATING, EFFICIENCY_LAST_10, EFFICIENCY_TREND
- Pull offensive and defensive efficiency ratings for both teams — season and recent
- Investigate each team's offensive and defensive ratings separately
- Compare season efficiency to recent (L5) efficiency — investigate any shifts
- Report findings for both teams

### 2. PACE & TEMPO
**Tokens:** PACE, PACE_LAST_10, PACE_HOME_AWAY
- Pull pace and tempo stats for both teams — season and recent
- Investigate each team's pace and whether it has changed recently
- Pull home/away pace splits for both teams
- Report findings for both teams

### 3. FOUR FACTORS (OFFENSE)
**Tokens:** EFG_PCT, TURNOVER_RATE, OREB_RATE, FT_RATE
- Pull all four offensive factors for both teams — season and recent
- Investigate each factor individually for both teams
- Report findings for both teams

### 4. FOUR FACTORS (DEFENSE)
**Tokens:** OPP_EFG_PCT, OPP_TOV_RATE, OPP_FT_RATE, DREB_RATE
- Pull all four defensive factors for both teams
- Investigate each team's defensive stats and what opponents do against them
- Report findings for both teams

### 5. SHOOTING PROFILE
**Tokens:** THREE_PT_SHOOTING, PAINT_SCORING, THREE_PT_DEFENSE, PAINT_DEFENSE, PERIMETER_DEFENSE, TRANSITION_DEFENSE. Also use fetch_player_game_logs.
- Pull offensive shooting stats for both teams — 3PT, paint scoring, mid-range
- Pull defensive shooting stats for both teams — what they allow from 3PT, paint, transition
- Investigate recent shooting data and compare to season for both teams
- Pull individual player shooting stats — compare each key player's season shooting percentages to their recent output to see if the team or specific players are in a slump or a hot streak
- Report findings for both teams

### 6. RECENT FORM & GAME CONTEXT
**Tokens:** RECENT_FORM, QUARTER_SCORING. Also use fetch_player_game_logs and fetch_team_recent_stats.
- Pull L1 (last game), L3, and L5 team stats for both teams and compare to season baseline
- Pull game logs for the top players on each team to see their recent individual production
- Investigate who was playing during the recent stretch — is the roster the same as tonight?
- Investigate the opponents faced and the margins in the recent stretch
- Investigate each team's consistency across the season — pull game results and margins for both teams to see how each team has performed against different levels of competition. In the NBA, roster availability changes night to night so also investigate how each team's performance has varied with different lineup combinations and during different stretches of the schedule. Also investigate if recent form (L5, L3, L1) shows a change from those season-long patterns.
- Compare each key player's season stats to their recent game logs — investigate if any players are performing above or below their season baseline
- Report findings for both teams

### 7. INJURIES & ROSTER
**Tokens:** INJURIES, TOP_PLAYERS, USAGE_RATES, MINUTES_TREND, BENCH_DEPTH
**Also use:** fetch_depth_chart, fetch_player_game_logs, fetch_team_recent_stats

- Report the injury status for both teams
- For FRESH and SHORT-TERM injuries: use fetch_depth_chart to see the replacement, pull game logs for the replacement player(s), pull fetch_team_recent_stats to see how the team played without the injured player, and pull usage stats to see how production shifted
- Investigate the other key players still on the floor and how production is distributed across the roster
- For PRICED IN, LONG-TERM, and SEASON-LONG injuries: the team's current stats already reflect life without this player — do not treat as new information
- If you cite an injury, you MUST include when it happened (date or "since last game" / "since [specific game]"). If you cannot determine when an injury occurred, do not include it in your findings
- Report findings for both teams

### 8. HEAD-TO-HEAD
**Tokens:** H2H_HISTORY, VS_ELITE_TEAMS
- Pull any H2H history between these teams
- Report findings if data exists

### 10. CLOSE GAMES & VARIANCE
**Tokens:** CLUTCH_STATS, LUCK_ADJUSTED, HOME_AWAY_SPLITS
- Pull clutch stats, luck-adjusted data, and home/away splits for both teams
- Report findings for both teams

## DEEP INVESTIGATION — NBA-SPECIFIC

### GAME CONTEXT
- Pull margin data for both teams — what do the game-by-game margins look like recently?
- Pull injury timing data — how long has each injured player been out and what do the team's stats look like during the absence?
- Report findings for both teams

### LARGE SPREAD INVESTIGATION (10+ POINT SPREADS)
When tonight's spread is 10+ points, investigate these additional dimensions:
- Pull margin distribution data for both teams — L10 game-by-game margins
- Pull bench depth and bench production stats for both teams
- Pull quarter scoring data (QUARTER_SCORING) for both teams
- Report findings for both teams

### TEAM IDENTITY
- Pull scoring profile, turnover, pace, and depth stats for both teams
- Report findings for both teams on how each team generates offense, protects the ball, and uses its roster

### RETURNING PLAYERS
When a key player is listed as GTD or Questionable after missing time:
- Check their GP stat relative to team games played to understand the pattern
- Pull the team's stats with and without this player if data is available
- Report findings

### REGRESSION & TREND DETECTION
When recent stats diverge from season baseline:
- Pull the specific stats that are diverging and the context behind the divergence (opponent quality, roster changes, shooting variance)
- Report findings for both teams

### PROCESS METRICS
- Pull shooting efficiency, ball security, second-chance points, and free throw generation data for both teams
- Report findings for both teams

### HOME/AWAY PERFORMANCE
- Pull home/away performance splits for both teams — report the specific stats, not just the records
- Report findings for both teams

### SCHEDULE & REMATCH CONTEXT
- If these teams have played earlier this season, pull data on what changed since the last meeting — roster health, form, lineup changes
- Report findings if applicable

### SPREAD AWARENESS
Report your findings factually. Gary will evaluate which factors matter for this matchup and spread number.

### PLAYOFF SERIES CONTEXT
**Only investigate this section if the scout report's tournamentContext indicates "NBA Playoffs".**
- Pull the current series state: which team leads, the series record (e.g., 2-1), and which game this is (Game 1-7)
- Pull the score and margin of each prior game already played in this series
- Pull rotation/minute distribution from prior games in the series — did any player's role change between games?
- Pull which venue hosted each prior game (home/road for each team)
- Pull each key player's production across the games already played in this series
- Compare series-specific stats to each team's season baseline
- Report findings factually for both teams

### YOUR SCOUT REPORT IS YOUR BASELINE
The scout report provides the starting point. You are free to re-fetch any stat for deeper investigation.`;

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

### 12. STANDINGS & DIVISION
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

For any factor, you have access to season-long stats AND recent form data (RECENT_FORM provides L5/L10 with opponent quality). You also have fetch_player_game_logs for individual player recent production. Use these alongside the season tokens whenever comparing recent performance to the season baseline would be useful.

### 1. POSSESSION & SHOT QUALITY
**Tokens:** CORSI_FOR_PCT, EXPECTED_GOALS, SHOT_DIFFERENTIAL, HIGH_DANGER_CHANCES, SHOTS_FOR, SHOTS_AGAINST
- Pull 5v5 Corsi%, xGF%, shot differential, and high-danger chance share for both teams — season and recent
- Investigate each team's possession and shot quality data separately
- Compare season possession metrics to recent — investigate any shifts
- Compare shot volume and shot quality separately — how does each team generate and suppress chances?
- Report findings for both teams

### 2. GOALTENDING
**Tokens:** GOALIE_STATS, SAVE_PCT, GOALS_AGAINST_AVG, GOALIE_MATCHUP, NHL_GSAX, NHL_GOALIE_RECENT_FORM, NHL_HIGH_DANGER_SV_PCT
- Pull the confirmed starter for both teams — season save%, L5/L10 save%, GSAx, and high-danger save%
- Compare both starters' season baseline to their recent form
- Investigate whether each team's recent results were with tonight's confirmed starter or a different goaltender
- Report findings for both teams

### 3. SPECIAL TEAMS
**Tokens:** POWER_PLAY_PCT, PENALTY_KILL_PCT, SPECIAL_TEAMS
- Pull PP% and PK% for both teams — investigate how each team's power play matches against the opponent's penalty kill
- Pull penalty drawn/taken rates if available — investigate whether either team generates disproportionate PP opportunities
- Report findings for both teams

### 4. SCORING & GOAL DATA
**Tokens:** GOALS_FOR, GOALS_AGAINST, GOAL_DIFFERENTIAL
- Pull goals for, goals against, and goal differential for both teams — season and recent
- Compare 5v5 goal rates to overall rates — investigate whether special teams are inflating or masking the numbers
- Report findings for both teams

### 5. VARIANCE & CLOSE GAMES
**Tokens:** PDO, LUCK_INDICATORS, CLOSE_GAME_RECORD, ONE_GOAL_GAMES, OVERTIME_RECORD, REGULATION_WIN_PCT
- Pull PDO for both teams — investigate the shooting% and save% components separately
- Pull close-game record, one-goal game record, overtime record, and regulation win% for both teams
- Compare regulation win% to overall win% — investigate any gap
- Report findings for both teams

### 6. RECENT FORM & GAME CONTEXT
**Tokens:** RECENT_FORM, HOT_PLAYERS. Also use fetch_player_game_logs.
- Pull L5 and L10 results for both teams and compare to season baseline
- Investigate who was in net during the recent stretch — is it the same goaltender starting tonight?
- Investigate the opponents faced and the margins during the recent stretch — were recent games against strong or weak opponents?
- Pull game logs for key players on each team to see their recent individual production
- Compare each key player's season stats to their recent game logs — investigate if any players are performing above or below their season baseline
- Investigate each team's consistency across the season — pull game results and margins for both teams to see how each team has performed against different levels of competition. In the NHL, goaltender rotation and injury availability change game to game, so also investigate how each team's performance has varied with different goaltenders and during different stretches of the schedule. Also investigate if recent form (L5, L10) shows a change from those season-long patterns.
- Report findings for both teams

### 7. KEY PLAYERS, LINES & DEPTH
**Tokens:** TOP_SCORERS, TOP_PLAYERS, LINE_COMBINATIONS
- Pull top-6 forward production and bottom-6 depth scoring for both teams
- Investigate scoring distribution — is production concentrated or balanced?
- Pull defensive pair data and minute distribution
- Report findings for both teams

### 8. INJURIES & ROSTER
**Tokens:** INJURIES
- Report the injury status for both teams
- For FRESH and SHORT-TERM injuries: investigate who is filling the role, pull the replacement's production data (since the injury AND season-long), pull team stats during the absence vs season average, and investigate roster depth behind the injured player
- For LONG-TERM and SEASON-LONG injuries: the team's current stats already reflect life without this player — do not treat as new information
- If you cite an injury, include when it happened. If you cannot determine when, do not include it
- Report findings for both teams

### 9. HOME ICE & SPLITS
**Tokens:** HOME_AWAY_SPLITS
- Pull home/away performance splits for both teams — report specific stats, not just records
- Report findings for both teams

### 10. HEAD-TO-HEAD & DIVISION
**Tokens:** H2H_HISTORY, DIVISION_STANDING, FACEOFF_PCT, POSSESSION_METRICS
- Pull H2H history between these teams this season
- For each meeting: who started in net? What were the scores? Were they close games or blowouts?
- Investigate whether conditions have changed since previous meetings (different goalie, roster changes, schedule context)
- Pull faceoff% data for both teams
- Report findings if data exists

### 11. STANDINGS & PLAYOFF CONTEXT
**Tokens:** STANDINGS, POINTS_PCT, STREAK, PLAYOFF_POSITION
- Pull playoff positioning and points percentage for both teams
- Use points percentage (not win%) — NHL uses points (OT losses = 1 point)
- Report findings for both teams

## DEEP INVESTIGATION — NHL-SPECIFIC

### GAME CONTEXT
- Pull margin data for both teams — what do the game-by-game margins look like recently?
- Pull injury timing data — how long has each injured player been out and what do the team's stats look like during the absence?
- Report findings for both teams

### H2H SWEEP CONTEXT
When these teams have met multiple times this season with a lopsided series:
- Is tonight's starter the same goaltender from previous meetings? Compare each goalie's recent form vs season baseline.
- Were previous meetings decided by 1 goal or blowouts?
- Have conditions changed — roster moves, coaching adjustments, schedule context?
- "What does the current data tell me about THIS game — regardless of H2H record? Investigate whether the conditions from previous meetings still apply tonight."

### PDO & VARIANCE DEEP DIVE
When either team's PDO is notably above or below 100:
- Investigate the components — is it driven by shooting%, save%, or both?
- Is the current starting goaltender the same one who drove the save% component?
- How many games into the current stretch? Has there been any partial correction?
- What does the underlying shot quality (CF%, xG) show regardless of PDO?

### STREAK INVESTIGATION
When either team is on a notable winning or losing streak:
- Investigate the specific factors driving the streak — which combination of roster, goaltending, opponent quality, schedule, and shooting variance?
- Were the opponents during the streak strong or weak?
- Is the same goaltender who drove the streak starting tonight?

### RETURNING PLAYERS
When a key player is listed as GTD or Questionable after missing time:
- Pull the team's stats with and without this player if data is available
- Investigate how the roster structure changes if this player returns
- Report findings

### THE TEAM TAKING THE ICE TONIGHT
- If they've gone 8-4 since losing a key player, that's the team you're analyzing
- For long-term injuries (IR/LTIR): the team's current stats reflect the adjusted roster
- Investigate recent line combinations — how does the current structure compare to earlier in the season?
- "Am I analyzing the team taking the ice tonight, or a version of them from earlier in the season?"

### PLAYOFF SERIES CONTEXT
**Only investigate this section if the scout report's tournamentContext indicates "NHL Playoffs", "Conference Finals", or "Stanley Cup Finals".**
- Pull the current series state: which team leads, the series record (e.g., 2-1), and which game this is (Game 1-7)
- Pull the score and margin of each prior game already played in this series
- Which goaltender started each prior game? Were any pulled mid-game? What was each goalie's line?
- Pull which venue hosted each prior game (home/road for each team)
- Pull possession/xG data from prior games in the series — how did 5v5 play and special-teams usage compare?
- Pull each top-line forward's production across the games already played in this series
- Compare series-specific data to each team's season baseline
- Report findings factually for both teams

### YOUR SCOUT REPORT IS YOUR BASELINE
The scout report provides the starting point. You are free to re-fetch any stat for deeper investigation.
Report your findings factually. Gary will evaluate which factors matter for this matchup.`;

// ═══════════════════════════════════════════════════════════════════════
// NCAAB INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════

const NCAAB_FACTORS = `## INVESTIGATION CHECKLIST — NCAAB

Work through each numbered factor below. Check off each one as you complete it. Do NOT skip any. For each factor, investigate BOTH teams and report findings with specific numbers.

For any factor, you have access to both season-long stats AND recent stats (NCAAB_L1_STATS, NCAAB_L3_STATS, NCAAB_L5_EFFICIENCY). You can use these alongside the season tokens listed per factor whenever comparing recent performance to the season baseline would be useful.

### 1. EFFICIENCY RATINGS
**Tokens:** NCAAB_OFFENSIVE_RATING, NCAAB_DEFENSIVE_RATING, NET_RATING, NCAAB_BARTTORVIK
- Pull offensive and defensive efficiency ratings for both teams — report actual values, not just rankings
- Pull Barttorvik data (T-Rank, AdjEM, AdjO, AdjD) for both teams
- Compare season efficiency to recent efficiency — pull L5 data to see if the ratings have shifted
- Investigate offensive and defensive efficiency separately for each team
- Report findings for both teams

### 2. FOUR FACTORS
**Tokens:** NCAAB_FOUR_FACTORS, NCAAB_EFG_PCT, NCAAB_TS_PCT, TURNOVER_RATE, OREB_RATE, FT_RATE
- Pull all four factors (eFG%, TOV%, ORB%, FT Rate) for both teams
- Investigate each factor individually — pull season and recent data to see if any have shifted
- Investigate each team's free throw shooting volume and percentage
- Report findings for both teams

### 3. SCORING & SHOOTING
**Tokens:** SCORING, FG_PCT, THREE_PT_SHOOTING. Also use fetch_player_game_logs.
- Pull scoring and shooting stats for both teams — FG%, 3P%, scoring volume, points per game
- Investigate where each team generates their points — 3PT volume, paint scoring, free throws
- Pull recent shooting data and compare to season — investigate any divergence
- Pull individual player shooting stats — compare each key player's season shooting percentages to their recent output to see if the team or specific players are in a slump or a hot streak
- Report findings for both teams

### 4. DEFENSIVE STATS
**Tokens:** REBOUNDS, STEALS, BLOCKS
- Pull rebounding stats for both teams — offensive rebounds, defensive rebounds, total rebounding rate
- Pull steals, blocks, and forced turnover data for both teams
- Investigate each team's defensive identity through the stats
- Report findings for both teams

### 5. TEMPO
**Tokens:** NCAAB_TEMPO
- Pull pace and tempo stats for both teams — season and recent
- Investigate each team's tempo and how it has changed recently
- Report findings for both teams

### 6. TEAM PERSONNEL, STYLE & COACHING
**Tokens:** TOP_PLAYERS, NCAAB_BARTTORVIK. Also use fetch_player_game_logs and fetch_narrative_context for coaching.
- Investigate the roster build of each team — what positions are their best players, what are their physical attributes, what are their strengths
- Investigate each team's offensive and defensive identity using the stats
- Pull game logs for the top players on each team to see their recent and season-long production
- Investigate the guard play on each team — who are the primary ball handlers and what do they do
- How deep is each team's rotation? How is production distributed across the roster?
- Investigate the coaching for both teams — use fetch_narrative_context to find each coach's background, tournament history, and how they have prepared for and adjusted against different styles
- Report findings for both teams

### 7. RECENT FORM & CONSISTENCY
**Tokens:** NCAAB_L1_STATS, NCAAB_L3_STATS, NCAAB_L5_EFFICIENCY, RECENT_FORM. Also use fetch_player_game_logs for key players.
- Pull L1 (last game), L3, and L5 team stats for both teams and compare to season baseline
- Pull game logs for the top players on each team to see their recent individual production
- Investigate who was playing during the recent stretch — is the roster the same as tonight?
- Investigate the quality of opponents faced in the recent stretch
- Investigate each team's consistency across a larger sample — pull season game results and margins to see the full picture of how each team has performed throughout the year. Report losses to weaker opponents, close wins against teams they should have beaten comfortably, blowout losses, and any patterns of playing up or down to the level of competition. Also investigate if recent form (L5, L3, L1) shows a change from those season-long patterns.
- Report findings for both teams

### 8. KEY PLAYER PERFORMANCE
**Tokens:** TOP_PLAYERS. Also use fetch_player_game_logs.
- Pull stats and game logs for the top players on each team
- Investigate the experience level and class year of each team's key contributors
- Compare each key player's season stats to their recent game logs — investigate if any players are performing above or below their season baseline and report the specific numbers
- Report findings for both teams

### 9. INJURIES
**Tokens:** INJURIES
- Report the injury status for both teams
- Only report injuries that are NEW — if an injury happened multiple games ago, that player's absence is already reflected in the team's stats
- If you cite an injury, you MUST include when it happened (date or "since last game" / "since [specific game]")
- If you cannot determine when an injury occurred, do not include it in your findings

### 10. HEAD-TO-HEAD
**Tokens:** H2H_HISTORY
- Pull any H2H history between these teams — tournament opponents often have none
- Report findings if data exists

### 12. ASSISTS & PLAYMAKING
**Tokens:** ASSISTS. Also use fetch_player_game_logs for key playmakers.
- Pull assist, turnover, and assist-to-turnover ratio data for both teams
- Investigate how each team distributes the ball — usage concentration and assist rate
- Investigate and identify who leads each team in assists and whether the assist numbers are concentrated in one player or spread across the team
- Pull recent and season assist data for the primary playmakers on each team
- Investigate the offensive and defensive playmakers and their assist profiles
- Report findings for both teams

## DEEP INVESTIGATION — NCAAB-SPECIFIC

### YOUR SCOUT REPORT IS YOUR BASELINE (DO NOT RE-FETCH)
- **Advanced Metrics (season baseline):** Barttorvik (T-Rank, AdjEM, AdjO, AdjD, Tempo, Barthag, WAB) — these are schedule-adjusted
- **Rankings:** AP Poll, Coaches Poll
- **Recent Form:** Last 3 games with scores and opponents
- **H2H History:** Previous matchups this season (often none in tournament)
- **Injuries:** Full injury report with freshness labels
- **Roster Depth:** Top 9 players per team with stats

This is the BASELINE — who these teams are. Your investigation should focus on what's DIFFERENT about THIS game vs the baseline.

### SPREAD AWARENESS
Report your findings factually. Gary will evaluate which factors matter for this number.

### NCAAB TOURNAMENT INVESTIGATION TRIGGERS
Watch for these patterns that require deeper investigation:
- **SOS Filter**: Strength of schedule varies enormously across 360+ Division I teams. A team's stats built against weaker competition may look very different against a tournament opponent from a stronger conference. Use NCAAB_BARTTORVIK data — T-Rank and WAB already account for schedule strength.
- **Conference quality gap**: When a mid-major faces a power conference team, investigate whether the mid-major's stats were inflated by weaker opponents. The adjusted metrics (T-Rank, AdjEM) already account for this — use the actual values, not the raw records.

### NEUTRAL SITE
Tournament games are on neutral courts — home court advantage is removed. Home/away records and splits are irrelevant for tournament evaluation. Do NOT investigate or report home/away records for tournament games.

### DEPTH INVESTIGATION — Bench & Rotation
- Your scout report includes Top 9 players — use this to understand depth and production distribution

### STRENGTH OF SCHEDULE
360+ Division I teams with massive quality variance — schedule strength is critical for tournament evaluation.
- Use NCAAB_BARTTORVIK data: T-Rank, AdjEM, and WAB (Wins Above Bubble) are schedule-adjusted metrics that account for opponent quality. A team's T-Rank already reflects who they played, not just their record.
- Conference context — compare each team's conference (from Barttorvik data) and what that means for the competition level they faced all season
- A mid-major with a high T-Rank earned it against their schedule. A power conference team with a low T-Rank underperformed against theirs.
- The selection committee already used these metrics for seeding

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

// (MLB_FACTORS deleted Jul 26 2026 — the MLB game lane runs pickdesk with no
// research assistant; this file serves the other sports' game walks.)

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
  baseball_mlb: '', // game lane deleted Jul 26 2026 — pickdesk
  MLB: '', // game lane deleted Jul 26 2026 — pickdesk
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
