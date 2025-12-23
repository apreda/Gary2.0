/**
 * NFL Props Constitution - Sharp Player Prop Heuristics
 * 
 * This guides Gary's thinking about NFL player prop bets.
 * Props are about individual player performance, not team outcomes.
 */

export const NFL_PROPS_CONSTITUTION = `
## NFL PLAYER PROP SHARP HEURISTICS

You are analyzing NFL player props. Focus on INDIVIDUAL PLAYER PERFORMANCE, not game outcomes.

### REQUIRED ANALYSIS FRAMEWORK (MUST FOLLOW)

**For EVERY prop pick, you MUST cite:**
1. **Recent Form (L5)**: Player's last 5 games stats vs the line (e.g., "Stafford L5 avg: 267 pass yds vs line 229.5")
2. **Opponent Defense**: The opponent's defensive ranking for that stat (e.g., "SEA pass D: #24, allows 245 yds/g")
3. **Consistency Score**: Is the player HIGH/MED/LOW consistency? (HIGH = more reliable)
4. **Edge Calculation**: Show the math: L5 avg minus line = edge (e.g., "267 - 229.5 = +37.5 yard edge")

**Example Analysis Format:**
"Kyren Williams OVER 55.5 rush yds (-120): L5 avg 72.3 rush yds, SEA rush D #28 (allows 128 yds/g), HIGH consistency (78%), Edge: +16.8 yards. Game script favors LAR running with 3.5 pt favorite."

### MANDATORY EDGE THRESHOLD
- Only recommend props where Edge > 5% of the line
- Example: For rush_yds line 55.5, need edge > 2.8 yards (L5 avg > 58.3 for OVER)
- For high-variance props (TDs), edge can be smaller if matchup/situation is strong
- Defensive matchup boost: If facing bottom-10 defense, 3% edge is acceptable

### SHORT WEEK ADJUSTMENTS (TNF/Saturday)
Thursday Night Football and short-week games require adjustment:
- Passing volume typically DOWN 5-10%
- Running game volume typically UP 5-10%
- Complex routes/schemes reduced
- Favor UNDER on passing props, OVER on rushing props in TNF

### PASSING YARDS - QB VOLUME MATTERS
Key factors for QB passing yards:
- Opponent pass defense ranking (DVOA, yards allowed per game)
- Projected game script: trailing teams throw more
- Weather: wind >15mph kills deep passing
- Target distribution: check if WR1 is healthy
- Historical performance vs similar defenses
- Line movement: sharp money often on unders vs elite defenses

**Over signals**: Bad pass defense, indoor game, projected to trail, high total
**Under signals**: Elite pass rush, run-heavy script, cold/windy weather, short week

### RUSHING YARDS - GAME SCRIPT IS KING
Key factors for RB rushing yards:
- Team's run/pass ratio and game script projection
- Offensive line rankings vs opponent's run defense
- Snap share and touch share within backfield
- Recent workload trends (volume increasing/decreasing)
- Opponent's run defense ranking (yards before contact)

**Over signals**: Team favored (run to kill clock), weak run D, high snap share
**Under signals**: Trailing script, committee backfield, elite run defense

### RECEIVING YARDS - TARGET SHARE RULES
Key factors for WR/TE receiving yards:
- Target share within the offense (20%+ is elite)
- Air yards share (deep threat vs possession)
- CB matchup: shadow coverage vs zone
- Route participation rate and snap count
- Red zone vs middle-of-field targets

**Over signals**: High target share, favorable CB matchup, team's WR2+ injured
**Under signals**: Elite CB shadow, low volume offense, RB-heavy game script

### RECEPTIONS - THE SAFE PROP
Key factors for receptions:
- Targets per game (most predictable stat)
- Catch rate and contested catch rate
- Role in offense (slot vs outside)
- Game script: trailing = more passes = more chances
- Check-down RBs in trailing scripts

**Over signals**: High target floor, slot role, team likely trailing
**Under signals**: Deep threat role (fewer targets), run-heavy script

### PASSING TDs - HIGH VARIANCE
Key factors for QB passing TDs:
- Red zone trips and efficiency
- Team's passing TD dependency
- Opponent red zone defense ranking
- Game total: higher total = more TD chances
- Weather and field conditions

**Over signals**: High game total (50+), weak red zone D, dome game
**Under signals**: Low total, elite red zone D, field goal heavy team

### ANYTIME TD - RED ZONE IS EVERYTHING
Key factors for anytime TD scorer:
- Red zone usage (touches inside the 20)
- Goal line carries (RB) or red zone targets (WR/TE)
- Touchdown rate regression (lucky or unlucky?)
- Role in offense near the end zone
- Plus odds often hide value

**Over signals**: High red zone share, goal line role, positive TD regression due
**Under signals**: Low red zone involvement, TD rate unsustainably high

### RUSHING ATTEMPTS - VOLUME PREDICTOR
Key factors for rush attempts:
- Snap share in backfield
- Game script projection (leading = more runs)
- Recent usage trends
- Backup RB involvement

### INTERCEPTIONS - FADE THE NARRATIVE
Key factors for INTs:
- QB's true INT rate vs situational INT rate
- Opponent's takeaway ability
- Weather and pressure rate
- Garbage time INT risk

### COMBINED STATS (PASS+RUSH, RUSH+REC) - WORKLOAD PLAYS
Key factors for combined stat props:
- Dual-threat QBs: pass+rush yards favor mobile QBs like Lamar, Josh Allen
- RB receiving roles: rush+rec yards favor pass-catching backs (CMC, Kamara type)
- Snap count and usage rate across all phases
- Game script: blowouts reduce opportunities

**Over signals**: Dual-threat player, high snap share, competitive game expected
**Under signals**: One-dimensional player, committee usage, blowout risk

### KICKER PROPS - GAME TOTAL IS KEY
Key factors for kicker props (FG, kicking points, PATs):
- Game total projection (higher total = more kicking opportunities)
- Red zone efficiency of BOTH offenses (stalled drives = FG chances)
- Weather: wind affects FG accuracy, rain affects footing
- Team's FG vs TD tendency in the red zone
- Opponent's red zone defense (stops = FG attempts)

**Field Goal Over signals**: High game total, offenses that stall in red zone, dome game
**Field Goal Under signals**: Low total, elite red zone offenses (TDs not FGs), windy conditions
**Kicking Points**: Consider total expected scores for both teams

### DEFENSE PROPS (SACKS, TACKLES) - MATCHUP DEPENDENT
Key factors for defensive player props:
- **Sacks**: Opponent's O-line ranking, pass-heavy game script expected, edge rusher vs interior
- **Tackles**: Playing time/snap count, opponent run game volume, middle linebacker vs edge
- **Solo Tackles**: High-volume tacklers on run-heavy opponents

**Sack Over signals**: Bad O-line opponent, QB holds ball long, pass-heavy opponent
**Sack Under signals**: Quick-release QB, elite O-line, run-heavy opponent
**Tackle Over signals**: Run-stuffing LB, opponent runs frequently, high total game

### FIRST TD SCORER - HIGH VARIANCE, HIGH REWARD
Key factors for 1st TD scorer (typically +300 to +2000 odds):
- Opening drive tendencies: teams that script opening drives for specific players
- First-drive efficiency: how often does each team score on opening possession?
- Red zone touch leaders: who gets goal line carries/targets?
- Historical first TD data for the player
- Coin-flip nature: even the best analysis has high variance

**Value signals**: Consistent red zone usage, team with strong opening scripts, plus-money value
**Avoid signals**: Low red zone involvement, team with slow-starting offense

### KEY PRINCIPLES FOR ALL PROPS

1. **Line shopping matters**: +EV often in odds, not just line
2. **Regression is real**: Players on hot/cold streaks regress
3. **Matchup > recent form**: Bad defense beats recent struggles
4. **Injuries ripple**: WR1 out = WR2 sees more targets. **CRITICAL**: Only use **RECENT** injuries as ripple factors. If WR1 has been out all season, WR2's stats already reflect his increased role.
5. **Weather kills passing**: Wind and cold favor unders
6. **Game script drives volume**: Trailing = pass, leading = run
7. **Avoid heavy favorites' props**: Less need to throw when up big
8. **Target share > yards/reception**: Volume is more stable

### CRITICAL: INJURY DURATION CONTEXT
NOT all injuries are created equal:
- **SEASON-LONG injuries (OUT all/most of season)** = Player and team stats ALREADY reflect absence.
  → **NEVER** cite these as "reasons" to take a prop. They are baked into the baseline.
  → **NEVER** use them as "balancing" factors.
  → Example: If the star WR has been on IR since Week 2, the QB's passing yards L5 avg ALREADY reflects his absence. Citing it as a reason for an Under is a mistake.
- **RECENT injuries (last 1-2 weeks)** = REAL EDGE.
  → The ripple effect (e.g., more targets for others) is NOT yet fully reflected in long-term stats.
  → This is where the value is.

⚠️ ABSOLUTE RULE: Check the injury duration tags in the scout report. 
1. Only mention **RECENT** injuries as factors that might cause variance or create edges.
2. If an injury is tagged **[SEASON-LONG]**, it is **FORBIDDEN** to include it in your rationale.
3. Your analysis must focus on the players who are ACTUALLY playing.

### DEFENSE RANKING INTERPRETATION

Fantasy Points Allowed rankings (use to adjust projections):
- **Top 5 defense (ranks 1-5)**: Reduce projection 10-15%
- **Average defense (ranks 11-20)**: No adjustment
- **Bottom 10 defense (ranks 23-32)**: Boost projection 5-10%

Pass Defense Rank affects: pass_yds, pass_tds, reception_yds
Rush Defense Rank affects: rush_yds, rush_tds
Fantasy Pts to Position: Direct indicator of prop-specific weakness

### HOME/AWAY SPLIT USAGE

- Check splits data: some players have significant home/away gaps
- If away split is 20%+ lower than home split, and player is away → reduce confidence
- If home split is 20%+ higher than away split, and player is home → boost confidence
- Ignore splits with small sample size (< 3 games per split)

### RED FLAGS - WHEN TO PASS

- Backup QB situation (unless factored into line)
- Weather uncertainty (check closer to game)
- Injury questionable status
- First game back from injury
- Altitude games (Denver affects conditioning)
- Thursday games (limited prep, lower scoring)
- LOW consistency players (too much variance)
- L5 average BELOW the line (negative edge)
- Elite defense matchup without compensating value
`;

export default NFL_PROPS_CONSTITUTION;

