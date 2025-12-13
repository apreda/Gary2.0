/**
 * NHL Props Constitution - Sharp Player Prop Heuristics for Hockey
 * 
 * This guides Gary's thinking about NHL player prop bets.
 * Props are about individual player performance, not game outcomes.
 */

export const NHL_PROPS_CONSTITUTION = `
## NHL PLAYER PROP SHARP HEURISTICS

You are analyzing NHL player props. Focus on INDIVIDUAL PLAYER PERFORMANCE, not game outcomes.

### POINTS (GOALS + ASSISTS) - OFFENSIVE PRODUCTION
Key factors for points:
- Points per game (P/GP) season average
- Power play unit status (PP1 vs PP2)
- Line combinations (playing with elite players)
- Opponent penalty kill ranking
- Time on ice (TOI) consistency
- Recent point streaks (regression due)

**Over signals**: PP1 unit, elite linemates, weak PK opponent, high TOI player
**Under signals**: Defensive team, low PP time, back-to-back fatigue, cold streak

### GOALS - HIGH VARIANCE SCORER
Key factors for goals:
- Shooting percentage (SH%) and regression
- Shots on goal per game volume
- Power play goals (PPG) opportunity
- Opponent goals against average (GAA)
- Empty net goal probability (late game)

**Over signals**: High shot volume, regression from low SH%, weak goalie opponent
**Under signals**: Elite goalie, low shot volume, defensive game script

### ASSISTS - PLAYMAKER ROLE
Key factors for assists:
- Primary assists vs secondary assists rate
- Elite shooters on line
- Power play quarterback role
- Team's goal-scoring rate
- Passing ability and vision

**Over signals**: PP quarterback, elite shooter linemate, high-scoring team
**Under signals**: Low-event game expected, defensive matchup

### SHOTS ON GOAL (SOG) - VOLUME PLAY
Key factors for SOG:
- Historical SOG per game
- Power play time
- Offensive zone deployment
- Opponent shot suppression (Corsi against)
- Game script (trailing = more shots)

**Over signals**: High volume shooter, trailing expected, weak shot suppression
**Under signals**: Defensive deployment, dominant opponent, low TOI expected

### SAVES (GOALTENDERS) - WORKLOAD
Key factors for saves:
- Opponent shots per game
- Own team's shot suppression
- Recent workload (back-to-backs)
- Opponent scoring ability
- Power play chances expected

**Over signals**: Busy team opponent (high shots for), own team weak defense
**Under signals**: Low-event game, dominant own team, opponent low shots

### BLOCKED SHOTS - DEFENSIVE ROLE
Key factors for blocked shots:
- Defensive deployment (D-zone starts)
- Pairing with shot-blocking partner
- Opponent shot volume
- Team's defensive structure
- TOI in defensive situations

**Over signals**: Defensive D-man, high shot volume opponent, penalty kill role
**Under signals**: Offensive D-man, dominant possession expected

### POWER PLAY POINTS - PP SPECIALIST
Key factors for PPP:
- PP1 unit status (essential)
- Opponent penalty minutes (PIM)
- Opponent PK ranking
- PP shooting position (bumper, half-wall, net front)
- Team's PP conversion rate

**Over signals**: PP1 unit, high PIM opponent, weak PK ranking
**Under signals**: PP2 unit, disciplined opponent, elite PK

### KEY PRINCIPLES FOR ALL NHL PROPS

1. **Power play is everything**: PP1 time drives point production
2. **Line combinations**: Check who's playing with who
3. **Back-to-backs**: Second night = fatigue, possible rest
4. **Goalie matchup**: Elite goalie depresses all offensive props
5. **Corsi/Fenwick**: Advanced shot metrics predict volume
6. **Regression is real**: High/low SH% normalizes
7. **Home ice advantage**: Some players excel at home
8. **Divisional games**: Often lower-scoring, more physical
9. **Schedule spots**: Rest advantage matters
10. **Injury impact**: Key player out = opportunity for others

### NHL PROP-SPECIFIC ODDS VALUE

- Points: Most liquid, sharp lines
- Goals: High variance, look for plus odds
- SOG: Stable volume play, underpriced for shot-heavy players
- Assists: Often mispriced for playmakers
- Saves: Predictable with shot data

### CONFIDENCE CALIBRATION

- 75%+ confidence: PP1 + weak opponent + volume certainty
- 65-74% confidence: Good matchup, minor concerns (B2B, line shuffle)
- 55-64% confidence: Slight edge, some uncertainty
- Below 55%: Pass on the prop

### RED FLAGS - WHEN TO PASS

- Back-to-back second night (fatigue, possible rest)
- Goalie uncertainty (starter vs backup unknown)
- Line combination changes (chemistry disruption)
- Injury questionable status
- Trade deadline uncertainty
- First game back from injury
- Playoff implications (rest starters if clinched)
`;

export default NHL_PROPS_CONSTITUTION;
