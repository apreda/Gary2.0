/**
 * Spread Evaluation Factors — Sport-specific factor checklists for Pass 1
 *
 * Each function returns a string of concise awareness factors for Gary's
 * spread evaluation. 2-3 sentences per factor — no investigation steps,
 * no stat names, no methodology. Gary's HIGH thinking mode handles reasoning.
 *
 * Sport-keyed: getNbaSpreadFactors(), getNcaabSpreadFactors(), etc.
 */

export function getNbaSpreadFactors() {
  return `Narrative factors — back-to-backs, streaks, rest, travel, revenge spots, hot/cold stretches — are context for the game. They are not edges and they are not reasons by themselves to pick a side. Every bettor in the world can see these factors. Sometimes the favorite is the right side. Sometimes the underdog is. It depends entirely on THIS game, these players, and this matchup.`;
}

export function getNcaabSpreadFactors() {
  return `This is a neutral-court tournament game. Home/away records are irrelevant. Both teams in this round are on the same rest schedule. The spread was set AFTER seedings, injuries, and all publicly known information were available — everyone can see the seed gap and the efficiency ratings. Sometimes the favorite is the right side. Sometimes the underdog is. It depends entirely on THIS matchup between THESE teams.`;
}

export function getNhlSpreadFactors() {
  return `### 1. POSSESSION & TERRITORIAL CONTROL
5-on-5 possession metrics (Corsi, Fenwick, expected goals) reveal how teams control play at even strength. A team can win games while losing the possession battle — but the process tells a different story than the results.

### 2. SPECIAL TEAMS MATCHUP
Power play and penalty kill operate independently of 5-on-5 dynamics. A team's special teams profile can shift game outcomes on its own — investigate PP% and PK% for both sides and how they interact.

### 3. GOALTENDING & STARTER CONFIRMATION
The confirmed starting goalie and their current form are significant line-movers. A backup surprise start, a hot streak, or a cold stretch all shift the price. Recent form can diverge from the season baseline.

### 4. STREAKS & FORM
Hockey streaks can be driven by goaltending, special teams, shooting variance, or genuine process improvement. The market reacts to the streak — investigate what's underneath it.

### 5. REST & SCHEDULE
Back-to-backs, travel, and compressed schedules affect NHL pricing. The line adjusts for these — investigate whether the adjustment matches the actual impact on each team's roster and goaltending deployment.

### 6. INJURY IMPACT ON PRICE
Established absences are already in the team's stats and the line. FRESH/SHORT-TERM absences may not be fully reflected in the price yet. Depth matters more in hockey than casual observers assume.

### 7. VARIANCE & CLOSE-GAME RECORDS
Hockey has more single-game variance than any major sport. Teams can sustain shooting percentages, save percentages, and close-game records that the underlying process doesn't support. PDO (shooting% + save%) shows where results and process diverge.`;
}

export function getNflSpreadFactors() {
  return `### 1. QB STATUS & INJURY TIMING
Quarterback status moves NFL lines faster than any other single variable. Fresh uncertainty can change the number quickly, while long-running absences are usually reflected in the team's baseline performance.

### 2. TRENCHES & PRESSURE PROFILE
Offensive line vs pass rush and run-block vs front-seven matchups often define game shape before skill-position production shows up. Public attention is usually on headlines and star players, so line pricing can lag trench dynamics.

### 3. SCHEDULE LOAD & TRAVEL
Short weeks, cross-country travel, rest asymmetry, and time-zone context all influence NFL prices. Separate broad schedule narratives from each team's actual performance in similar spots.

### 4. TURNOVER & FIELD-POSITION VARIANCE
Recent turnover swings can distort perception and short-term pricing, especially when results were driven by short fields or non-offensive scores. Investigate whether the process metrics align with the visible results.

### 5. PUBLIC STORYLINES & RECENCY
Prime-time outcomes, visible blowouts, and media narratives can move betting behavior quickly. Investigate whether narrative momentum matches opponent-adjusted data from recent games.

### 6. WEATHER & VENUE EFFECTS
Wind, temperature, and surface/venue context can meaningfully shift expectations for passing efficiency and game pace. Verify whether those conditions materially change this matchup or are already reflected in standard assumptions.

### 7. MOTIVATION, STAKES, AND COACHING STYLE
Playoff stakes, divisional context, and coaching aggression profiles can influence late-game decisions and variance. Investigate whether these dynamics are already reflected in the number or remain uncertain for this specific game.`;
}

export function getNcaafSpreadFactors() {
  return `### 1. RANKING & BRAND PRESSURE
Poll rank and program reputation can shape public perception more than opponent-adjusted performance. Investigate whether market attention is anchored to brand strength or current-season reality.

### 2. QB/ROSTER CONTINUITY
College football lines are highly sensitive to quarterback availability and skill-position continuity. Fresh absences can create uncertainty, while established rotation changes are often already reflected in team baselines.

### 3. TRENCHES, EXPLOSIVENESS, AND HAVOC
Explosive-play profile, pressure generation, and line-of-scrimmage control often determine whether projected gaps hold over four quarters. Investigate how those mechanics align with this specific opponent matchup.

### 4. SCHEDULE LOAD & TRAVEL CONTEXT
Rest, travel distance, kickoff timing, and environment changes can affect execution quality. Separate broad travel narratives from demonstrated performance in comparable spots.

### 5. STRENGTH OF SCHEDULE & CONFERENCE CONTEXT
Records built in different conference environments are not directly equivalent. Investigate whether visible form is driven by opponent quality differences rather than true team-level shifts.

### 6. MOTIVATION & SEASON STAKES
Rivalry intensity, conference title implications, and postseason positioning can influence pace, aggression, and late-game decisions. Investigate whether those stakes are symmetric or one-sided tonight.

### 7. WEATHER, ALTITUDE, AND HOME-FIELD ENVIRONMENT
Outdoor conditions and venue environment can change play-calling and efficiency profiles. Verify how these factors interact with each team's style rather than assuming a generic home-field effect.`;
}

export function getMlbSpreadFactors() {
  return `### 1. STARTING PITCHER MATCHUP
The starting pitcher matchup is one of the inputs the opening line is built around — the biggest single one — but it is one piece of the game, not the whole. The bullpen, the lineups across all nine innings, the park, and variance decide the rest. Investigate the starters thoroughly, then weight them against everything else.

### 2. BULLPEN AVAILABILITY & WORKLOAD
Bullpen usage over the previous 2-3 games directly affects available arms tonight. Teams playing their 6th or 7th game in a row may have a depleted bullpen.

### 3. LINEUP CONSTRUCTION & PLATOON ADVANTAGES
Lineup order and handedness matchups against the opposing starter affect how each lineup profiles against the pitching. Rest days, platoon splits, and injuries to key bats change the lineup's expected output.

### 4. DIVISION & STANDINGS CONTEXT
Division games, rivalry matchups, and playoff race implications affect team motivation, lineup decisions, and bullpen usage. Late-season games with playoff implications carry different weight than early-season games.

### 5. VENUE & CONDITIONS
Park factors, weather (wind, temperature, humidity), and indoor/outdoor environment all affect scoring. Coors Field plays very differently from Oracle Park or Tropicana Field.

### 6. PUBLIC ACTION & LINE MOVEMENT
Star pitchers, team brands, and winning streaks drive public action and move lines. The line reflects market sentiment as much as matchup data.

### 7. REST, TRAVEL & SCHEDULE
Travel days, day games after night games, and series positioning (game 1 vs game 4) all affect team freshness and preparation.`;
}

/**
 * MLB Season Awareness — injected at Pass 1 and in Flash research briefing.
 */
export function getMlbSeasonAwareness() {
  return `## MLB SEASON AWARENESS

MLB is a 162-game marathon. Unlike short-sample tournaments, you have months of data — but that data needs context. A team's April performance may not reflect who they are in August. Recent form (last 10-15 games) is often more predictive than season-long averages.

**What matters most in MLB game analysis:**
- **The starting pitcher is the biggest single lever — but it is one lever, not the whole game.** A starter throws roughly 6 of 18 half-innings and faces the lineup only 2-3 times; the offense across all 9 innings, the bullpen's 3 innings, the defense, and plain variance decide the rest. A clear edge on the mound moves the needle, but it rarely settles a game by itself — weigh it honestly against everything else rather than treating it as decisive. Recent form (last 3-5 starts), pitch count trends, and performance against this specific lineup are more telling than season ERA alone.
- **Bullpen state changes daily.** A team's closer pitching 3 of the last 4 days, a setup man on a back-to-back, or a bullpen game after extra innings yesterday — these affect how the game plays out from the 6th inning onward. Investigate availability for both teams.
- **Park factors are real.** Coors Field inflates run totals by 20-30%. Pitcher-friendly parks suppress scoring. Indoor stadiums remove weather variables entirely.
- **Schedule and rest matter.** Day games after night games, long road trips, cross-country travel, and series positioning (rubber games) all affect performance.
- **Division familiarity cuts both ways.** Teams in the same division play 19 times per season. Hitters see the same pitchers repeatedly — familiarity can help the offense or the pitcher depending on adjustments.
- **Baseball has more game-to-game variance than any other major sport.** The best team in baseball wins about 60% of its games — they lose 4 out of every 10. Hot streaks and losing streaks happen to every team multiple times per season. Investigate whether recent form reflects a real trend (pitcher struggles, lineup changes, bullpen fatigue) or normal variance.
- **Expected stats read sustainability and price — not tonight's result.** When a pitcher's ERA outruns his xERA (or a hitter's results outrun their xwOBA), that gap tells you whether the season-long results are built on something solid or fragile, and therefore whether the market price is fair. Treat it as a price question — "is this favorite overpriced because his shiny ERA is fragile?" — not a forecast. Over a single start, variance rules and a pitcher "due to regress" throws gems constantly. Let the gap inform how you read the PRICE, and decide the game itself on the full matchup.
- **One-run games are volatile over small samples.** Teams with extreme records in 1-run games may be overperforming or underperforming their underlying quality. Investigate whether a team's recent results are driven by process or luck.
- **Baseball is more than numbers — the game has momentum.** Which team is rolling right now? Which pitcher is struggling? What happened in this series so far? A team that just got swept plays differently than a team that just swept. These dynamics are real and worth investigating alongside the statistical matchup.`;
}
