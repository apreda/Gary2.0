/**
 * EPL Constitution - Soccer-specific sharp betting heuristics
 * 
 * BETA: Uses Ball Don't Lie API + Perplexity for advanced analytics (xG, possession, etc.)
 */

export const EPL_CONSTITUTION = `
## EPL SHARP HEURISTICS (BETA - Supplemental Analytics)

Note: EPL picks use Perplexity-sourced advanced stats (xG, possession metrics) in addition to API data.
Soccer betting requires understanding 3-way markets (Home/Draw/Away). Confidence may be slightly lower than NBA/NFL.

### THE DRAW - SOCCER'S HIDDEN VALUE
- **Draw frequency**: ~25-27% of EPL matches end in draws
- **Draw value**: Often overlooked by recreational bettors - look for value in evenly matched teams
- **When to consider Draw**:
  - Both teams' xG metrics suggest low-scoring, tight match
  - Home team slight favorite but poor recent form
  - Both teams need points desperately (late season scenarios)
  - Historical H2H shows draw tendencies
- **Draw avoidance**:
  - Heavy favorite at home (-200 or better)
  - One team playing for nothing late season

### EXPECTED GOALS (xG) - THE GOLD STANDARD
- xG measures shot quality, not just quantity
- **xG overperformance** (goals > xG): Regression candidate - fade
- **xG underperformance** (goals < xG): Positive regression expected - back
- Look at xG difference over 5-10 matches, not just season totals
- **Key insight**: Top teams typically have xG > 1.8 per match, relegation sides < 1.2

### POSSESSION VS EFFICIENCY
- High possession ≠ better team (false correlation)
- **Look for**: Possession efficiency - goals per possession percentage point
- Counter-attacking teams (Brighton, early Klopp Liverpool) win with <50% possession
- **Trap game**: Backing possession-heavy team vs organized low-block
- Teams like Man City use possession to control; smaller teams sacrifice it

### HOME/AWAY SPLITS - CRITICAL IN SOCCER
- **Home advantage matters MORE in EPL** than US sports (~60% home win rate)
- Some teams are "road warriors" (rare) - check away form separately
- **Promoted teams**: Often strong at home initially, struggle away
- **Top 6 at home**: Usually -150 or better for reason
- **Bottom half away**: Often massive underdogs - sometimes value here

### CLEAN SHEETS & DEFENSIVE METRICS
- **Clean sheet %**: Elite defenses keep 40%+ clean sheets at home
- Goals against per match: <1.0 is elite, >1.5 is concerning
- **Defensive structure**: Look at shots on target conceded, not just goals
- Key: Box entries allowed, big chances conceded

### FORM & MOMENTUM
- **Last 5 matches form**: WDWWL = 10 points from 15 (strong form)
- Recent form matters MORE than season-long stats late in campaign
- **Fixture congestion**: Teams in Europe often struggle in league
- **Post-international break**: Unpredictable - many upsets occur

### MOTIVATION & CONTEXT
- **Title race**: Teams fighting for title rarely slip at home vs bottom half
- **Relegation battle**: Desperate teams overperform - respect the fight
- **Nothing to play for**: Mid-table teams in March-May can be flat
- **Derby matches**: Form goes out the window - expect the unexpected
- **Manager bounces**: New manager often gets 3-5 match honeymoon

### SPECIAL SITUATIONS
- **Midweek European fixtures**: Fatigue factor for teams in Champions/Europa League
- **Early kickoffs (12:30 UK)**: Big teams historically underperform
- **Boxing Day/fixture congestion**: Squad depth becomes crucial
- **Last day of season**: All matches kick off simultaneously - chaos factor

### GOALKEEPER & INJURIES
- **Starting GK out**: Massive - always check team news
- **Key defender missing**: Especially for organized defensive teams
- **Top scorer injured**: Obvious but crucial for clean sheet bets
- **Penalty takers**: Know who takes them if considering BTTS/exact scores

### BETTING MARKET GUIDANCE
- **Moneyline (1X2)**: Home/Draw/Away - remember Draw is ~25% base rate
- **Asian Handicap**: Removes draw option - better for US bettors
- **BTTS (Both Teams To Score)**: ~55% of EPL matches see both teams score
- **Over/Under 2.5**: EPL average is ~2.7 goals/match
- **Double Chance**: Home/Draw or Away/Draw for safety

### RED FLAGS - WHEN TO PASS
- Massive favorite away from home (-180 or worse)
- Early season matches (before 5 games played)
- Teams with new managers (first 3 matches)
- International break return (first match back)
- Matches with no competitive stakes for both teams

### CONFIDENCE CALIBRATION
- **High confidence (70%+)**: Clear form disparity, strong home team, favorable xG trend
- **Medium confidence (60-69%)**: Solid edge but some uncertainty factors
- **Pass**: Too many unknowns, close matchup, or unfavorable odds
- **Remember**: 25% of matches are draws - account for this in confidence

### LEAGUE-SPECIFIC CONTEXT
- Top 6 gap has widened - expect fewer upsets vs Big 6 at home
- Promoted teams often start strong, fade by Christmas
- Traditional "Big 6" away to smaller grounds = trap game territory
- Stadium atmosphere matters - sold-out crowds boost home team
`;
