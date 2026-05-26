/**
 * DFS Investigation Prompts — Per-Sport Factor Lists
 *
 * DFS-specific investigation methodology for the Phase 2 Flash research assistant.
 * Unlike game pick investigation (single-game deep dive), DFS investigation covers
 * an entire SLATE of games — broader but targeted at DFS-relevant factors.
 *
 * Modeled after flashInvestigationPrompts.js but adapted for multi-game slate analysis.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// NBA DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NBA_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — NBA

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

For any factor, you have access to both season-long stats AND recent team stats (GET_TEAM_RECENT_STATS with numGames 1, 3, or 5). You can use these alongside the other tools whenever comparing recent performance to the season baseline would be useful.

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES, GET_DEPTH_CHART for teams with injuries
- Pull injury status for ALL teams on the slate — document who is OUT, GTD, Questionable with duration tags
- **FRESH absences:** Pull the depth chart and game logs for replacement players — investigate what has actually changed in usage and production since the absence began.
- **ESTABLISHED/LONG-TERM absences:** The current stats already reflect the team playing without this player. Pull data to understand the current roster structure.
- **QUESTIONABLE / GTD players:** use SEARCH_LIVE_NEWS to check play status. When a team has multiple Q/GTD players, note how many need to sit for any replacement to have a meaningful role.
- **Returning players:** When a previously-OUT player is now Q/GTD/PROBABLE, investigate what happens to the players who filled their role. Pull game logs to compare their production WITH and WITHOUT the injured player — report the difference.
- **Players on minutes restrictions:** When a player recently returned from injury, investigate whether they are on a minutes limit or have ramped back to full minutes. Pull their last 3 game logs and note the minutes.
- Report findings for all teams

### 2. GAME ENVIRONMENTS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Pull O/U, spread, implied totals, and pace data for every game on the slate
- Report findings for each game

### 3. USAGE & PRODUCTION SHIFTS
**Tools:** GET_TEAM_USAGE_STATS, GET_PLAYER_GAME_LOGS, SEARCH_LIVE_NEWS for key players
- For teams with recent absences: pull usage stats and compare L5 to season for players on those teams
- Pull game logs for key players to see how their production has changed recently
- For any player whose L5 production diverges significantly from their season average, investigate the context — teammate absences, opponent quality, role changes
- For replacement players who have taken over a role due to injury: investigate whether their production has stabilized over multiple games or is still volatile. Note how many games they've played in the role.
- Investigate whether any usage changes are structural (the team is using them differently going forward) or situational (temporary circumstances that may not apply tonight)
- Note any 10-day contract or two-way players in the pool — investigate their recent minutes patterns and whether their role tonight is stable
- When game logs alone don't tell the full story (minutes restrictions, coaching rotation decisions, lineup changes, role shifts), use SEARCH_LIVE_NEWS to find what beat reporters are saying about the player's expected role tonight. If you can't find reliable context on a player's role tonight, report that the role is uncertain.
- Report findings for all relevant teams

### 4. PACE & TEMPO
**Tools:** GET_GAME_ENVIRONMENT, GET_TEAM_RECENT_STATS
- Pull pace and tempo data for all teams on the slate — season and recent
- Report findings for each game

### 5. PLAYER FORM & SHOOTING
**Tools:** GET_PLAYER_GAME_LOGS, GET_PLAYER_SEASON_STATS for key players across the slate
- Pull individual player game logs and season stats for key players on the slate
- Compare each player's recent production to their season baseline
- When a player has one standout game in their recent logs, investigate whether their minutes or usage changed (structural shift) or whether it was a single-game outlier at normal minutes
- Check the opponents faced in the L5 window and note the quality of those matchups. Name the opponents.
- Report findings for key players

### 6. MATCHUP ADVANTAGES
**Tools:** GET_MATCHUP_DATA for key players across the slate
- Pull DvP (defense vs position) data for key players on each team
- Investigate where each team is weakest defensively and which opposing players could benefit
- Report findings for key matchups

### 7. TEAM CONSISTENCY & GAME CONTEXT
**Tools:** GET_TEAM_RECENT_STATS, GET_LAST_GAME_BOX_SCORE
- Pull recent team stats (L1, L3, L5) for teams on the slate
- Investigate each team's consistency — how steady or volatile has their production been across the season and in recent games
- Pull last game box scores to see who played, their minutes, and their production
- Report findings for all teams

### 8. SCHEDULE & REST
**Tools:** GET_SCHEDULE_CONTEXT, GET_GAME_ENVIRONMENT (B2B flags)
- Pull schedule context for all teams — who is on a B2B, who plays tomorrow, recent game density
- Report findings for all teams

### 9. STACKING ENVIRONMENTS
- Synthesize from game environment + injury data across the slate
- For each game, report the O/U, spread, implied totals, pace, and injury context — note which games have environments that data suggests could support concentrated roster spots
- Report findings for each game

### 10. RETURNING PLAYERS
**Tools:** GET_TEAM_INJURIES, GET_PLAYER_GAME_LOGS, GET_TEAM_USAGE_STATS, SEARCH_LIVE_NEWS
- Identify any player who was recently OUT but is now QUESTIONABLE, GTD, or PROBABLE — these are potential returns
- For each returning player: pull their season stats and the team's L5 stats during the absence. Compare teammates' L5 production to their season averages — report the difference.
- Name which teammates' stats changed during the absence and by how much
- Use SEARCH_LIVE_NEWS to confirm whether the returning player is expected to play tonight
- Report findings for all relevant teams

### 11. STAT WINDOW CONTEXT
- Synthesize from your injury and usage findings across the slate
- For each team, flag if ANY of these conditions affect how L5 data should be interpreted tonight:
  (a) A key player was out during L5 but may return tonight
  (b) A key player played during L5 but is OUT tonight
  (c) 3+ of the L5 games were against notably strong or weak defenses
  (d) A player had a single outlier game in L5 that significantly affects the average
- For each flag, name the player, the stat difference, and what the season average shows as comparison
- Report findings for all relevant teams

### 12. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for late scratches, rest decisions, lineup changes for today's slate
- Focus on recent news that may not yet be reflected in injury reports or salary pricing
- Report findings
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NFL DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NFL_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — NFL

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES for EVERY team on the slate
- Focus on skill position players: QB, RB1, WR1/WR2/WR3, TE1
- Note duration tags: FRESH vs ESTABLISHED vs LONG-TERM
- **FRESH absences:** Investigate who is filling the role — check game logs and target/rush share to see what has actually changed since the absence.
- **ESTABLISHED/LONG-TERM absences:** The current stats already reflect the team playing without this player.
- **QUESTIONABLE / GTD players:** use SEARCH_LIVE_NEWS to check play status. When a team has multiple Q/GTD players, note how many need to sit for any replacement to have a meaningful role.
- Note findings for all teams

### 2. GAME ENVIRONMENTS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Document O/U, spread, implied totals for every game
- Rank games by implied total (both sides) — highest-scoring projected games have the most fantasy equity
- Note the slate average O/U and each game's position relative to it

### 3. USAGE SHIFTS
**Tools:** GET_TEAM_USAGE_STATS for teams with notable absences
- When a WR1 is out, target share redistributes — investigate who benefits
- When an RB1 is out, rush share goes to backup — check snap count trends
- Compare recent target share / rush share to season baselines

### 4. GAME SCRIPT CONTEXT
**Tools:** GET_GAME_ENVIRONMENT (spread + implied totals)
- Document the spread and implied totals for each game
- Note what the spread and implied totals suggest about each team's likely offensive approach — then look at recent team game logs to see how each team has actually played in similar situations
- Do not assume game script from spread alone; verify with recent production data

### 5. RED ZONE OPPORTUNITIES
No direct tool — SYNTHESIZE from game environments + usage
- Check which teams have been generating the most scoring opportunities in recent games — red zone carries, targets, snap counts near the goal line
- Note implied totals as one signal; verify against actual recent production data
- Identify which teams project the most scoring opportunities

### 6. USAGE & PRODUCTION TRENDS
**Tools:** GET_PLAYER_SALARY, GET_TEAM_USAGE_STATS
- Pull recent usage data (target share, snap count) for key players and compare to their season baselines
- Note any players whose recent role has changed — investigate whether the change is structural or situational
- If a player's recent production changed while a teammate was absent, note the absent teammate and compare the player's production with and without that teammate using game log data
- If a player had one outlier game in L5, note the outlier and what the remaining games look like

### 7. STACKING ENVIRONMENTS
No direct tool — SYNTHESIZE from game environment + injury data
- Note games with O/U above slate average AND spread under 6 points
- QB-WR1/WR2 stacks link outcomes — evaluate the data for each potential stack: target share, snap count, red zone usage
- Bring-back potential: games where both offenses project to score create stack + bring-back opportunity

### 8. WEATHER
**Tools:** SEARCH_LIVE_NEWS
- Search for weather conditions at outdoor game venues for today
- Wind 15+ MPH affects passing conditions
- Rain/snow creates variable conditions
- Dome games are weather-neutral

### 9. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for today's inactive lists, late scratches, and game-time decisions
- NFL inactive lists are released ~90 minutes before kickoff — this is premium DFS information
- Focus on skill position inactives that create workload redistribution
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NBA DFS PER-GAME INVESTIGATION FACTORS (Phase 2.5)
// ═══════════════════════════════════════════════════════════════════════════════

const NBA_DFS_GAME_FACTORS = `## DFS PER-GAME RESEARCH CHECKLIST — NBA

For THIS GAME, work through each factor. Report findings with specific numbers for players on BOTH teams.

For any factor, you have access to both season-long stats AND recent team stats (GET_TEAM_RECENT_STATS with numGames 1, 3, or 5). You can use these alongside the other tools whenever comparing recent performance to the season baseline would be useful.

### 1. INJURY & ROSTER CONTEXT
**Tools:** GET_TEAM_INJURIES, GET_DEPTH_CHART, GET_TEAM_USAGE_STATS for both teams
- Pull injury status for both teams with duration tags
- **FRESH absences:** Pull the depth chart and game logs for the replacement player(s) — investigate what has actually changed in usage and production since the absence began.
- **ESTABLISHED/LONG-TERM absences:** The current stats already reflect the team playing without this player. Pull data to understand the current roster structure.
- **QUESTIONABLE / GTD players:** use SEARCH_LIVE_NEWS to check play status. When a team has multiple Q/GTD players, note how many need to sit for any replacement to have a meaningful role.
- **Returning players:** When a previously-OUT player is now available, investigate how it changes the role of players who filled in. Pull game logs with and without the injured player.
- Report findings for both teams

### 2. PLAYER STATS & RECENT FORM
**Tools:** GET_PLAYER_GAME_LOGS, GET_PLAYER_SEASON_STATS, SEARCH_LIVE_NEWS for key players in this game
- Pull season stats and recent game logs for key players on both teams
- Compare each player's recent production to their season baseline
- When a player has one standout game in their recent logs, investigate whether their minutes or usage changed (structural shift) or whether it was a single-game outlier at normal minutes
- Check the opponents in each player's L5 and note the quality of those matchups. Name the opponents.
- For any player whose L5 production diverges significantly from their season average, investigate what changed — teammate absences, opponent quality, role changes. Report the context.
- Investigate minutes patterns and consistency for key players — note any players whose minutes have been trending up or down over their last 5 games
- For players whose role expanded due to a teammate's injury: investigate whether that teammate is playing tonight. If so, pull the game logs since the return to see how the role has actually changed.
- When the game logs raise questions you can't answer from stats alone (minutes restrictions, rotation changes, coaching decisions about a player's role tonight), use SEARCH_LIVE_NEWS to check what beat reporters are reporting. If reliable context isn't available, report that the player's role tonight is uncertain.
- Report findings for both teams

### 3. GAME ENVIRONMENT
**Tools:** GET_GAME_ENVIRONMENT, GET_TEAM_RECENT_STATS
- Pull O/U, spread, implied totals, and pace data for this game
- Pull recent team stats (L1, L3, L5) for both teams to see their current offensive and defensive production
- Report findings for both teams

### 4. OPPONENT DEFENSE & MATCHUPS
**Tools:** GET_MATCHUP_DATA for key players in this game
- Pull DvP (defense vs position) data for players on both teams
- Investigate where each team is weakest defensively and which opposing players are positioned at those spots
- Report findings for both teams

### 5. TEAM CONSISTENCY & GAME SCRIPT
**Tools:** GET_TEAM_RECENT_STATS, GET_LAST_GAME_BOX_SCORE
- Pull recent team stats and last game box scores for both teams
- Investigate each team's consistency — how steady or volatile has their fantasy-relevant production been
- Investigate how each team has performed against different levels of competition
- Report findings for both teams

### 6. STACKING CONTEXT
**Tools:** GET_TEAM_USAGE_STATS, GET_GAME_ENVIRONMENT
- Pull usage stats for both teams to see which players share the most combined production
- Pull game environment data to assess the scoring environment
- Report findings for both teams

### 7. SCHEDULE & REST CONTEXT
**Tools:** GET_SCHEDULE_CONTEXT, GET_GAME_ENVIRONMENT
- Pull schedule context for both teams — B2B status, recent game density, next game
- Report findings for both teams

### 8. RETURNING PLAYERS
**Tools:** GET_TEAM_INJURIES, GET_PLAYER_GAME_LOGS, GET_TEAM_USAGE_STATS, SEARCH_LIVE_NEWS
- Check if either team has a player who was recently OUT but is now Q/GTD/PROBABLE (potential return)
- For each returning player: compare teammates' L5 stats (during the absence) to their season averages. Report the difference.
- Use SEARCH_LIVE_NEWS to confirm expected play status
- Report findings for both teams

### 9. STAT WINDOW CONTEXT
- Synthesize from your findings for this game:
  (a) Any teammate whose L5 was during a key player's absence — compare L5 to season
  (b) Any player who played in L5 but is OUT tonight — note that teammates' L5 doesn't include this absence
  (c) Opponent quality in L5 — note the strength of recent opponents
  (d) Single-game outliers in L5 — note the outlier and what the remaining games show
- For each flag, name the player and the stat difference
- Report findings for both teams

### 10. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for today's news about both teams in this game
- Focus on lineup confirmations, rest decisions, late scratches
- Report findings
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NFL DFS PER-GAME INVESTIGATION FACTORS (Phase 2.5)
// ═══════════════════════════════════════════════════════════════════════════════

const NFL_DFS_GAME_FACTORS = `## DFS PER-GAME RESEARCH CHECKLIST — NFL

For THIS GAME, work through each factor. Report findings with specific numbers for players on BOTH teams.

### 1. INJURY & USAGE REDISTRIBUTION
**Tools:** GET_TEAM_INJURIES, GET_TEAM_USAGE_STATS for both teams
- Document who is out and their duration (FRESH/ESTABLISHED/LONG-TERM) for both teams
- **FRESH absences at skill positions (WR1, RB1, TE1):** Check target share and snap count — investigate what has actually changed in usage and production since the absence.
- **ESTABLISHED/LONG-TERM absences:** The current stats already reflect the team playing without this player.
- **QUESTIONABLE / GTD players:** use SEARCH_LIVE_NEWS to check play status. Note how many need to sit for any replacement to have a meaningful role.
- Surface specific players whose workload has changed and by how much

### 2. PLAYER PRODUCTION LANDSCAPE
**Tools:** GET_PLAYER_SALARY, GET_PLAYER_SEASON_STATS for key players in this game
- Pull salary and recent production data for key players in this game
- Note any players whose recent usage or production has changed significantly from their season baseline — investigate why

### 3. GAME SCRIPT ENVIRONMENT
**Tools:** GET_GAME_ENVIRONMENT
- Document O/U, spread, implied totals for this game
- Document the spread and implied totals; note what they suggest about each team's likely approach
- Check recent game logs to see how each team has actually played — don't assume game script from spread alone

### 4. PLAYER CEILING SCENARIOS
**Tools:** GET_PLAYER_GAME_LOGS, GET_PLAYER_SEASON_STATS for top 4-6 DFS-relevant players
- Pull recent game logs for highest-salary and highest-upside players in this game
- Identify ceiling games and what drove them (targets, carries, touchdowns, yardage)
- Note snap count trends — consistent 80%+ or volatile?

### 5. TARGET/RUSH SHARE MATCHUP
**Tools:** GET_MATCHUP_DATA for high-salary players in this game
- Pull defensive matchup data for key offensive players
- Identify where one defense allows disproportionate production to a position group
- Cross-reference with the players eligible at that position and their recent usage

### 6. STACKING CORRELATION PROFILE
**Tools:** GET_TEAM_USAGE_STATS, GET_GAME_ENVIRONMENT
- Which QB + pass catchers on each team combine for the most aerial production?
- Evaluate the game environment data — O/U, pace, implied totals, injury context — and report what the data shows about this game's environment for correlation
- Note bring-back opportunities on the opposing side

### 7. WEATHER & CONDITIONS
**Tools:** SEARCH_LIVE_NEWS
- Search for weather conditions at this game's venue
- Wind 15+ MPH affects passing; rain/snow creates variable conditions
- Dome games are weather-neutral

### 8. RETURNING PLAYERS & STAT WINDOW CONTEXT
**Tools:** GET_TEAM_INJURIES, GET_PLAYER_GAME_LOGS, GET_TEAM_USAGE_STATS, SEARCH_LIVE_NEWS
- Check if either team has a skill player who was recently OUT but is now Q/GTD/PROBABLE (potential return)
- For each returning player: compare teammates' L5 stats (during the absence) to their season averages. Report the difference.
- For any player newly OUT this week who played in L5: note that teammates' L5 doesn't include this absence yet
- Use SEARCH_LIVE_NEWS to confirm expected play status for any returning players
- Report findings for both teams

### 9. BREAKING CONTEXT
**Tools:** SEARCH_LIVE_NEWS
- Search for today's news about both teams in this game
- Focus on inactive lists, late scratches, game-time decisions
- Any information not yet reflected in injury reports or salary pricing
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MLB DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const MLB_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — MLB

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

### 1. STARTING PITCHER MATCHUPS
**Tools:** SEARCH_LIVE_NEWS, GET_PLAYER_SEASON_STATS, GET_PLAYER_GAME_LOGS for each starting pitcher
- Identify the confirmed starting pitcher for EVERY game on the slate
- Pull season stats for each starter: ERA, WHIP, K/9, IP/GS, HR/9, FIP, xFIP
- Pull recent game logs (L3-L5 starts) — note trends in pitch count, innings depth, strikeout rate
- Identify which starters are elite (suppressing offense) and which are hittable (boosting opposing bats)
- Note handedness (L/R) for each starter — this drives platoon splits for opposing hitters
- Report findings for every game

### 2. LINEUP ORDER & BATTING POSITION
**Tools:** SEARCH_LIVE_NEWS, GET_DEPTH_CHART for each team
- Search for confirmed lineup cards for today's games — lineup order is THE driver of plate appearances
- Top-of-order hitters (1-5) get 0.5-1.0 more PA per game than bottom-of-order (7-9)
- Note any lineup shuffles from recent games — a hitter moved up in the order is getting more opportunity
- Identify leadoff hitters (R/SB upside) and cleanup hitters (RBI upside)
- Report findings for all teams

### 3. PARK FACTORS & WEATHER
**Tools:** SEARCH_LIVE_NEWS, GET_GAME_ENVIRONMENT
- Pull park factors for each venue on the slate — HR factor, runs factor, handedness splits
- Hitter-friendly parks (Coors, Great American, Yankee Stadium RF porch) inflate ceiling
- Pitcher-friendly parks (Dodger Stadium, Oracle Park, Petco) suppress scoring
- Search for weather at outdoor venues: wind direction and speed (out = HR boost, in = suppression), temperature (warm = ball carries), humidity, rain risk
- Dome/retractable roof games are weather-neutral
- Report findings for each game

### 4. BULLPEN AVAILABILITY & EXPLOITATION
**Tools:** SEARCH_LIVE_NEWS, GET_TEAM_INJURIES, GET_PLAYER_GAME_LOGS for key relievers
- Check each team's bullpen status — who pitched yesterday, who pitched back-to-back days, who is unavailable
- Teams with taxed bullpens are vulnerable to late-game scoring — hitters on the opposing team benefit
- Identify teams likely to go to weaker middle relievers early if the starter has a short leash
- Note closer availability for save situation context
- Report findings for all teams

### 5. PLATOON ADVANTAGES (L/R SPLITS)
**Tools:** GET_PLAYER_SEASON_STATS, GET_MATCHUP_DATA for key hitters
- For each game, cross-reference the opposing starter's handedness with hitter splits
- Hitters with strong opposite-hand splits against the starter are platoon advantages (e.g., LHH vs RHP)
- Pull split stats: AVG, OPS, HR rate for L vs R for key hitters on the slate
- Identify hitters in the lineup who are NOT everyday players but are starting due to a platoon matchup — these are often underpriced
- Report findings for key matchups

### 6. STACKING STRATEGY
**Tools:** GET_GAME_ENVIRONMENT, GET_DEPTH_CHART, GET_PLAYER_SEASON_STATS
- Identify the best team stacks on the slate: teams facing hittable pitchers in hitter-friendly environments
- Note lineup order adjacency — stacking consecutive hitters (e.g., 2-3-4-5) maximizes correlation
- Identify secondary stacks: teams in high-total games that may be less popular but still have upside
- For each potential stack, report: opposing starter stats, park factor, game total, implied runs
- Report findings for top stacking candidates

### 7. GAME TOTALS & IMPLIED RUNS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Pull O/U, spread, and implied team totals for every game on the slate
- Rank games by total and by each team's implied runs
- High-total games (9+) are the primary DFS environments — more runs = more fantasy points across the board
- Low-total games (under 7) are pitcher-friendly — target SPs from those games
- Note which teams have the highest implied run totals — these are the primary hitting targets
- Report findings for each game

### 8. PITCHER WORKLOAD & PITCH COUNT
**Tools:** GET_PLAYER_GAME_LOGS for starting pitchers, SEARCH_LIVE_NEWS
- Pull recent game logs for each starter — note pitch counts, innings pitched, and whether they've been going deep
- Starters on pitch count limits, returning from injury, or consistently pulled early (under 5 IP) lead to early bullpen exposure for both teams
- Search for news on any pitch count restrictions, innings limits, or opener situations
- Short outings from starters = more bullpen innings = more volatile scoring environments
- Report findings for each game

### 9. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES, SEARCH_LIVE_NEWS
- Pull injury reports for all teams on the slate
- Focus on everyday lineup players — who is OUT, DTD, or day-to-day
- For each absence, note who moves into the lineup or moves up in the order
- Search for late scratches and game-time decisions
- Report findings for all teams

### 10. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for late lineup changes, pitching changes, weather delays, and any other breaking information
- Focus on confirmed lineups, late scratches, and any information not yet reflected in pricing
- Report findings
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MLB DFS PER-GAME INVESTIGATION FACTORS (Phase 2.5)
// ═══════════════════════════════════════════════════════════════════════════════

const MLB_DFS_GAME_FACTORS = `## DFS PER-GAME RESEARCH CHECKLIST — MLB

For THIS GAME, work through each factor. Report findings with specific numbers for players on BOTH teams.

### 1. STARTING PITCHER MATCHUP
**Tools:** GET_PLAYER_SEASON_STATS, GET_PLAYER_GAME_LOGS, SEARCH_LIVE_NEWS for both starters
- Pull full season stats for both starters: ERA, WHIP, K/9, BB/9, HR/9, FIP, xFIP, IP/GS
- Pull L3-L5 game logs for both starters — note pitch count trends, innings depth, recent form
- Compare recent form to season baseline — is either pitcher trending better or worse?
- Note handedness for both starters and how it affects opposing lineups
- Report findings for both starters

### 2. LINEUP ORDER & PLATE APPEARANCES
**Tools:** SEARCH_LIVE_NEWS, GET_DEPTH_CHART for both teams
- Search for confirmed lineup cards for this game
- Note batting order position for each key hitter — top of order gets more PAs
- Identify any lineup changes from recent games (players moved up/down, new starters)
- Report findings for both teams

### 3. PLATOON SPLITS & MATCHUP ADVANTAGES
**Tools:** GET_PLAYER_SEASON_STATS, GET_MATCHUP_DATA for key hitters
- Cross-reference each hitter's L/R splits against the opposing starter's handedness
- Pull split stats (AVG, OPS, HR rate vs LHP/RHP) for key hitters
- Identify the hitters with the strongest platoon advantage in this game
- Report findings for both teams

### 4. PARK & WEATHER CONDITIONS
**Tools:** GET_GAME_ENVIRONMENT, SEARCH_LIVE_NEWS
- Pull park factors for this venue — HR factor, runs factor, handedness splits
- Search for weather: wind direction/speed, temperature, precipitation risk
- Note how the venue and conditions affect ceiling projections for hitters and pitchers
- Report findings for this game

### 5. BULLPEN STATE
**Tools:** SEARCH_LIVE_NEWS, GET_PLAYER_GAME_LOGS for key relievers
- Check bullpen usage for both teams over the last 2-3 days
- Identify which relievers are unavailable or on back-to-back days
- Note if either starter has been going short recently (under 5 IP) — increases bullpen exposure
- Report findings for both teams

### 6. GAME ENVIRONMENT & SCORING CONTEXT
**Tools:** GET_GAME_ENVIRONMENT
- Pull O/U, spread, implied team totals for this game
- Note where this game's total sits relative to the slate average
- Identify which team's bats are projected for more scoring
- Report findings for this game

### 7. STACKING & CORRELATION
**Tools:** GET_DEPTH_CHART, GET_PLAYER_SEASON_STATS, GET_GAME_ENVIRONMENT
- Identify the best consecutive hitter groupings in each lineup for stack potential
- Note which hitters in the lineup are correlated (adjacent batting order, same side of lineup)
- Assess the game environment for bring-back potential (both offenses projected to score)
- Report findings for both teams

### 8. INJURY & ROSTER CONTEXT
**Tools:** GET_TEAM_INJURIES, SEARCH_LIVE_NEWS
- Pull injury reports for both teams — who is OUT, DTD, or day-to-day
- Note any recent call-ups or roster moves that affect today's lineup
- Search for late scratches or game-time decisions
- Report findings for both teams

### 9. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for today's news about both teams in this game
- Focus on confirmed lineups, pitching changes, late scratches
- Report findings
`;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

const DFS_INVESTIGATION_MAP = {
  NBA: NBA_DFS_FACTORS,
  NFL: NFL_DFS_FACTORS,
  MLB: MLB_DFS_FACTORS,
};

const DFS_GAME_INVESTIGATION_MAP = {
  NBA: NBA_DFS_GAME_FACTORS,
  NFL: NFL_DFS_GAME_FACTORS,
  MLB: MLB_DFS_GAME_FACTORS,
};

/**
 * Get the DFS slate-level investigation methodology for a sport.
 *
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @returns {string} Investigation methodology string, or empty string if sport not supported
 */
export function getDFSInvestigationPrompt(sport) {
  const key = (sport || '').toUpperCase();
  return DFS_INVESTIGATION_MAP[key] || '';
}

/**
 * Get the DFS per-game investigation methodology for a sport (Phase 2.5).
 *
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @returns {string} Per-game investigation methodology string, or empty string if sport not supported
 */
export function getDFSGameInvestigationPrompt(sport) {
  const key = (sport || '').toUpperCase();
  return DFS_GAME_INVESTIGATION_MAP[key] || '';
}
