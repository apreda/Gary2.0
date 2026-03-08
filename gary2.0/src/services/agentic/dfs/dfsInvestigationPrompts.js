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

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES for EVERY team on the slate
- Check injury status for ALL teams — document who is OUT, GTD, Questionable
- Note duration tags: RECENT (0-2 games, <5 days), ESTABLISHED (3-10 games), LONG-TERM (11+ games)
- RECENT absences are the most DFS-relevant — salaries may not fully reflect them
- ESTABLISHED/LONG-TERM absences are already priced into salaries and teammate production

### 2. GAME ENVIRONMENTS
**Tools:** GET_GAME_ENVIRONMENT for each game
- Document O/U, spread, implied totals, pace for every game
- Rank games by total scoring environment (highest O/U = most fantasy opportunity)
- Note the slate average O/U and each game's position relative to it

### 3. USAGE SHIFTS
**Tools:** GET_TEAM_USAGE_STATS for teams with notable absences
- For teams missing key players (especially RECENT absences), investigate who absorbs the workload
- Compare L5 usage/minutes to season averages — rising usage + stable minutes = real shift
- Report the specific numbers: "Player X has 28% USG L5 vs 22% season since Player Y went out"

### 4. PACE MATCHUPS
**Tools:** GET_GAME_ENVIRONMENT (pace data)
- Identify the fastest and slowest pace matchups on the slate
- Combined pace (home + away) indicates possession volume — more possessions = more fantasy opportunity
- Note mismatches: fast team hosting slow team — who controls tempo?

### 5. VALUE-SALARY GAPS
**Tools:** GET_PLAYER_SALARY, GET_TEAM_USAGE_STATS
- Where does recent production (L5 FPTS) diverge from current salary pricing?
- Players with rising roles but lagging salary adjustments represent value
- Players with declining production but high salary represent potential fades

### 6. BLOWOUT RISK
**Tools:** GET_GAME_ENVIRONMENT (spread data)
- Identify games with spreads of 8+ points — starters in blowouts lose late-game minutes
- For large favorites: star players may sit Q4 in blowouts, capping ceiling
- For large underdogs: garbage time can inflate stats but minutes are less predictable

### 7. BACK-TO-BACK SITUATIONS
**Tools:** GET_GAME_ENVIRONMENT (B2B flags)
- Document which teams are on the second night of a B2B
- B2B teams may rest players or manage minutes — check for any rest news
- B2B can also create opportunity: if a star sits, teammates get expanded roles

### 8. STACKING ENVIRONMENTS
No direct tool — SYNTHESIZE from game environment + injury data
- Identify the best stacking candidates: games with HIGH O/U + COMPETITIVE spread + HIGH pace
- Note games with O/U above slate average AND spread under 6 points
- Note which games have both sides with high implied totals (bring-back stack potential)

### 9. BREAKING NEWS
**Tools:** SEARCH_LIVE_NEWS
- Search for late scratches, rest decisions, lineup changes for today's slate
- Focus on news from the last 6 hours — anything not yet reflected in injury reports
- Late-breaking absences are the highest-value DFS information (salaries haven't adjusted)
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NFL DFS INVESTIGATION FACTORS
// ═══════════════════════════════════════════════════════════════════════════════

const NFL_DFS_FACTORS = `## DFS INVESTIGATION CHECKLIST — NFL

Work through each factor below for the ENTIRE SLATE. Do NOT skip any. For each factor, investigate all relevant teams and report findings with specific numbers.

### 1. INJURY LANDSCAPE
**Tools:** GET_TEAM_INJURIES for EVERY team on the slate
- Focus on skill position players: QB, RB1, WR1/WR2/WR3, TE1
- Note duration tags: RECENT vs ESTABLISHED vs LONG-TERM
- QB injuries cascade — backup QBs change the entire passing game environment
- RB1 injuries create clear workload redistribution to RB2

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

### 4. GAME SCRIPT PROJECTIONS
**Tools:** GET_GAME_ENVIRONMENT (spread + implied totals)
- Large favorites (spread 7+) tend toward run-heavy game scripts
- Large underdogs tend toward pass-heavy game scripts (playing from behind)
- Competitive games (spread under 3) tend toward balanced game scripts

### 5. RED ZONE OPPORTUNITIES
No direct tool — SYNTHESIZE from game environments + usage
- Teams with high implied totals project more red zone trips
- TD-dependent positions (RB, goal-line TE) benefit most from high implied totals
- Identify which teams project the most scoring opportunities

### 6. VALUE-SALARY GAPS
**Tools:** GET_PLAYER_SALARY, GET_TEAM_USAGE_STATS
- Where does recent usage (target share, snap count) diverge from salary?
- Newly elevated players (WR3 becomes WR1 due to injury) often have mispriced salaries
- Compare L5 production to current salary — rising production + low salary = value

### 7. STACKING ENVIRONMENTS
No direct tool — SYNTHESIZE from game environment + injury data
- Note games with O/U above slate average AND spread under 6 points
- QB-WR1/WR2 stacks in high-total games link outcomes and raise ceiling
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

### 1. INJURY & USAGE REDISTRIBUTION
**Tools:** GET_TEAM_INJURIES, GET_TEAM_USAGE_STATS for both teams
- Document who is out and their duration (RECENT/ESTABLISHED/LONG-TERM) for both teams
- For RECENT absences: pull usage stats to see who is absorbing workload
- Compare L5 usage/minutes to season averages for key players on both teams
- Surface the specific players whose roles have changed and by how much

### 2. SALARY-VALUE LANDSCAPE
**Tools:** GET_PLAYER_SALARY, GET_PLAYER_SEASON_STATS for key players in this game
- Identify players where L5 production diverges significantly from salary pricing
- Surface the highest-ceiling players at each price tier ($3K-5K, $5K-7K, $7K+)
- Note players priced as if nothing changed despite recent role shifts from injuries or lineup changes

### 3. PACE & SCORING ENVIRONMENT
**Tools:** GET_GAME_ENVIRONMENT
- Document O/U, spread, implied totals, combined pace for this game
- Note whether both teams are above-average pace or if one team controls tempo
- Surface the implied total for each side separately — where does the scoring project?

### 4. PLAYER CEILING SCENARIOS
**Tools:** GET_PLAYER_GAME_LOGS, GET_PLAYER_SEASON_STATS for top 4-6 DFS-relevant players
- Pull recent game logs for the highest-salary and highest-upside players in this game
- Identify ceiling games (best DK FPTS outputs in L5) and what drove them (minutes, usage, opponent)
- Note minutes patterns — consistent 30+ or volatile?

### 5. POSITIONAL MATCHUP ADVANTAGES
**Tools:** GET_MATCHUP_DATA for high-salary players in this game
- Pull DvP data for the highest-salary players at each position in this game
- Identify where one team has a clear defensive weakness at a position
- Cross-reference with the players eligible at that position and their recent production

### 6. STACKING CORRELATION PROFILE
**Tools:** GET_TEAM_USAGE_STATS, GET_GAME_ENVIRONMENT
- Which 2-3 players on each team share the most combined usage (points, FGA, assists)?
- Is this game environment suitable for stacking (high O/U + competitive spread)?
- Note bring-back opportunities — players on the opposing side who benefit from high game total

### 7. BLOWOUT RISK & MINUTES IMPACT
**Tools:** GET_GAME_ENVIRONMENT
- Document the spread — larger spreads indicate higher blowout probability
- For large favorites: starters at risk of reduced Q4 minutes, capping their ceiling
- For large underdogs: players who might get garbage-time stat inflation but with volatile minutes

### 8. BREAKING CONTEXT
**Tools:** SEARCH_LIVE_NEWS
- Search for today's news about both teams in this game
- Focus on lineup confirmations, rest decisions, late scratches
- Any information not yet reflected in the injury reports or salary pricing
`;

// ═══════════════════════════════════════════════════════════════════════════════
// NFL DFS PER-GAME INVESTIGATION FACTORS (Phase 2.5)
// ═══════════════════════════════════════════════════════════════════════════════

const NFL_DFS_GAME_FACTORS = `## DFS PER-GAME RESEARCH CHECKLIST — NFL

For THIS GAME, work through each factor. Report findings with specific numbers for players on BOTH teams.

### 1. INJURY & USAGE REDISTRIBUTION
**Tools:** GET_TEAM_INJURIES, GET_TEAM_USAGE_STATS for both teams
- Document who is out and their duration (RECENT/ESTABLISHED/LONG-TERM) for both teams
- For RECENT absences at skill positions (WR1, RB1, TE1): check target share and snap count redistribution
- Compare recent target share and rush share to season baselines for key players on both teams
- Surface specific players whose workload has changed and by how much

### 2. SALARY-VALUE LANDSCAPE
**Tools:** GET_PLAYER_SALARY, GET_PLAYER_SEASON_STATS for key players in this game
- Identify players where recent production diverges from salary pricing
- Surface highest-ceiling players at each price tier ($3K-5K, $5K-7K, $7K+)
- Note players priced without reflecting recent role changes from injuries or depth chart shifts

### 3. GAME SCRIPT ENVIRONMENT
**Tools:** GET_GAME_ENVIRONMENT
- Document O/U, spread, implied totals for this game
- Note the projected game script: large spread suggests run-heavy favorite vs pass-heavy underdog
- Competitive games (spread under 3) suggest balanced scripts with more passing volume for both teams

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
- Is this game environment suitable for stacking (high O/U + competitive spread)?
- Note bring-back opportunities on the opposing side

### 7. WEATHER & CONDITIONS
**Tools:** SEARCH_LIVE_NEWS
- Search for weather conditions at this game's venue
- Wind 15+ MPH affects passing; rain/snow creates variable conditions
- Dome games are weather-neutral

### 8. BREAKING CONTEXT
**Tools:** SEARCH_LIVE_NEWS
- Search for today's news about both teams in this game
- Focus on inactive lists, late scratches, game-time decisions
- Any information not yet reflected in injury reports or salary pricing
`;

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

const DFS_INVESTIGATION_MAP = {
  NBA: NBA_DFS_FACTORS,
  NFL: NFL_DFS_FACTORS,
};

const DFS_GAME_INVESTIGATION_MAP = {
  NBA: NBA_DFS_GAME_FACTORS,
  NFL: NFL_DFS_GAME_FACTORS,
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
