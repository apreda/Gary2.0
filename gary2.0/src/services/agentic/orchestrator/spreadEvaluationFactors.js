/**
 * Spread Evaluation Factors — Sport-specific factor checklists for Pass 1
 *
 * Each function returns a string of concise awareness factors for Gary's
 * spread evaluation. 2-3 sentences per factor — no investigation steps,
 * no stat names, no methodology. Gary's HIGH thinking mode handles reasoning.
 *
 * Sport-keyed: getNbaSpreadFactors(), getNflSpreadFactors(), etc.
 */

export function getNbaSpreadFactors() {
  return `Narrative factors — back-to-backs, streaks, rest, travel, revenge spots, hot/cold stretches — are context for the game. They are not edges and they are not reasons by themselves to pick a side. Every bettor in the world can see these factors. Sometimes the favorite is the right side. Sometimes the underdog is. It depends entirely on THIS game, these players, and this matchup.`;
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

// (Restored Aug 18 2026 — the June engine returns for MLB games. These are the
// founder's Jul 22 item-by-item survivors, verbatim.)
export function getMlbSpreadFactors() {
  return `A baseball game is not decided by a checklist, and the same two or three arguments do not decide every game. The starting pitchers are one piece: nine innings of lineups, the bullpens behind both starters, the park and its conditions, the schedule and series situation, the stakes, and plain variance decide the rest. Which of those matters TONIGHT is the actual question.

Some nights one thing decides it; some nights it's the whole picture. Lead with what YOUR investigation of this game surfaces — not with what usually matters in baseball — and keep findings factual and symmetric across both teams. If you find yourself building tonight's case out of the same parts as yesterday's, that is a sign you are reciting, not reading.`;
}

/**
 * MLB Awareness — injected at Pass 1.
 * Jul 22 (founder, knowing item-by-item choice after reading the full prompt
 * surface): ONLY the variance bullet and the momentum/streaks bullet survive —
 * everything explaining how baseball works to the model was removed ("why do
 * we have to tell a nearly super smart intelligence how starting pitching
 * works"). The data on the desk carries series state, bullpen usage, parks,
 * schedule; the model judges.
 */
export function getMlbSeasonAwareness() {
  return `## MLB SEASON AWARENESS

- **Baseball runs on heavy game-to-game variance.** The best team in baseball wins about 60% of its games — they lose 4 out of every 10. Hot streaks and losing streaks happen to every team multiple times per season. Investigate whether recent form reflects a real trend (pitcher struggles, lineup changes, bullpen fatigue) or normal variance.`;
}



/**
 * Football season awareness (founder GO, Aug 24 — parity with MLB's
 * getMlbSeasonAwareness). Date-derived CALENDAR FACTS only — where the
 * season is and what that phase is known for. Awareness, never conclusions.
 */
export function getFootballSeasonAwareness(sport = 'NFL', now = new Date()) {
  const isCollege = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' }).format(now));
  const lines = [`## ${isCollege ? 'NCAAF' : 'NFL'} SEASON AWARENESS`];

  if (month === 8) {
    lines.push(isCollege
      ? '- **Late August: opening weeks.** Rosters carry heavy transfer-portal and freshman turnover from last season; prior-season team identities may not describe this roster. Investigate who is actually on the field now.'
      : '- **August is preseason.** Playing-time plans, not talent gaps, decide these games. Starter-phase and reserve-phase evidence are different currencies — the scout report labels which phase each fact belongs to.');
  } else if (month === 9) {
    lines.push('- **September: small-sample season.** Every team stat rests on a handful of games; one blowout can distort a per-game average. Prior-season data still carries real signal this early — weigh both, and investigate which one describes the roster on the field this week.');
  } else if (month === 10 || month === 11) {
    lines.push('- **Mid-season: the sample is real now.** Current-season unit stats describe this team better than last year does. Injuries accumulate; depth gets tested; investigate how each roster has changed since September.');
    if (isCollege && month === 11) lines.push('- **November: conference races and rivalry games.** Stakes diverge sharply between teams — investigate what each program is playing for.');
  } else if (month === 12 || month === 1) {
    lines.push(isCollege
      ? '- **Bowl/CFP season.** Opt-outs, transfers, coaching changes, and long layoffs reshape rosters between the regular season and the bowl. The November version of a team may not be the one playing tonight — verify who plays.'
      : '- **Late season.** Playoff positioning diverges: some teams fight for seeding, others are eliminated, and in Week 18 clinched teams may rest starters. Weather is a real factor in outdoor venues. Investigate what this game means to each side and who actually plays.');
  } else {
    lines.push('- Offseason-adjacent date: verify the game context from the scout report rather than assuming a season phase.');
  }
  // The football week runs on unequal rest by design.
  lines.push('- **Rest is structural in football.** Thursday, Monday, and bye-week schedules create real rest gaps — the scout report carries each team\'s days of rest; treat equal rest as no factor at all.');
  return lines.join('\n');
}
