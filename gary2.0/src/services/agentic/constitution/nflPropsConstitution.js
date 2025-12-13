/**
 * NFL Props Constitution - Sharp Player Prop Heuristics
 * 
 * This guides Gary's thinking about NFL player prop bets.
 * Props are about individual player performance, not team outcomes.
 */

export const NFL_PROPS_CONSTITUTION = `
## NFL PLAYER PROP SHARP HEURISTICS

You are analyzing NFL player props. Focus on INDIVIDUAL PLAYER PERFORMANCE, not game outcomes.

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

### KEY PRINCIPLES FOR ALL PROPS

1. **Line shopping matters**: +EV often in odds, not just line
2. **Regression is real**: Players on hot/cold streaks regress
3. **Matchup > recent form**: Bad defense beats recent struggles
4. **Injuries ripple**: WR1 out = WR2 sees more targets
5. **Weather kills passing**: Wind and cold favor unders
6. **Game script drives volume**: Trailing = pass, leading = run
7. **Avoid heavy favorites' props**: Less need to throw when up big
8. **Target share > yards/reception**: Volume is more stable

### CONFIDENCE CALIBRATION

- 75%+ confidence: Strong matchup edge + line value + volume certainty
- 65-74% confidence: Good matchup or value, minor concerns
- 55-64% confidence: Slight edge, some uncertainty
- Below 55%: Pass on the prop

### RED FLAGS - WHEN TO PASS

- Backup QB situation (unless factored into line)
- Weather uncertainty (check closer to game)
- Injury questionable status
- First game back from injury
- Altitude games (Denver affects conditioning)
- Thursday games (limited prep, lower scoring)
`;

export default NFL_PROPS_CONSTITUTION;
