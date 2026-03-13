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
  return `### 1. STREAKS & FORM
Streaks move public perception and move lines. What's driving a streak — whether it's sustainable or circumstantial — is not always reflected in the adjustment.

### 2. REST & TRAVEL
Rest and travel narratives are loud and the line always adjusts for them. The size of the adjustment itself varies.

### 3. INJURY IMPACT ON PRICE
FRESH injuries (0-2 games missed) may not be fully reflected in the spread. Established absences are already baked into the line and the team's current stats.

### 4. PUBLIC NARRATIVE VS DATA
Every game has a public storyline that moves betting action and moves lines.

### 5. TRAP AWARENESS
When one side looks too easy, the public has already bet it and the line has already moved.

### 6. UPSET POTENTIAL
The spread implies a gap between these teams. The matchup data may or may not support that gap.

### 7. RETURNING PLAYERS
When a key player returns from absence, the line moves. A return after a longer absence can also change team dynamics in either direction.`;
}

export function getNcaabSpreadFactors() {
  return `### 1. SEEDING & PUBLIC PERCEPTION
Seeds and rankings drive public action in the tournament. The spread reflects seed expectations — but seeds are based on season-long body of work that may or may not reflect how a team is playing right now. The public bets seeds, names, and storylines.

### 2. TOURNAMENT SPREAD SIZING
Tournament games are tighter by nature — the single-elimination format, neutral site, and heightened intensity compress margins. Spreads adjust for this, but the adjustment can be too much or too little in either direction. A tight spread on a game between uneven teams and a large spread in a matchup closer than the seeds suggest are both opportunities that cut both ways.

### 3. CINDERELLA RUNS & THE UPSET MARKET
Any team can make a run in the tournament — low seeds from major conferences and mid-majors alike. The public actively tries to pick upsets, which moves lines. Sometimes so much public money lands on a lower seed that the line shifts to even or favors the "underdog." The team the public treats as the upset special is sometimes the public side.

### 4. STRENGTH OF SCHEDULE & CONFERENCE QUALITY
Season records and efficiency ratings are already baked into the seeding and the spread. The question is whether those numbers translate to this specific tournament matchup — a team built against weaker competition faces a different test than a team battle-tested in a power conference.

### 5. COACHING MATCHUP
Tournament coaching — preparation, in-game adjustments, timeout usage, and managing pressure — carries more weight in a one-and-done format. Some coaches consistently outperform their seed in tournament play.

### 6. ROSTER DEPTH & EXPERIENCE
College rosters are thin — one key absence hits harder than in the pros. Tournament experience matters — teams with players who have been in this environment before can handle the intensity differently than teams here for the first time.

### 7. NEUTRAL SITE & VARIANCE
All tournament games are on neutral courts. The single-elimination format means variance is at its peak — outcomes are volatile game to game, and the spread is a price shaped by public perception as much as the actual matchup.`;
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
The starting pitcher matchup is the primary driver of the opening line in baseball.

### 2. BULLPEN AVAILABILITY & WORKLOAD
Bullpen usage and availability shifts game to game in the WBC due to pitch count limits and rest requirements.

### 3. LINEUP CONSTRUCTION & PLATOON ADVANTAGES
Lineup order and handedness matchups against the opposing starter affect how each lineup profiles against the pitching.

### 4. TOURNAMENT CONTEXT & STAKES
Pool play games, elimination games, and games where teams have already clinched carry different stakes and can affect how teams manage their pitching and lineup.

### 5. VENUE & CONDITIONS
Park factors, weather (wind, temperature), and indoor/outdoor environment all affect scoring. Tokyo Dome plays differently from loanDepot Park in Miami.

### 6. PUBLIC NARRATIVE VS DATA
National pride, star power, and country reputation drive public action on WBC games and can move lines.

### 7. ROSTER FAMILIARITY & DEPTH
WBC rosters are assembled for 2 weeks — players from different leagues and teams have limited time together.`;
}

/**
 * WBC Tournament Awareness — injected at Pass 1 and in Flash research briefing.
 * Gives Gary and Flash essential context about the WBC format, data limitations,
 * and where to focus investigation.
 */
export function getWbcTournamentAwareness() {
  return `## WBC TOURNAMENT AWARENESS

The World Baseball Classic (WBC) is an international baseball tournament held every four years. National teams are assembled from MLB rosters, international leagues, and domestic leagues — players who normally play on different MLB teams come together for 2-3 weeks.

**What makes WBC different from regular season sports:**
- **Small sample size within the tournament.** Pool play is 3-4 games per team. Stats from this tournament alone are extremely limited. MLB career stats and recent MLB season performance are the best available indicators of player quality.
- **Roster construction matters.** Each country assembles its roster differently — some have deep MLB talent at every position, others rely on a few MLB stars supplemented by minor league or international league players. The gap between the top 4-5 hitters and the bottom of the order can be enormous.
- **Pitching management is different.** Teams manage pitch counts carefully early in the tournament to preserve arms for elimination rounds. A starter may go only 4-5 innings in pool play even when pitching well. Bullpen depth and availability change game to game.
- **Narratives, national pride, and tournament storylines carry real weight.** Elimination pressure, historical rivalry, defending champion status, and breakout performances from earlier rounds all shape how teams approach each game. These storylines are not noise — they reflect real motivation and preparation differences.
- **Breaking news and day-of updates are critical.** Lineup confirmations, scratches, and bullpen availability often aren't known until hours before first pitch. Use grounding/search tools aggressively to get the latest information.

**How to investigate WBC games:**
Use MLB career stats as your foundation for player quality, but weight tournament context, pitching availability, and storylines more heavily than you would for a regular season MLB game. The line is set with limited data — which means the market may be pricing narratives more than matchup fundamentals, or may be underpricing a team with less star power but better depth and pitching for this specific game.`;
}
