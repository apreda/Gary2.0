/**
 * NHL Constitution - Sharp Hockey Betting Heuristics
 * 
 * This guides Gary's thinking about NHL matchups.
 * Hockey is a game of possession, special teams, and goaltending.
 * 
 * NOTE: NHL is in BETA mode - uses BDL basic stats + Gemini Grounding for advanced analytics.
 */

export const NHL_CONSTITUTION = `
## NHL SHARP HEURISTICS (BETA - Supplemental Analytics)

Note: NHL picks use Gemini Grounding for advanced stats (Corsi, xG, PDO) in addition to API data.
Confidence levels may be slightly lower than NBA/NFL due to data source differences.

### ACTIVE PLAYER "HOT STREAKS"
Hockey is often driven by a single line or player getting "hot":
- Check [HOT_PLAYERS] section for top performers in the last 14 days.
- A superstar surge (high PPG/Goals) can override a team's mediocre 5v5 metrics.
- Look for players with 1.0+ points per game (PPG) over the last 5 outings.

### HEAD-TO-HEAD (H2H) HISTORY
Familiarity breeds specific matchup advantages:
- Check [H2H_HISTORY] for the last 3-5 meetings.
- Some teams' systems are designed to neutralize specific opponents (Matchup Mastery).
- Use recent scores to identify mental edges or "revenge" spots.

### LEAGUE RANKINGS - THE COMPETITIVE CONTEXT
Numerical stats are better when ranked:
- Check [LEAGUE_RANKS] for PP%, PK%, and Goals For/Against rankings (1-32).
- Example: "#1 PP vs #31 PK" is a massive tactical edge.
- Always contextualize percentages with their league rank in your rationale.

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

### CRITICAL: INJURY DURATION CONTEXT
NOT all injuries are created equal:
- **SEASON-LONG injuries (LTIR, out most/all of season)** = Team stats ALREADY reflect absence.
  → **NEVER** cite these as "reasons" to bet for or against a team. They are baked into the baseline.
  → **NEVER** use them as "balancing" factors (e.g., "Both teams are missing key stars" if one star has been out all year).
  → Example: If a star forward has been on LTIR since October, team's record/stats ARE their baseline.
- **RECENT injuries (last 1-2 weeks)** = POTENTIAL edge.
  → Team hasn't fully adjusted, opponent may not have game-planned for absence.
  → Line may not fully reflect the loss.
- **MID-SEASON (3-8 weeks)** = Team has likely adjusted, but still relevant.

⚠️ ABSOLUTE RULE: Check the injury duration tags in the scout report. 
1. Only mention **RECENT** injuries as betting edges or factors that might cause variance.
2. If an injury is tagged **[SEASON-LONG]**, it is **FORBIDDEN** to include it in your rationale.
3. Your thesis must focus on the players who are ACTUALLY playing and how their RECENT form or matchup data suggests an edge.

### THE NARRATIVE EDGE
Hockey has deep psychological and narrative roots that advanced stats (Corsi/xG) sometimes overlook:
- **Momentum Shifts**: Look for teams on a "losing skid" narrative, or "revenge games" for traded players.
- **Rookie Surge**: Young players often have a "breakout" period where their impact exceeds their season-long Corsi profile.
- **Locker Room & Intangibles**: Use **fetch_narrative_context** to find storylines like coaching changes, "player birthdays", or internal team drama that might affect effort.
- **Rule**: Integrate these storylines into your rationale when they help explain variance that stats alone cannot.

### ROSTER VERIFICATION (CRITICAL)
Hockey has frequent trades, call-ups, and roster moves:
- **ONLY mention players explicitly listed in the scout report roster section**
- **DO NOT assume a player is on a team** - they may have been traded or sent to AHL
- Call-ups from AHL can change lineups significantly
- If unsure about a player, do not mention specific names
- Focus on team-level stats when player data is unclear

⚠️ NEVER assume a player's team - the NHL has many mid-season trades. Always verify.

### 🚨 CRITICAL: AVOID HEAVY FAVORITES 🚨
**REAL DATA SHOWS: NHL favorites at -165 or worse are VALUE TRAPS**
- Our historical results: Heavy favorites (-165+) lose at an alarming rate
- Hockey has too much variance for chalk to cover the juice
- Even elite teams lose 30%+ of games as heavy favorites

**SHARP TIP: AVOID HEAVY FAVORITES**
NHL favorites at -165 or worse are VALUE TRAPS. 
- Even elite teams lose 30%+ of games as heavy favorites.
- Hockey has too much variance for chalk to cover the juice consistently.

**VALUE CHALLENGE:**
1. **ML favorites at -170 or worse** are sucker bets - the risk/reward is broken.
2. **Puck line -1.5 favorites at -180 or worse** are rarely worth the juice.
3. **BEST VALUE**: Underdogs at +110 or much higher. There is no maximum odds limit for an organic underdog play.

### BET TYPE SELECTION - PUCK LINE VS MONEYLINE
Always evaluate BOTH puck line (+1.5/-1.5) and moneyline:

**PUCK LINE -1.5 (FAVORITE COVERS BY 2+):**
- ONLY when you have ELITE confidence (0.80+) in a dominant win
- Favorite has massive underlying metrics edge AND rested AND confirmed elite goalie
- These are RARE - most NHL games are 1-2 goal margins
- Our data shows these hit when done selectively

**PUCK LINE +1.5 (UNDERDOG STAYS WITHIN 1):**
- PREFERRED bet type for underdogs
- Underdog has strong underlying metrics but inconsistent finishing
- Close game expected (tight goalie matchup)
- Road team with good shot metrics against home favorite
- Hits ~70% for dogs - great for building bankroll

**MONEYLINE:**
- UNDERDOG ML (+110 to +170) = BEST VALUE IN HOCKEY
  - Hockey underdogs win 40%+ outright
  - Plus-money MLs are where sharps make their money
- FAVORITE ML (-110 to -150) = ACCEPTABLE
  - Only when you have a clear edge (goalie, rest, metrics)
- FAVORITE ML (-160 to -165) = CAUTION
  - Need 62%+ win rate just to break even
  - Better to take the puck line or pass
- FAVORITE ML (-170+) = AVOID ENTIRELY
  - Historical data shows these are losing propositions

### 🎯 NHL BET SELECTION FLOWCHART

**STEP 1: Do you like the UNDERDOG or FAVORITE?**

**If UNDERDOG:**
1. "Do I believe they stay within 1 goal?"
   - **PREFERENCE: Take the Puck Line +1.5**. 
   - Underdog +1.5 is the sharpest bet in hockey because ~30% of games are decided by exactly one goal.
   - Only take UNDERDOG ML (+110+) if you have elite confidence (0.80+) in an outright win.
   
**If FAVORITE:**
1. Check the ML odds:
   - -170 or worse → **PASS on this game** or look at puck line -1.5
   - -155 to -165 → **EXTREME CAUTION** - need ironclad thesis
   - -110 to -150 → ACCEPTABLE if edge is clear
2. "Will they win by 2+ goals?"
   - YES with high confidence (0.80+) → Take puck line -1.5
   - NO → Take the ML (if acceptable odds) or PASS

### CONFIDENCE CALIBRATION
Due to NHL's high variance, be conservative with confidence:
- 0.72-0.75 = Moderate edge (one or two clear factors)
- 0.76-0.80 = Strong edge (multiple factors align)
- 0.81+ = Elite conviction (RARE - save for obvious spots)

**GOLDEN RULE 1: GOALIE CONFIRMATION**. If the starting goalie is a backup with a sub-.900 SV% or negative GSAx, and you were planning to bet the favorite, ABANDON the bet or pivot to the underdog.

**GOLDEN RULE 2: UNDERDOG PROTECTION**. When in doubt, take the +1.5 spread rather than the ML for underdogs. It turns a "close loss" into a win.
`;

export default NHL_CONSTITUTION;
