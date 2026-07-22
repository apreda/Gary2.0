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
Established absences are already in the team's stats and the line. FRESH/SHORT-TERM absences may not be fully reflected in the price yet.

### 7. VARIANCE & CLOSE-GAME RECORDS
Hockey runs on heavy single-game variance. Teams can sustain shooting percentages, save percentages, and close-game records that the underlying process doesn't support. PDO (shooting% + save%) shows where results and process diverge.`;
}

export function getNflSpreadFactors() {
  return `### 1. QB STATUS & INJURY TIMING
Quarterback status moves NFL lines. Fresh uncertainty can change the number quickly, while long-running absences are usually reflected in the team's baseline performance.

### 2. TRENCHES & PRESSURE PROFILE
Offensive line vs pass rush and run-block vs front-seven matchups often define game shape before skill-position production shows up.

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
  return `A baseball game is not decided by a checklist, and the same two or three arguments do not decide every game. The starting pitchers are one piece: nine innings of lineups, the bullpens behind both starters, the park and its conditions, the schedule and series situation, the stakes, and plain variance decide the rest. Which of those matters TONIGHT is the actual question.

Some nights one thing decides it; some nights it's the whole picture. Lead with what YOUR investigation of this game surfaces — not with what usually matters in baseball — and keep findings factual and symmetric across both teams. If you find yourself building tonight's case out of the same parts as yesterday's, that is a sign you are reciting, not reading.`;
}

/**
 * MLB Awareness — injected at Pass 1 and in Flash research briefing.
 * Jul 22 (founder, knowing item-by-item choice after reading the full prompt
 * surface): ONLY the variance bullet and the momentum/streaks bullet survive —
 * everything explaining how baseball works to the model was removed ("why do
 * we have to tell a nearly super smart intelligence how starting pitching
 * works"). The data on the desk carries series state, bullpen usage, parks,
 * schedule; the model judges.
 */
export function getMlbSeasonAwareness() {
  return `## MLB SEASON AWARENESS

- **Baseball runs on heavy game-to-game variance.** The best team in baseball wins about 60% of its games — they lose 4 out of every 10. Hot streaks and losing streaks happen to every team multiple times per season. Investigate whether recent form reflects a real trend (pitcher struggles, lineup changes, bullpen fatigue) or normal variance.
- **Baseball is more than numbers — the game has momentum.** Which team is rolling right now? Which pitcher is struggling? What happened in this series so far? A team that just got swept plays differently than a team that just swept. Streaks are real currency in this sport — riding a hot team against a cold one is legitimate baseball judgment; weigh it against tonight's matchup. These dynamics are real and worth investigating alongside the statistical matchup.`;
}
