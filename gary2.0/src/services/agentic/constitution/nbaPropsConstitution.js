/**
 * NBA Props Constitution - Sharp Player Prop Heuristics
 * 
 * This guides Gary's thinking about NBA player prop bets.
 * Props are about individual player performance, not team outcomes.
 */

export const NBA_PROPS_CONSTITUTION = `
## NBA PLAYER PROP SHARP HEURISTICS

You are analyzing NBA player props. Focus on INDIVIDUAL PLAYER PERFORMANCE, not game outcomes.

### POINTS - USAGE AND PACE DRIVE VOLUME
Key factors for player points:
- Usage rate (USG%): 25%+ is elite scorer territory
- Pace of play: fast pace = more possessions = more scoring chances
- Opponent defensive rating vs position (DEF RTG)
- Minutes projection and rotation stability
- Recent scoring trends (hot/cold streaks regress)
- Injury impact: teammate out = more usage

**Over signals**: High usage, fast pace matchup, weak perimeter defense, key teammates out
**Under signals**: Elite defender matchup, slow pace team, foul trouble history, back-to-back fatigue

### REBOUNDS - SIZE AND PACE MATCHUP
Key factors for rebounds:
- Rebounding rate (REB% - percentage of available rebounds grabbed)
- Opponent's rebounding tendencies (do they crash glass or run?)
- Pace of play: more possessions = more missed shots = more rebounds
- Minutes and position (C/PF naturally rebound more)
- Box-out vs crash glass style matchup

**Over signals**: Weak rebounding opponent, high pace game, uncontested boards expected
**Under signals**: Elite rebounding team opponent, small-ball lineup, limited minutes

### ASSISTS - PLAYMAKER ROLE AND TEMPO
Key factors for assists:
- Assist rate (AST%) and usage in offense
- Teammate shooting efficiency (good shooters convert assists)
- Pace of play and possessions per game
- Ball-handler role (primary vs secondary)
- Opponent turnover forcing ability

**Over signals**: High assist rate, elite shooters as teammates, fast pace, point guard primary role
**Under signals**: Poor shooting teammates, slow pace, isolation-heavy offense

### THREE-POINTERS MADE - VOLUME AND OPPORTUNITY
Key factors for 3PM:
- Three-point attempt rate (3PAr) - how often they shoot threes
- Three-point percentage (3P%) - regression to mean is real
- Opponent perimeter defense ranking
- Game script: trailing teams shoot more threes
- Catch-and-shoot vs off-dribble profile

**Over signals**: High volume shooter, weak perimeter D, team projected to trail
**Under signals**: Elite perimeter D, low volume game script, cold shooting stretch

### STEALS + BLOCKS (STOCKS) - DEFENSIVE ROLE
Key factors for steals/blocks:
- Historical steal/block rate per 36 minutes
- Opponent turnover rate (steals) or shot-blocking tendency (blocks)
- Minutes and defensive role stability
- Pace of play (more possessions = more chances)

**Over signals**: High steal/block rate, careless ball-handling opponent, rim protector role
**Under signals**: Ball-secure opponent, limited defensive role, foul trouble risk

### POINTS + REBOUNDS + ASSISTS (PRA) - VOLUME COMPOSITE
Key factors for PRA:
- All individual factors combined
- Pace and minutes are crucial (more time = more stats)
- Consistency of all-around production
- Injury impact on teammates

**Over signals**: Star player, high usage, high pace, full minutes expected
**Under signals**: Role player, blowout risk (reduced minutes), injury concern

### DOUBLE-DOUBLE / TRIPLE-DOUBLE
Key factors:
- Historical rate of double-doubles
- Floor for each counting stat (needs 10+ in two/three categories)
- Playing time certainty
- Opponent weakness that enables production

**Over signals**: Consistent 10+ in two categories, high floor player
**Under signals**: Volatile stat production, minute restriction risk

### KEY PRINCIPLES FOR ALL NBA PROPS

1. **Pace matters most**: Fast pace games = inflated stats across the board
2. **Back-to-backs kill**: Second night of B2B = reduced minutes and fatigue
3. **Usage cascades**: Star player out = role players see usage spike
4. **Blowout risk**: Big favorites may rest starters in 4th quarter
5. **Minute floors**: Check for rest days or minute restrictions
6. **Matchup specifics**: Point guards struggle vs elite perimeter D
7. **Regression is real**: Hot/cold streaks normalize over time
8. **Home vs away**: Some players perform differently on the road
9. **Primetime games**: Stars often elevate in national TV games
10. **Rest advantage**: Well-rested vs tired team = performance edge

### NBA PROP-SPECIFIC ODDS VALUE

- Points props: Most liquid, lines are sharp
- Rebounds: Often mispriced for versatile bigs
- Assists: Underpriced for primary ball handlers
- 3PM: High variance, look for plus odds
- PRA: Combine individual edges

### CONFIDENCE CALIBRATION

- 75%+ confidence: Strong matchup edge + usage certainty + line value
- 65-74% confidence: Good matchup or value, minor concerns (B2B, rotation flux)
- 55-64% confidence: Slight edge, notable uncertainty
- Below 55%: Pass on the prop

### RED FLAGS - WHEN TO PASS

- Back-to-back second night (fatigue, minute cuts)
- Injury questionable status (may not play or be limited)
- Blowout potential (starters rest in 4th)
- Trade deadline uncertainty (role may change)
- First game back from injury (minute restriction likely)
- Coach rotation changes (new rotation = unpredictable)
- Load management candidates (Kawhi, older stars)
`;

export default NBA_PROPS_CONSTITUTION;
